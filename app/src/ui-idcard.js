/* ID card: scan the EWU student ID card (camera or upload) → OCR reads the ID + name → the code goes to that
   student's EWU email (login), and a 3D "student pass" lives in the account. Card images stay on this device. */
import qrcode from "qrcode-generator";
import { getBlob, setBlob, delBlob, fileToDataURL } from "./blobstore.js";

const ID_RE = /(\d{4})\s*[-–—_.]\s*(\d)\s*[-–—_.]\s*(\d{2})\s*[-–—_.]\s*(\d{3})/;
const SKIP = /\b(EAST|WEST|UNIVERSITY|STUDENT|IDENTITY|CARD|VALID|DEPT|DEPARTMENT|BLOOD|PROGRAM|ISSUE|EXPIRE|SIGNATURE|REGISTRAR|DHAKA|AFTABNAGAR|WWW|EWUBD|ID\b|NO\b)/i;
const PROGRAMS = { "60": "CSE" }; // ID program codes we're sure of (2024-1-60-123 = CSE)

/* Pull ID, name, programme and validity out of OCR text. Exported for unit tests. */
export function parseCardText(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.replace(/[|_~`"“”]+/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
  const m = String(text).match(ID_RE), id = m ? `${m[1]}-${m[2]}-${m[3]}-${m[4]}` : "";
  let name = "";
  const labelled = lines.map((l) => l.match(/^name\s*[:.\-]?\s*(.+)$/i)).find(Boolean);
  if (labelled) name = labelled[1];
  else name = lines.filter((l) => /^[A-Za-z][A-Za-z .'-]{4,40}$/.test(l) && !SKIP.test(l) && l.split(" ").length >= 2).sort((a, b) => b.length - a.length)[0] || "";
  name = name.replace(/[^A-Za-z .'-]/g, "").replace(/\s+/g, " ").trim().replace(/\b\w+/g, (w) => (w.length > 2 && w === w.toUpperCase() ? w[0] + w.slice(1).toLowerCase() : w));
  const prog = (String(text).match(/\b(B\.?\s?Sc\.?|BBA|BSS|B\.?\s?A\.?|MBA|EMBA|B\.?\s?Pharm|LL\.?\s?B|M\.?\s?Sc|MSS|M\.?\s?A)\b[^\n]{0,40}/i) || [""])[0].trim();
  const dept = (String(text).match(/\b(CSE|EEE|ECE|ICE|Civil|Pharmacy|English|Economics|Law|Sociology|GEB|Mathematics|Information Studies|Business Administration)\b/i) || [""])[0] || (id ? PROGRAMS[id.split("-")[2]] || "" : "");
  const valid = (String(text).match(/valid\w*\s*(?:up\s*to|till|until|thru|through)?\s*[:.\-]?\s*([A-Za-z0-9 ,\/.\-]{4,20})/i) || ["", ""])[1].trim();
  return { id, name, program: prog, dept, valid };
}

export function install(ctx) {
  const { pages, icon, esc, $, $$, toast, openModal, closeModal, modalHead, confirmModal } = ctx;
  const S = () => ctx.S;
  const imgs = { scan: null, photo: null, loaded: false };
  const loadImgs = async () => { imgs.scan = await getBlob("id:scan"); imgs.photo = await getBlob("id:photo"); imgs.loaded = true; };
  let worker = null;
  async function ocr(dataUrl, onProgress) {
    if (!worker) { const T = await import("tesseract.js"); worker = await T.createWorker("eng", 1, { logger: (m) => m.status === "recognizing text" && onProgress(m.progress) }); }
    const { data } = await worker.recognize(dataUrl);
    return data.text || "";
  }

  /* ── Scan flow: pick/take photo → read → confirm. Resolves with the card details or null. ── */
  function scan({ title = "Scan your EWU ID card", cta = "Continue" } = {}) {
    return new Promise((resolve) => {
      let done = false; const finish = (v) => { if (done) return; done = true; resolve(v); };
      const stage1 = () => `${modalHead(title)}<div class="stack">
        <div class="id-guide" aria-hidden="true"><div class="id-frame"><span></span><span></span><span></span><span></span>${icon("user")}<i></i><i></i><i></i></div></div>
        <p class="small muted">Lay the card flat in good light so the ID number is sharp. We read it on your device; the photo is never uploaded.</p>
        <div class="row"><label class="btn primary grow" style="cursor:pointer">${icon("scan")} Take a photo<input type="file" id="id-cam" accept="image/*" capture="environment" hidden></label>
          <label class="btn outline grow" style="cursor:pointer">${icon("upload")} Upload image<input type="file" id="id-file" accept="image/*" hidden></label></div>
        <button class="btn ghost block" id="id-manual">Type my details instead</button></div>`;
      openModal(stage1(), (m) => {
        const confirm = (scanUrl, got) => {
          m.innerHTML = `<div class="grabber" aria-hidden="true"></div>${modalHead("Check your details")}<form id="id-form" class="stack" novalidate>
            ${scanUrl ? `<img class="id-scan-prev" src="${scanUrl}" alt="Your scanned card">` : ""}
            ${scanUrl && !got.id ? `<div class="alert amber">${icon("alert")}<div><b>We couldn't read the ID number</b><p>Type it below, or retake the photo closer and sharper.</p></div></div>` : ""}
            <label class="field">Student ID<input class="input" name="id" inputmode="numeric" value="${esc(got.id)}" placeholder="2024-1-60-123" required><span class="err" id="id-err" hidden></span></label>
            <label class="field">Full name<input class="input" name="name" value="${esc(got.name)}" autocomplete="name" placeholder="As printed on the card"></label>
            <div class="grid g2"><label class="field">Department<input class="input" name="dept" value="${esc(got.dept)}" placeholder="e.g. CSE"></label><label class="field">Valid until<input class="input" name="valid" value="${esc(got.valid)}" placeholder="optional"></label></div>
            ${scanUrl ? `<label class="row nowrap small" style="gap:8px"><input type="checkbox" name="usephoto" checked> Crop my photo from the card for the pass</label>` : ""}
            <div class="row"><button type="button" class="btn neutral grow" id="id-retake">${icon("reset")} Retake</button><button class="btn primary grow">${cta}</button></div></form>`;
          $("#id-retake", m).addEventListener("click", () => { m.innerHTML = `<div class="grabber"></div>${stage1()}`; bind(); });
          $("#id-form", m).addEventListener("submit", async (e) => {
            e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), err = $("#id-err", m);
            const id = String(f.id).trim().replace(/\s+/g, "");
            if (!/^\d{4}-\d-\d{2}-\d{3}$/.test(id)) { err.hidden = false; err.textContent = "Use the EWU format, e.g. 2024-1-60-123."; e.target.id.setAttribute("aria-invalid", "true"); e.target.id.focus(); return; }
            const out = { id, name: String(f.name || "").trim(), dept: String(f.dept || "").trim(), valid: String(f.valid || "").trim(), scan: scanUrl || null, photo: null };
            if (scanUrl && f.usephoto) out.photo = await cropModal(scanUrl, m);
            finish(out); closeModal();
          });
        };
        const read = async (file) => {
          let url; try { url = await fileToDataURL(file, 1600, 0.9); } catch (e) { return toast(e.message, "error"); }
          m.innerHTML = `<div class="grabber"></div>${modalHead("Reading your card…")}<div class="stack" style="align-items:center;text-align:center"><img class="id-scan-prev" src="${url}" alt=""><div class="bar" style="width:100%"><span id="id-prog" style="width:4%"></span></div><p class="xs" id="id-stat">Loading the reader (first time only)…</p></div>`;
          try { const text = await ocr(url, (p) => { const b = $("#id-prog", m); if (b) { b.style.width = `${Math.round(5 + p * 95)}%`; $("#id-stat", m).textContent = "Reading text…"; } }); confirm(url, parseCardText(text)); }
          catch (e) { console.warn(e); toast("Couldn't read the card here", "warn", "Type your details instead."); confirm(url, { id: "", name: "", dept: "", valid: "" }); }
        };
        const bind = () => {
          ["#id-cam", "#id-file"].forEach((s) => $(s, m)?.addEventListener("change", (e) => e.target.files[0] && read(e.target.files[0])));
          $("#id-manual", m)?.addEventListener("click", () => { const p = S().profile || {}; confirm(null, { id: p.id || "", name: p.name || "", dept: p.department || "", valid: "" }); });
          $$("[data-close]", m).forEach((b) => b.addEventListener("click", () => finish(null)));
        };
        bind();
      });
      // Closing the sheet any other way (scrim, Esc) cancels the scan.
      const obs = new MutationObserver(() => { if (!$("#scrim").classList.contains("open")) { obs.disconnect(); finish(null); } });
      obs.observe($("#scrim"), { attributes: true, attributeFilter: ["class"] });
    });
  }

  /* Drag a square over the card photo to crop it. Resolves with a 360 px JPEG data URL. */
  function cropModal(src, m) {
    return new Promise((resolve) => {
      m.innerHTML = `<div class="grabber"></div>${modalHead("Crop your photo")}<div class="stack"><p class="xs">Drag the square onto your face on the card. Use the slider to resize.</p>
        <div class="crop-box" id="cb"><img src="${src}" alt="Scanned card" id="cb-img"><span class="crop-sq" id="cb-sq"></span></div>
        <label class="field">Size<input type="range" id="cb-size" min="12" max="90" value="34"></label>
        <div class="row"><button class="btn neutral grow" id="cb-skip">Skip</button><button class="btn primary grow" id="cb-ok">${icon("check")} Use photo</button></div></div>`;
      const box = $("#cb", m), sq = $("#cb-sq", m), img = $("#cb-img", m), size = $("#cb-size", m);
      let pos = { x: 0.08, y: 0.22 };
      const place = () => { const s = Number(size.value) / 100, bw = box.clientWidth, side = bw * s; sq.style.width = sq.style.height = `${side}px`; pos.x = Math.min(Math.max(0, pos.x), 1 - side / bw); pos.y = Math.min(Math.max(0, pos.y), 1 - side / box.clientHeight); sq.style.left = `${pos.x * 100}%`; sq.style.top = `${pos.y * 100}%`; };
      img.onload = place; size.addEventListener("input", place); if (img.complete) place();
      let drag = null;
      sq.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }; sq.setPointerCapture(e.pointerId); });
      sq.addEventListener("pointermove", (e) => { if (!drag) return; pos = { x: drag.px + (e.clientX - drag.x) / box.clientWidth, y: drag.py + (e.clientY - drag.y) / box.clientHeight }; place(); });
      sq.addEventListener("pointerup", () => { drag = null; });
      $("#cb-skip", m).addEventListener("click", () => resolve(null));
      $("#cb-ok", m).addEventListener("click", () => {
        const k = img.naturalWidth / box.clientWidth, side = sq.offsetWidth * k, c = document.createElement("canvas"); c.width = c.height = 360;
        c.getContext("2d").drawImage(img, pos.x * img.naturalWidth, pos.y * img.naturalHeight, side, side, 0, 0, 360, 360);
        resolve(c.toDataURL("image/jpeg", 0.88));
      });
    });
  }

  /* Save a scanned card to the account (and fill an empty profile). */
  async function commit(res, { verified = false, email = "" } = {}) {
    if (!res) return;
    const St = S();
    St.idcard = { id: res.id, name: res.name, dept: res.dept, valid: res.valid, verified: verified || Boolean(St.idcard?.verified && St.idcard.id === res.id), email: email || St.idcard?.email || "", scannedAt: new Date().toISOString() };
    // A rescan without a photo (typed details, skipped crop) keeps the images you already have.
    if (!imgs.loaded) await loadImgs();
    if (res.scan) { await setBlob("id:scan", res.scan); imgs.scan = res.scan; }
    if (res.photo) { await setBlob("id:photo", res.photo); imgs.photo = res.photo; }
    St.idcard.hasScan = Boolean(imgs.scan); St.idcard.hasPhoto = Boolean(imgs.photo);
    const p = St.profile || {};
    St.profile = Object.assign({ creditsTotal: 140, semester: ctx.currentSemester() }, p, { id: res.id, name: p.name || res.name, department: p.department || res.dept });
    ctx.logEvent("System", "user", "purple", "ID card added", `${res.id}${St.idcard.verified ? " · verified with your EWU email" : ""}`, "#/idcard");
    ctx.save();
  }

  /* ── The 3D pass ── */
  const qr = (text) => { const q = qrcode(0, "M"); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 3, margin: 0, scalable: true }); };
  const cardHTML = (c, flip) => {
    const p = S().profile || {}, name = c.name || p.name || "EWU Student";
    return `<div class="idc-stage" id="idc-stage"><div class="idc${flip ? " flipped" : ""}" id="idc" tabindex="0" role="button" aria-label="Student pass for ${esc(name)}. Press to flip.">
      <div class="idc-face front">
        <div class="idc-top"><span class="w">EWU<i>diots</i></span><span class="idc-kind">Student Pass</span></div>
        <div class="idc-body">
          <div class="idc-photo">${imgs.photo ? `<img src="${imgs.photo}" alt="">` : `<span>${esc(ctx.initials(name))}</span>`}</div>
          <div class="idc-info min0"><b class="idc-name">${esc(name)}</b><span class="idc-id num">${esc(c.id)}</span><span class="idc-dept">${esc([c.dept || p.department, "East West University"].filter(Boolean).join(" · "))}</span>
            <span class="idc-valid">${c.valid ? `Valid until ${esc(c.valid)}` : `${esc(ctx.currentSemester().replace("-", " "))}`}</span></div>
          <div class="idc-qr" aria-hidden="true">${qr(`EWU-STUDENT:${c.id}`)}</div></div>
        <div class="idc-foot"><span class="idc-chip" aria-hidden="true"></span>${c.verified ? `<span class="idc-ver">${icon("checkc", "sm")} EWU email verified</span>` : `<span class="idc-ver un">${icon("alert", "sm")} Not verified</span>`}<span class="grow"></span><span class="idc-unoff">Unofficial · not an EWU-issued ID</span></div>
      </div>
      <div class="idc-face back">
        ${imgs.scan ? `<img class="idc-scan" src="${imgs.scan}" alt="Your scanned EWU ID card">` : `<div class="idc-noscan">${icon("scan")}<span>No card scan saved</span></div>`}
        <div class="idc-back-foot"><span>${imgs.scan ? "Your scan · stored only on this device" : "Scan your card to keep a copy here"}</span><span class="num">${esc(c.id)}</span></div></div>
      <div class="idc-sheen" aria-hidden="true"></div></div></div>`;
  };
  let flip = false, onOrient = null;
  pages.idcard = () => {
    const c = S().idcard;
    if (!imgs.loaded) loadImgs().then(() => ctx.route() === "idcard" && ctx.rerender());
    const head = ctx.subHead("My ID Card", "Your student pass, always in your pocket", "#/more");
    if (!c) return `${head}<div style="max-width:620px;margin:0 auto"><section class="card">${ctx.empty("scan", "Add your ID card", "Scan your EWU student ID card. We read your ID and name on this device and turn it into a 3D pass you can show any time.", `<button class="btn primary" id="idc-scan">${icon("scan")} Scan my ID card</button>`)}</section>
      <div class="privacy mt">${icon("shield")}<div><b>Private by design</b><p>The card photo never leaves your phone. Only your ID and name are saved to your account. This pass is not an official EWU ID.</p></div></div></div>`;
    return `${head}<div style="max-width:620px;margin:0 auto">${cardHTML(c, flip)}
      <p class="xs" style="text-align:center;margin-top:10px">Tap the card to flip it. Tilt your phone or move your mouse over it.</p>
      <div class="row mt" style="justify-content:center"><button class="btn primary" id="idc-flip">${icon("reset")} Flip</button><button class="btn outline" id="idc-full">${icon("eye")} Show full screen</button><button class="btn outline" id="idc-copy">${icon("copy")} Copy ID</button></div>
      <section class="card settings-list mt">
        <button class="lrow" id="idc-scan"><span class="itile purple">${icon("scan")}</span><span class="body"><b>Rescan card</b><span>Update your photo or details</span></span>${icon("chevR", "chev")}</button>
        <button class="lrow" id="idc-photo"><span class="itile blue">${icon("image")}</span><span class="body"><b>Change pass photo</b><span>Use any picture of you</span></span>${icon("chevR", "chev")}</button>
        ${!c.verified && ctx.cloud.enabled && !ctx.C.user ? `<a class="lrow" href="#/login?from=profile"><span class="itile green">${icon("mail")}</span><span class="body"><b>Verify with your EWU email</b><span>Code goes to ${esc(c.id)}@std.ewubd.edu</span></span>${icon("chevR", "chev")}</a>` : ""}
        <button class="lrow" id="idc-del"><span class="itile red">${icon("trash")}</span><span class="body"><b style="color:var(--error-t)">Remove ID card</b><span>Deletes the pass and the scan from this device</span></span></button></section>
      <p class="xs mt">EWUdiots is unofficial. Use your real EWU ID card for exams, the library and security checks.</p></div>`;
  };
  pages.idcard.mount = (el) => {
    const on = (s, fn) => { const b = $(s, el); b && b.addEventListener("click", fn); };
    on("#idc-scan", async () => { const r = await scan({ cta: "Save card" }); if (r) { await commit(r); toast("ID card saved", "success", r.id); ctx.rerender(); } });
    const card = $("#idc", el); if (!card) return;
    const c = S().idcard, me = ctx.C.user?.email?.toLowerCase() || "";
    if (!c.verified && me.startsWith(c.id + "@")) { c.verified = true; c.email = me; ctx.save({ silent: true }); ctx.rerender(); return; } // already signed in with this card's email
    const flipIt = () => { flip = !flip; card.classList.toggle("flipped", flip); };
    card.addEventListener("click", flipIt); card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flipIt(); } });
    on("#idc-flip", flipIt);
    const stage = $("#idc-stage", el);
    const tilt = (x, y) => { card.style.setProperty("--rx", `${(-y * 14).toFixed(2)}deg`); card.style.setProperty("--ry", `${(x * 18).toFixed(2)}deg`); card.style.setProperty("--mx", `${50 + x * 50}%`); card.style.setProperty("--my", `${50 + y * 50}%`); };
    stage.addEventListener("pointermove", (e) => { const b = stage.getBoundingClientRect(); tilt((e.clientX - b.left) / b.width - 0.5, (e.clientY - b.top) / b.height - 0.5); });
    stage.addEventListener("pointerleave", () => tilt(0, 0));
    if (onOrient) removeEventListener("deviceorientation", onOrient); // one listener, re-bound to the current card
    onOrient = (e) => { if (ctx.route() !== "idcard" || !card.isConnected) { removeEventListener("deviceorientation", onOrient); onOrient = null; return; } if (e.gamma == null) return; tilt(Math.max(-0.5, Math.min(0.5, e.gamma / 60)), Math.max(-0.5, Math.min(0.5, (e.beta - 40) / 80))); };
    addEventListener("deviceorientation", onOrient);
    on("#idc-full", () => { const st = $("#idc-stage", el); (st.requestFullscreen ? st.requestFullscreen() : Promise.reject()).catch(() => toast("Full screen isn't available here", "info")); });
    on("#idc-copy", async () => { try { await navigator.clipboard.writeText(S().idcard.id); toast("ID copied", "info"); } catch { toast("Couldn't copy", "error"); } });
    on("#idc-photo", () => openModal(modalHead("Pass photo") + `<label class="btn primary block" style="cursor:pointer">${icon("upload")} Choose a photo<input type="file" accept="image/*" id="ph-in" hidden></label>`, (m) => $("#ph-in", m).addEventListener("change", async (e) => {
      const f = e.target.files[0]; if (!f) return; const url = await fileToDataURL(f, 1200).catch(() => null); if (!url) return toast("That file isn't an image", "error");
      const cropped = await cropModal(url, m); if (cropped) { await setBlob("id:photo", cropped); imgs.photo = cropped; S().idcard.hasPhoto = true; ctx.save({ silent: true }); toast("Photo updated"); } closeModal(); ctx.rerender(); })));
    on("#idc-del", () => confirmModal("Remove ID card?", "Deletes the pass and the card scan from this device. Your profile stays.", "Remove", async () => { await delBlob("id:scan"); await delBlob("id:photo"); imgs.scan = imgs.photo = null; S().idcard = null; ctx.save(); ctx.rerender(); toast("ID card removed", "info"); }, true));
  };

  const forget = () => { imgs.scan = imgs.photo = null; imgs.loaded = false; };
  return { scan, commit, forget, pending: null };
}
