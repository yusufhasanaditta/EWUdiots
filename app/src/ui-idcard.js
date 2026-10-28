/* ID card: scan the EWU student ID card (camera or upload) → OCR reads the ID + name → the code goes to that
   student's EWU email (login), and a 3D "student pass" lives in the account. Card images stay on this device. */
import qrcode from "qrcode-generator";
import { getBlob, setBlob, delBlob, fileToDataURL } from "./blobstore.js";
import { readText, isImageFile } from "./ocr.js";

const ID_RE = /(\d{4})\s*[-–—_.]\s*(\d)\s*[-–—_.]\s*(\d{2})\s*[-–—_.]\s*(\d{3})/;
const SKIP = /\b(EAST|WEST|UNIVERSITY|STUDENT|IDENTITY|CARD|VALID|DEPT|DEPARTMENT|BLOOD|PROGRAM|ISSUE|EXPIRE|SIGNATURE|REGISTRAR|DHAKA|AFTABNAGAR|WWW|EWUBD|ID\b|NO\b)/i;
const PROGRAMS = { "60": "CSE" }; // ID program codes we're sure of (2024-1-60-123 = CSE)

/* Pull ID, name, programme and validity out of OCR text. Exported for unit tests. */
// Card photos: OCR mixes up look-alike characters inside the number (O/0, I/l/1, S/5, B/8, Z/2) and sometimes drops the dashes.
const LOOSE_ID = /([\dOoIl|SBZ]{4})\s*[-–—_.,:]\s*([\dOoIl|SZ])\s*[-–—_.,:]\s*([\dOoIl|SBZ]{2})\s*[-–—_.,:]\s*([\dOoIl|SBZ]{3})/;
const digits = (s) => s.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1").replace(/S/g, "5").replace(/B/g, "8").replace(/Z/g, "2");
export function findStudentId(text) {
  const T = String(text || "");
  let m = T.match(ID_RE);
  if (!m) { const l = T.match(LOOSE_ID); if (l) { const g = l.slice(1, 5).map(digits); if (g.every((x) => /^\d+$/.test(x))) m = [l[0], ...g]; } }
  if (!m) m = T.match(/\b(20\d{2})\s?([1-3])\s?(\d{2})\s?(\d{3})\b/); // dashes lost: "2024160123"
  if (!m || !/^20\d{2}$/.test(m[1]) || !/^[1-3]$/.test(m[2])) return "";
  return `${m[1]}-${m[2]}-${m[3]}-${m[4]}`;
}

export function parseCardText(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.replace(/[|_~`"“”]+/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
  const id = findStudentId(text);
  let name = "";
  const labelled = lines.map((l) => l.match(/^name\s*[:.\-]?\s*(.+)$/i)).find(Boolean);
  // EWU cards print the name on the line right above "EWU ID: …".
  const idAt = lines.findIndex((l) => /EWUs*ID|^IDs*[:.]/i.test(l)), above = idAt > 0 ? lines[idAt - 1] : "";
  if (labelled) name = labelled[1];
  else if (/^[A-Za-z][A-Za-z .'-]{4,40}$/.test(above) && !SKIP.test(above) && above.split(" ").length >= 2) name = above;
  else name = lines.filter((l) => /^[A-Za-z][A-Za-z .'-]{4,40}$/.test(l) && !SKIP.test(l) && l.split(" ").length >= 2).sort((a, b) => b.length - a.length)[0] || "";
  name = name.replace(/[^A-Za-z .'-]/g, "").replace(/\s+/g, " ").trim().replace(/\b\w+/g, (w) => (w.length > 2 && w === w.toUpperCase() ? w[0] + w.slice(1).toLowerCase() : w));
  const prog = (String(text).match(/\b(B\.?\s?Sc\.?|BBA|BSS|B\.?\s?A\.?|MBA|EMBA|B\.?\s?Pharm|LL\.?\s?B|M\.?\s?Sc|MSS|M\.?\s?A)\b[^\n]{0,40}/i) || [""])[0].trim();
  const dept = (String(text).match(/\b(CSE|EEE|ECE|ICE|Civil|Pharmacy|English|Economics|Law|Sociology|GEB|Mathematics|Information Studies|Business Administration)\b/i) || [""])[0] || (id ? PROGRAMS[id.split("-")[2]] || "" : "");
  const valid = (String(text).match(/valid\w*\s*(?:up\s*to|till|until|thru|through)?\s*[:.\-]?\s*([A-Za-z0-9 ,\/.\-]{4,20})/i) || ["", ""])[1].trim();
  return { id, name, program: prog, dept, valid };
}

/* Read a card photo: as taken, then turned sideways both ways (cards are often shot in portrait), then bigger.
   Stops at the first try that finds the student ID; otherwise keeps whatever name it found. */
const CARD_TRIES = [{}, { rotate: 90 }, { rotate: 270 }, { boost: true }, { rotate: 180 }];
export async function readCard(src, onProg = () => {}) {
  let best = { id: "", name: "", program: "", dept: "", valid: "" };
  for (const [i, opt] of CARD_TRIES.entries()) {
    const got = parseCardText(await readText(src, (p) => onProg((i + p) / CARD_TRIES.length), opt));
    if (got.id) { onProg(1); return { ...got, name: got.name || best.name }; }
    if (!best.name && got.name) best = got;
  }
  return best;
}

export function install(ctx) {
  const { pages, icon, esc, $, $$, toast, openModal, closeModal, modalHead, confirmModal } = ctx;
  const S = () => ctx.S;
  const imgs = { scan: null, back: null, photo: null, loaded: false };
  const KINDS = { scan: "front", back: "back", photo: "photo" }; // blob "id:<key>" ↔ cloud file "<uid>/<name>.jpg"
  /* Card images live on this device; signed-in students also keep a private copy in their account,
     so the pass shows up on every device they sign in on. */
  async function loadImgs() {
    for (const k of Object.keys(KINDS)) imgs[k] = await getBlob("id:" + k);
    imgs.loaded = true;
    const c = S().idcard, user = ctx.C.user;
    if (!c || !user || !ctx.cloud.enabled) return;
    for (const [k, name] of Object.entries(KINDS)) {
      if (imgs[k]) continue;
      const url = await ctx.cloud.downloadCard(user.id, name).catch(() => null);
      if (url) { imgs[k] = url; await setBlob("id:" + k, url); }
    }
  }
  async function backupImgs(keys = Object.keys(KINDS)) {
    const user = ctx.C.user; if (!user || !ctx.cloud.enabled) return;
    for (const k of keys) if (imgs[k]) await ctx.cloud.uploadCard(user.id, KINDS[k], imgs[k]).catch((e) => console.warn("Card backup failed", e));
  }

  /* ── Scan flow: photo of the front → photo of the back → confirm. Both sides are required.
     Resolves with the card details (and both images) or null if cancelled. ── */
  // frontOnly: signing in only needs the ID number, so the back side and the photo crop are skipped.
  function scan({ title = "Scan your EWU ID card", cta = "Continue", frontOnly = false } = {}) {
    return new Promise((resolve) => {
      // The front photo is kept until you finish, so if the phone closes the app while the camera is open, the scan resumes.
      let done = false; const finish = (v) => { if (done) return; done = true; delBlob("id:pending").catch(() => {}); resolve(v); };
      const sides = { front: null, back: null };
      let got = null, reading = null, pct = 0, skip = null; // OCR of the front runs while you photograph the back
      const NONE = { id: "", name: "", dept: "", valid: "" };
      const startReading = (url) => {
        pct = 0;
        const ocr = readCard(url, (p) => { pct = p; const b = $("#id-prog"); if (b) b.style.width = `${Math.round(10 + p * 90)}%`; });
        // A slow or stuck reader never blocks you: after 90 s, or when you tap "Type it myself", you fill the form by hand.
        reading = Promise.race([ocr, new Promise((r) => setTimeout(() => r(NONE), 90000)), new Promise((r) => { skip = () => r(NONE); })])
          .catch((e) => { console.warn(e); return NONE; });
      };
      const steps = () => `<ol class="id-steps" aria-label="Steps">${(frontOnly ? [["front", "Front"], ["check", "Check"]] : [["front", "Front"], ["back", "Back"], ["check", "Check"]]).map(([k, l], i) => `<li class="${(k === "check" ? sides.front && (frontOnly || sides.back) : sides[k]) ? "done" : ""}">${sides[k] ? icon("check", "sm") : `<span>${i + 1}</span>`}${l}</li>`).join("")}</ol>`;
      const pickHTML = (side) => `${modalHead(title)}${steps()}<div class="stack">
        <div class="id-guide ${side}" aria-hidden="true"><div class="id-frame portrait"><span></span><span></span><span></span><span></span>${side === "front" ? `<b class="idf-band">STUDENT</b><b class="idf-logo"></b><b class="idf-photo">${icon("user")}</b><i></i><i class="idf-id"></i>` : `<em></em><i></i><i></i><i></i>`}</div></div>
        <div><b>${side === "front" ? "Photo of the front side" : "Now the back side"}</b><p class="small muted">${side === "front" ? "The side with your photo and student ID. Lay it flat in good light so the number is sharp. Sideways is fine." : "Turn the card over. Both sides are needed to add your card."}</p></div>
        <div class="row"><label class="btn primary grow" style="cursor:pointer">${icon("scan")} Take a photo<input type="file" data-side="${side}" accept="image/*" capture="environment" hidden></label>
          <label class="btn outline grow" style="cursor:pointer">${icon("upload")} Upload image<input type="file" data-side="${side}" accept="image/*" hidden></label></div>
        ${side === "back" ? `<div class="row nowrap small muted" style="gap:10px"><img class="id-thumb" src="${sides.front}" alt="Front side"><span class="grow">Front side added.</span><button type="button" class="btn ghost sm" id="id-redo-front">${icon("reset")} Retake front</button></div>` : ""}
        <p class="xs">${icon("shield", "sm")} Your card pictures are private: they stay on this device${ctx.cloud.enabled ? " and in your own account, never shown to anyone else" : ""}.</p></div>`;
      openModal(pickHTML("front"), (m) => {
        const show = (html) => { m.innerHTML = `<div class="grabber" aria-hidden="true"></div>${html}`; bind(); };
        const confirm = async () => {
          show(`${modalHead("Reading your card…")}${steps()}<div class="stack" style="align-items:center;text-align:center"><img class="id-scan-prev" src="${sides.front}" alt=""><div class="bar" style="width:100%"><span id="id-prog" style="width:${Math.round(10 + pct * 90)}%"></span></div><p class="xs">Reading your ID and name on this phone. The first time takes a little longer.</p><button type="button" class="btn ghost sm" id="id-skipocr">Type it myself</button></div>`);
          $("#id-skipocr", m)?.addEventListener("click", () => skip?.());
          got = await reading;
          show(`${modalHead("Check your details")}${steps()}<form id="id-form" class="stack" novalidate>
            <div class="id-pair"><figure><img src="${sides.front}" alt="Front of your card"><figcaption>Front</figcaption></figure>${sides.back ? `<figure><img src="${sides.back}" alt="Back of your card"><figcaption>Back</figcaption></figure>` : ""}</div>
            ${!got.id ? `<div class="alert amber">${icon("alert")}<div><b>We couldn't read the ID number</b><p>Type it below, or retake the front closer and sharper.</p></div></div>` : ""}
            <label class="field">Student ID<input class="input" name="id" inputmode="numeric" value="${esc(got.id)}" placeholder="2024-1-60-123" required><span class="err" id="id-err" hidden></span></label>
            <label class="field">Full name<input class="input" name="name" value="${esc(got.name)}" autocomplete="name" placeholder="As printed on the card"></label>
            <div class="grid g2"><label class="field">Department<input class="input" name="dept" value="${esc(got.dept)}" placeholder="e.g. CSE"></label><label class="field">Valid until<input class="input" name="valid" value="${esc(got.valid)}" placeholder="optional"></label></div>
            ${frontOnly ? "" : '<label class="row nowrap small" style="gap:8px"><input type="checkbox" name="usephoto" checked> Crop my photo from the card for the pass</label>'}
            <div class="row"><button type="button" class="btn neutral grow" id="id-retake">${icon("reset")} Retake</button><button class="btn primary grow">${cta}</button></div></form>`);
          $("#id-retake", m).addEventListener("click", () => { sides.front = sides.back = null; reading = null; show(pickHTML("front")); });
          $("#id-form", m).addEventListener("submit", async (e) => {
            e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), err = $("#id-err", m);
            const id = String(f.id).trim().replace(/\s+/g, "");
            if (!/^\d{4}-\d-\d{2}-\d{3}$/.test(id)) { err.hidden = false; err.textContent = "Use the EWU format, e.g. 2024-1-60-123."; e.target.id.setAttribute("aria-invalid", "true"); e.target.id.focus(); return; }
            const out = { id, name: String(f.name || "").trim(), dept: String(f.dept || "").trim(), valid: String(f.valid || "").trim(), scan: sides.front, back: sides.back, photo: null };
            if (f.usephoto) out.photo = await cropModal(sides.front, m);
            finish(out); closeModal();
          });
        };
        const take = async (side, file) => {
          if (!isImageFile(file)) return toast("Choose a photo of your card", "warn");
          let url; try { url = await fileToDataURL(file, 1600, 0.9); } catch (e) { return toast(e.message, "error"); }
          sides[side] = url;
          if (side === "front") {
            startReading(url);
            setBlob("id:pending", url).catch(() => {});
            if (frontOnly) confirm(); else show(pickHTML("back"));
          } else confirm();
        };
        function bind() {
          $$("input[data-side]", m).forEach((i) => i.addEventListener("change", (e) => e.target.files[0] && take(i.dataset.side, e.target.files[0])));
          $("#id-redo-front", m)?.addEventListener("click", () => { sides.front = null; reading = null; show(pickHTML("front")); });
          $$("[data-close]", m).forEach((b) => b.addEventListener("click", () => finish(null)));
        }
        bind();
        getBlob("id:pending").then((url) => { if (url && !sides.front && !done && !frontOnly) { sides.front = url; startReading(url); show(pickHTML("back")); toast("Picking up where you left off", "info", "Front side is saved. Now add the back."); } }).catch(() => {});
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
      let pos = { x: 0.08, y: 0.22 }, sized = false;
      const place = () => {
        // EWU cards are portrait with the photo in the middle; start the square there.
        if (!sized && img.naturalWidth) { sized = true; if (img.naturalHeight > img.naturalWidth) { pos = { x: 0.27, y: 0.3 }; size.value = 46; } } const s = Number(size.value) / 100, bw = box.clientWidth, side = bw * s; sq.style.width = sq.style.height = `${side}px`; pos.x = Math.min(Math.max(0, pos.x), 1 - side / bw); pos.y = Math.min(Math.max(0, pos.y), 1 - side / box.clientHeight); sq.style.left = `${pos.x * 100}%`; sq.style.top = `${pos.y * 100}%`; };
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
    const changed = ["scan", "back", "photo"].filter((k) => res[k]);
    for (const k of changed) { await setBlob("id:" + k, res[k]); imgs[k] = res[k]; }
    St.idcard.hasScan = Boolean(imgs.scan); St.idcard.hasBack = Boolean(imgs.back); St.idcard.hasPhoto = Boolean(imgs.photo);
    backupImgs(verified ? Object.keys(KINDS) : changed);
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
        ${imgs.back || imgs.scan ? `<img class="idc-scan" src="${imgs.back || imgs.scan}" alt="Your scanned EWU ID card">` : `<div class="idc-noscan">${icon("scan")}<span>No card scan saved</span></div>`}
        <div class="idc-back-foot"><span>${imgs.back ? "Back of your card · private to you" : imgs.scan ? "Rescan to add the back side" : "Scan your card to keep a copy here"}</span><span class="num">${esc(c.id)}</span></div></div>
      <div class="idc-sheen" aria-hidden="true"></div></div></div>`;
  };
  let flip = false, onOrient = null;
  pages.idcard = () => {
    const c = S().idcard;
    if (!imgs.loaded) loadImgs().then(() => ctx.route() === "idcard" && ctx.rerender());
    const head = ctx.subHead("My ID Card", "Your student pass, always in your pocket", "#/more");
    if (!c) return `${head}<div style="max-width:620px;margin:0 auto"><section class="card">${ctx.empty("scan", "Add your ID card", "Take a photo of the front and the back of your EWU student ID card. We read your ID and name on this device and turn it into a 3D pass you can show any time.", `<button class="btn primary" id="idc-scan">${icon("scan")} Scan my ID card</button>`)}</section>
      <div class="privacy mt">${icon("shield")}<div><b>Private by design</b><p>Card pictures are read on this device. If you sign in, a private copy is kept in your own account so the pass appears on all your devices; nobody else can see it. This pass is not an official EWU ID.</p></div></div></div>`;
    const missing = imgs.loaded && (!imgs.scan || !imgs.back);
    return `${head}<div style="max-width:620px;margin:0 auto">${missing ? `<div class="alert amber" style="margin-bottom:12px"><span class="a-ic">${icon("alert")}</span><div class="grow"><b>Add both sides of your card</b><p>Your pass needs a photo of the front and the back. Tap Rescan card below.</p></div></div>` : ""}${cardHTML(c, flip)}
      <p class="xs" style="text-align:center;margin-top:10px">Tap the card to flip it. Tilt your phone or move your mouse over it.</p>
      <div class="row mt" style="justify-content:center"><button class="btn primary" id="idc-flip">${icon("reset")} Flip</button><button class="btn outline" id="idc-full">${icon("eye")} Show full screen</button><button class="btn outline" id="idc-copy">${icon("copy")} Copy ID</button></div>
      <section class="card settings-list mt">
        <button class="lrow" id="idc-scan"><span class="itile purple">${icon("scan")}</span><span class="body"><b>Rescan card</b><span>Front and back, or update your details</span></span>${icon("chevR", "chev")}</button>
        <button class="lrow" id="idc-photo"><span class="itile blue">${icon("image")}</span><span class="body"><b>Change pass photo</b><span>Use any picture of you</span></span>${icon("chevR", "chev")}</button>
        ${ctx.C.user && ctx.cloud.roleOf(ctx.C.user) === "student" && !ctx.cloud.cardVerified(ctx.C.user) ? `<button class="lrow" id="idc-verify"><span class="itile green">${icon("shield")}</span><span class="body"><b>Verify my student account</b><span>${c.hasScan && c.hasBack && ctx.C.user.email.startsWith(c.id + "@") ? "Uses this card. No rescan needed." : "Scan both sides of your own card"}</span></span>${icon("chevR", "chev")}</button>` : ""}
        ${!c.verified && ctx.cloud.enabled && !ctx.C.user ? `<a class="lrow" href="#/login?from=profile"><span class="itile green">${icon("mail")}</span><span class="body"><b>Verify with your EWU email</b><span>Code goes to ${esc(c.id)}@std.ewubd.edu</span></span>${icon("chevR", "chev")}</a>` : ""}
        <button class="lrow" id="idc-del"><span class="itile red">${icon("trash")}</span><span class="body"><b style="color:var(--error-t)">Remove ID card</b><span>Deletes the pass and both card pictures</span></span></button></section>
      <p class="xs mt">EWUdiots is unofficial. Use your real EWU ID card for exams, the library and security checks.</p></div>`;
  };
  pages.idcard.mount = (el) => {
    const on = (s, fn) => { const b = $(s, el); b && b.addEventListener("click", fn); };
    // Signed-in students scanning their own card are verified on the server at the same time.
    const mine = (r) => ctx.C.user && ctx.cloud.roleOf(ctx.C.user) === "student" && ctx.C.user.email.toLowerCase().startsWith(r.id + "@");
    on("#idc-scan", async () => { const r = await scan({ cta: "Save card" }); if (!r) return; if (mine(r) && !ctx.cloud.cardVerified(ctx.C.user)) await verifyWithCard(r); else { await commit(r); toast("ID card saved", "success", r.id); } ctx.rerender(); });
    on("#idc-verify", async () => { const saved = savedCard(); if (saved && mine(saved)) await verifyWithCard(saved); else await verifyAccount(); ctx.rerender(); });
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
      const cropped = await cropModal(url, m); if (cropped) { await setBlob("id:photo", cropped); imgs.photo = cropped; S().idcard.hasPhoto = true; backupImgs(["photo"]); ctx.save({ silent: true }); toast("Photo updated"); } closeModal(); ctx.rerender(); })));
    on("#idc-del", () => confirmModal("Remove ID card?", `Deletes the pass and both card pictures from this device${ctx.C.user ? " and your account" : ""}. Your profile stays.`, "Remove", async () => {
      for (const k of Object.keys(KINDS)) await delBlob("id:" + k);
      if (ctx.C.user) await ctx.cloud.deleteCards(ctx.C.user.id).catch(() => {});
      forget(); imgs.loaded = true; S().idcard = null; ctx.save(); ctx.rerender(); toast("ID card removed", "info");
    }, true));
  };

  const forget = () => { imgs.scan = imgs.back = imgs.photo = null; imgs.loaded = false; };
  // A card already on this device with both sides photographed can sign in again without rescanning.
  const savedCard = () => { const c = S().idcard; return c && c.hasScan && c.hasBack ? { id: c.id, name: c.name, dept: c.dept, valid: c.valid } : null; };
  /* Verify a signed-in student account: scan both sides of your own card (its ID must be your account's ID), the photos go
     to your private folder, and the server marks the account verified (public.verify_my_card checks both again). */
  async function verifyAccount() {
    const user = ctx.C.user;
    if (!user) { ctx.go("#/login?from=profile"); return false; }
    const want = String(user.email || "").split("@")[0];
    const card = await scan({ title: "Verify with your ID card", cta: "Verify my account" });
    return card ? verifyWithCard(card) : false;
  }
  async function verifyWithCard(card) {
    const user = ctx.C.user, want = String(user?.email || "").split("@")[0];
    if (!user) return false;
    if (card.id !== want) { toast("That card has a different student ID", "error", `This account is ${want}. Scan your own card.`); return false; }
    try {
      await commit(card, { verified: true, email: user.email });
      await backupImgs(["scan", "back"]);
      await ctx.cloud.verifyMyCard(card.id);
      toast("Your student account is verified", "success", "Thanks! You have the verified badge now.");
      ctx.rerender(); return true;
    } catch (e) { toast("Couldn't verify yet", "error", e.message); return false; }
  }
  return { scan, commit, forget, savedCard, verifyAccount, verifyWithCard, pending: null };
}
