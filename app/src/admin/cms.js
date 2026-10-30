/* Admin sections for running the website and its automation (ideas from the Aven Resort and Boyaan admin panels):
   Website content + theme with a live preview, Media library, News & notices feed, Alumni editor + newsletter import,
   Analytics, Scheduled jobs, Change history with compare/restore, and Roles & permissions. */
import { PRESETS, themeColor } from "../theme.js";
import { draftAlumni } from "../newsletters.js";

export const PERMS = [
  ["posts.write", "Write posts & announcements"], ["messages.send", "Message users"], ["site.edit", "Edit website, banner & theme"], ["features.edit", "Features & maintenance mode"],
  ["media.write", "Upload & delete media"], ["news.edit", "Edit the news & notice feed"], ["alumni.review", "Review & edit alumni"], ["faculty.edit", "Edit faculty listings"],
  ["rooms.edit", "Edit campus rooms"], ["reports.handle", "Moderate reports"], ["feedback.handle", "Handle feedback"], ["users.view", "See users"], ["users.manage", "Suspend users / end sessions"],
  ["security.view", "See security events"], ["analytics.view", "See analytics"], ["jobs.run", "Run scheduled jobs"], ["events.review", "Approve & add events"], ["blog.moderate", "Moderate the blog & jobs board"], ["clubs.verify", "Verify club claims"], ["clubs.manage", "Manage every club (appoint admins, suspend)"], ["clubs.moderate", "Hide reported club posts"]
];
const SITE_FIELDS = [
  ["hero_chip", "Small headline above the title", "3D campus map, live EWU notices & ID pass", 80], ["hero_title", "Main title", "Your whole EWU life,", 60],
  ["hero_highlight", "Highlighted end of the title", "in one app.", 40], ["hero_lead", "Intro paragraph", "Sync your portal once and EWUdiots builds…", 320]
];

export function cmsViews(h) {
  const { $, $$, esc, icon, toast, openModal, closeModal, confirmAct, act, busy, sw, ago, downloadCSV, barChart, delta } = h;
  const api = () => h.api();

  /* ── small word-level diff (Boyaan's lib/diff idea) ── */
  function diffWords(a, b) {
    const A = String(a ?? "").split(/(\s+)/), B = String(b ?? "").split(/(\s+)/);
    if (A.length * B.length > 250000) return `<del>${esc(a)}</del> <ins>${esc(b)}</ins>`;
    const L = Array.from({ length: A.length + 1 }, () => new Uint16Array(B.length + 1));
    for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0, j = 0, out = "";
    while (i < A.length && j < B.length) { if (A[i] === B[j]) { out += esc(A[i]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) out += `<del>${esc(A[i++])}</del>`; else out += `<ins>${esc(B[j++])}</ins>`; }
    while (i < A.length) out += `<del>${esc(A[i++])}</del>`; while (j < B.length) out += `<ins>${esc(B[j++])}</ins>`;
    return out;
  }
  const flat = (o) => (o && typeof o === "object" ? Object.entries(o).filter(([k]) => !["updated_at", "fetched_at", "created_at", "id", "key"].includes(k)).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v ?? ""}`).join("\n") : String(o ?? ""));

  /* ── Media picker (used by posts, website content and the feed) ── */
  async function pickMedia() {
    const items = await api().list("media_items", { limit: 200 });
    return new Promise((resolve) => {
      openModal("Choose an image", `<div class="media-grid sm">${items.map((m) => `<button type="button" class="media-tile" data-pick="${esc(m.url)}"><img src="${esc(m.url)}" alt="${esc(m.alt)}" loading="lazy"><span>${esc(m.alt || m.path.split("/").pop())}</span></button>`).join("") || '<p class="small muted">No images yet. Upload some in Media library.</p>'}</div>`,
        (m) => $$("[data-pick]", m).forEach((b) => b.addEventListener("click", () => { closeModal(); resolve(b.dataset.pick); })));
      const obs = new MutationObserver(() => { if (!$("#scrim").classList.contains("open")) { obs.disconnect(); resolve(null); } }); obs.observe($("#scrim"), { attributes: true });
    });
  }
  h.pickMedia = pickMedia;

  // Real file type from the first bytes, never the name (Boyaan's sniffMime).
  const sniff = (b) => b[0] === 0xff && b[1] === 0xd8 ? "image/jpeg" : b[0] === 0x89 && b[1] === 0x50 ? "image/png" : b[0] === 0x47 && b[1] === 0x49 ? "image/gif" : b[8] === 0x57 && b[9] === 0x45 ? "image/webp" : "";
  async function uploadImage(file, folder = "General") {
    if (file.size > 4 * 1024 * 1024) throw new Error(`${file.name} is over 4 MB`);
    const buf = new Uint8Array(await file.arrayBuffer()), type = sniff(buf);
    if (!type) throw new Error(`${file.name} isn't a JPG, PNG, WebP or GIF image`);
    const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].map((x) => x.toString(16).padStart(2, "0")).join("");
    const dupe = (await api().list("media_items", { eq: { sha256: sha }, limit: 1, order: null }))[0];
    if (dupe) return { ...dupe, dupe: true }; // the same file is never stored twice
    const dims = await new Promise((r) => { const im = new Image(); im.onload = () => r([im.naturalWidth, im.naturalHeight]); im.onerror = () => r([null, null]); im.src = URL.createObjectURL(file); });
    const path = `${folder.toLowerCase().replace(/[^a-z0-9]+/g, "-")}/${sha.slice(0, 16)}.${type.split("/")[1].replace("jpeg", "jpg")}`;
    const url = await api().upload(path, new Blob([buf], { type }));
    const row = { path, url, alt: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 200), width: dims[0], height: dims[1], size_bytes: file.size, sha256: sha, folder };
    await api().upsert("media_items", row);
    return row;
  }

  return {
    /* ═════════ Website content + theme, with a live preview ═════════ */
    async website(el) {
      const rows = await api().list("site_settings", { order: null }), get = (k) => (rows.find((r) => r.key === k) || {}).value || {};
      const c = get("site"), t = get("theme"); let faq = Array.isArray(c.faq) ? c.faq.slice() : [];
      el.innerHTML = `<div class="split cms" style="align-items:start"><form class="card stack" id="ws">
          <h2 style="font-size:17px">Homepage</h2>${SITE_FIELDS.map(([k, l, ph, max]) => k === "hero_lead" ? `<label class="field">${l}<textarea class="input" name="${k}" rows="3" maxlength="${max}" placeholder="${esc(ph)}">${esc(c[k] || "")}</textarea></label>` : `<label class="field">${l}<input class="input" name="${k}" maxlength="${max}" value="${esc(c[k] || "")}" placeholder="${esc(ph)}"></label>`).join("")}
          <p class="xs">Leave a field empty to keep the built-in text.</p>
          <h2 style="font-size:17px" class="mt">Announcement bar</h2>${sw("ws-ann", c.announce_on, "Show a bar at the top of the website")}
          <label class="field">Text<input class="input" name="announce_text" maxlength="160" value="${esc(c.announce_text || "")}" placeholder="Advising for Spring 2027 opens Sunday"></label>
          <div class="grid g2"><label class="field">Link<input class="input" name="announce_link" value="${esc(c.announce_link || "")}" placeholder="/app.html#/planner or https://…" pattern="(https://.+|/.*|#.*)?"></label><label class="field">Link text<input class="input" name="announce_cta" maxlength="24" value="${esc(c.announce_cta || "")}" placeholder="Learn more"></label></div>
          <h2 style="font-size:17px" class="mt">FAQ</h2><div id="faq-list" class="stack" style="gap:8px"></div><button type="button" class="btn sm outline" id="faq-add">${icon("plus", "sm")} Add a question</button>
          <h2 style="font-size:17px" class="mt">Contact &amp; social</h2>
          <label class="field">Contact email<input class="input" name="contact_email" type="email" value="${esc(c.contact_email || "")}" placeholder="ewudiots@gmail.com"></label>
          <div class="grid g2">${["facebook", "instagram", "linkedin", "youtube"].map((k) => `<label class="field">${k[0].toUpperCase() + k.slice(1)}<input class="input" name="${k}" type="url" pattern="https://.+" value="${esc(c[k] || "")}" placeholder="https://…"></label>`).join("")}</div>
          <h2 style="font-size:17px" class="mt">Theme colour</h2><p class="xs">Changes the brand colour of the app and the website for everyone.</p>
          <div class="theme-pick">${PRESETS.map(([id, l, hex]) => `<label class="theme-sw"><input type="radio" name="preset" value="${id}" ${(t.preset || "purple") === id && !t.primary ? "checked" : ""}><span style="--c:${hex}"></span>${esc(l)}</label>`).join("")}
            <label class="theme-sw"><input type="radio" name="preset" value="custom" ${t.primary ? "checked" : ""}><input type="color" name="primary" value="${esc(themeColor(t))}" aria-label="Custom colour">Custom</label></div>
          <div class="row mt"><button type="button" class="btn ghost" id="ws-hist">${icon("clock")} History</button><span class="grow"></span><button class="btn primary">${icon("check")} Publish</button></div></form>
        <div class="card cms-prev"><div class="row between"><b>Live preview</b><div class="seg sm">${[["100%", "Desktop"], ["768px", "Tablet"], ["390px", "Phone"]].map(([w, l], i) => `<button type="button" data-pw="${w}" aria-selected="${i === 0}">${l}</button>`).join("")}</div></div>
          <div class="prev-frame"><iframe id="ws-frame" src="/" title="Website preview" loading="lazy"></iframe></div><p class="xs mt-s">The preview shows the published site. Publish, then it reloads with your changes.</p></div></div>`;
      const drawFaq = () => {
        $("#faq-list", el).innerHTML = faq.map((f, i) => `<div class="faq-row"><input class="input" data-fq="${i}" value="${esc(f.q)}" placeholder="Question" maxlength="140"><textarea class="input" data-fa="${i}" rows="2" maxlength="600" placeholder="Answer">${esc(f.a)}</textarea>
          <div class="row"><button type="button" class="btn sm ghost" data-fu="${i}" aria-label="Move up" ${i ? "" : "disabled"}>↑</button><button type="button" class="btn sm ghost" data-fd="${i}" aria-label="Move down" ${i < faq.length - 1 ? "" : "disabled"}>↓</button><span class="grow"></span><button type="button" class="btn sm ghost" data-fx="${i}" aria-label="Remove">${icon("trash", "sm")}</button></div></div>`).join("") || '<p class="xs">No custom FAQ. The built-in questions show.</p>';
        $$("[data-fq]", el).forEach((x) => x.addEventListener("input", () => { faq[x.dataset.fq].q = x.value; }));
        $$("[data-fa]", el).forEach((x) => x.addEventListener("input", () => { faq[x.dataset.fa].a = x.value; }));
        const mv = (i, d) => { const [r] = faq.splice(i, 1); faq.splice(i + d, 0, r); drawFaq(); };
        $$("[data-fu]", el).forEach((b) => b.addEventListener("click", () => mv(+b.dataset.fu, -1)));
        $$("[data-fd]", el).forEach((b) => b.addEventListener("click", () => mv(+b.dataset.fd, 1)));
        $$("[data-fx]", el).forEach((b) => b.addEventListener("click", () => { faq.splice(+b.dataset.fx, 1); drawFaq(); }));
      };
      drawFaq();
      $("#faq-add", el).addEventListener("click", () => { faq.push({ q: "", a: "" }); drawFaq(); $$("[data-fq]", el).pop().focus(); });
      $$("[data-pw]", el).forEach((b) => b.addEventListener("click", () => { $$("[data-pw]", el).forEach((x) => x.setAttribute("aria-selected", x === b)); $("#ws-frame", el).style.width = b.dataset.pw; }));
      $("#ws-hist", el).addEventListener("click", () => h.go("history"));
      $("#ws", el).addEventListener("submit", async (e) => {
        e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), btn = e.target.querySelector("button.primary"); busy(btn, true);
        const site = { ...Object.fromEntries(SITE_FIELDS.map(([k]) => [k, (f[k] || "").trim()])), announce_on: $("#ws-ann", el).checked, announce_text: f.announce_text.trim(), announce_link: f.announce_link.trim(), announce_cta: f.announce_cta.trim(),
          faq: faq.filter((x) => x.q.trim() && x.a.trim()).map((x) => ({ q: x.q.trim(), a: x.a.trim() })), contact_email: f.contact_email.trim(), ...Object.fromEntries(["facebook", "instagram", "linkedin", "youtube"].map((k) => [k, f[k].trim()])) };
        const theme = f.preset === "custom" ? { primary: f.primary } : { preset: f.preset };
        try {
          await act("Published website content", "Homepage, FAQ, links", () => api().upsert("site_settings", { key: "site", value: site, updated_at: new Date().toISOString() }));
          await act("Changed theme colour", theme.primary || theme.preset, () => api().upsert("site_settings", { key: "theme", value: theme, updated_at: new Date().toISOString() }));
          toast("Website updated", "success", "Visitors see it on their next visit."); $("#ws-frame", el).src = "/?r=" + Date.now();
        } catch (err) { toast(err.message, "error"); }
        busy(btn, false);
      });
    },

    /* ═════════ Media library ═════════ */
    async media(el) {
      const rows = await api().list("media_items", { limit: 500 }), folder = el.dataset.folder || "All";
      const folders = ["All", ...new Set(rows.map((r) => r.folder))], shown = rows.filter((r) => folder === "All" || r.folder === folder);
      el.innerHTML = `<label class="drop" id="drop"><input type="file" id="mu" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden>${icon("upload")}<b>Drop images here or click to upload</b><span class="xs">JPG, PNG, WebP or GIF · up to 4 MB each · the same file is never stored twice</span></label>
        <div class="row mt"><div class="seg">${folders.map((f) => `<button data-mf="${esc(f)}" aria-selected="${f === folder}">${esc(f)}</button>`).join("")}</div><span class="grow"></span><label class="field" style="flex-direction:row;align-items:center;gap:8px">Upload to<input class="input" id="mfold" value="${esc(folder === "All" ? "General" : folder)}" maxlength="40" style="width:140px"></label></div>
        <div class="media-grid mt">${shown.map((m) => `<figure class="media-tile"><img src="${esc(m.url)}" alt="${esc(m.alt)}" loading="lazy"><figcaption><input class="input" data-alt="${esc(m.path)}" value="${esc(m.alt)}" aria-label="Alt text" placeholder="Describe the image"><span class="xs">${m.width ? `${m.width}×${m.height} · ` : ""}${Math.round((m.size_bytes || 0) / 1024)} KB</span>
          <div class="row"><button class="btn sm ghost" data-copy="${esc(m.url)}">${icon("copy", "sm")} Copy link</button><button class="btn sm ghost" data-mdel="${esc(m.path)}" aria-label="Delete">${icon("trash", "sm")}</button></div></figcaption></figure>`).join("") || '<p class="small muted">No images yet.</p>'}</div>`;
      const up = async (files) => {
        let n = 0, d = 0;
        for (const f of files) { try { const r = await uploadImage(f, $("#mfold", el).value.trim() || "General"); r.dupe ? d++ : n++; } catch (err) { toast(err.message, "error"); } }
        if (n || d) { await api().log("Uploaded media", `${n} new${d ? `, ${d} already there` : ""}`).catch(() => {}); toast(`${n} uploaded${d ? ` · ${d} already in the library` : ""}`); }
        h.VIEWS.media(el);
      };
      $("#mu", el).addEventListener("change", (e) => up([...e.target.files]));
      const drop = $("#drop", el);
      ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
      ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
      drop.addEventListener("drop", (e) => up([...e.dataTransfer.files]));
      $$("[data-mf]", el).forEach((b) => b.addEventListener("click", () => { el.dataset.folder = b.dataset.mf; h.VIEWS.media(el); }));
      $$("[data-copy]", el).forEach((b) => b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast("Link copied"); } catch { toast("Couldn't copy", "error"); } }));
      $$("[data-alt]", el).forEach((i) => i.addEventListener("change", () => api().update("media_items", { path: i.dataset.alt }, { alt: i.value.trim().slice(0, 200) }).then(() => toast("Alt text saved")).catch((e) => toast(e.message, "error"))));
      $$("[data-mdel]", el).forEach((b) => b.addEventListener("click", () => {
        const m = rows.find((x) => x.path === b.dataset.mdel);
        // "Where is this used?" check before deleting (Boyaan): posts and website settings.
        Promise.all([api().list("posts", { limit: 1000, order: null }), api().list("site_settings", { order: null })]).then(([posts, sets]) => {
          const used = posts.filter((p) => !p.deleted_at && (p.image_url === m.url || String(p.body).includes(m.url))).map((p) => `post “${p.title}”`).concat(sets.filter((s) => JSON.stringify(s.value).includes(m.url)).map((s) => `${s.key} settings`));
          confirmAct("Delete this image?", used.length ? `<b>It's still used in:</b> ${used.map(esc).join(", ")}. Those places will show a broken image.` : "It isn't used anywhere.", "Delete", async () => { await act("Deleted media", m.path, () => api().removeFile(m.path)); h.VIEWS.media(el); });
        });
      }));
    },

    /* ═════════ Events: approve suggestions, add your own; official ones arrive daily ═════════ */
    async events(el) {
      const st = el.dataset.st || "pending", rows = await api().list("events", { eq: st === "all" ? undefined : { status: st }, order: "starts_at", asc: st === "pending", limit: 400 });
      const runs = await api().list("job_runs", { eq: { job: "events" }, order: "started_at", limit: 1 }).catch(() => []);
      const dt = (d, allDay) => new Date(d).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric", ...(allDay ? {} : { hour: "numeric", minute: "2-digit" }) });
      const SRC = { auto: ["Official", "blue"], admin: ["Team", "purple"], user: ["Suggested", "amber"] };
      el.innerHTML = `<div class="row"><div class="seg">${[["pending", "Waiting"], ["approved", "Live"], ["rejected", "Rejected"], ["all", "All"]].map(([v, l]) => `<button data-es="${v}" aria-selected="${st === v}">${l}</button>`).join("")}</div><span class="grow"></span>
          <button class="btn outline" id="e-run">${icon("sync")} Fetch from ewubd.edu now</button><button class="btn primary" id="e-add">${icon("plus")} Add event</button></div>
        <p class="xs mt-s">${icon("zap", "sm")} Official events come from ewubd.edu/events automatically${runs[0] ? ` · last run ${ago(runs[0].started_at)} (${esc(runs[0].detail)})` : ""}. Students, teachers and alumni suggest the rest; they appear only after you approve. The poster gets a message either way.</p>
        <div class="adm-cards mt">${rows.length ? rows.map((e) => `<article class="card fx-rise ${new Date(e.ends_at || e.starts_at) < Date.now() - 864e5 ? "dim" : ""}"><div class="row nowrap top"><span class="itile sm ${SRC[e.source][1]}">${icon("calendar")}</span><div class="min0 grow"><b>${esc(e.title)}</b>
            <p class="xs">${dt(e.starts_at, e.all_day)}${e.ends_at ? ` → ${dt(e.ends_at, e.all_day)}` : ""}${e.venue ? ` · ${esc(e.venue)}` : ""}</p></div></div>
          <div class="row mt-s" style="gap:6px"><span class="pill ${SRC[e.source][1]}">${SRC[e.source][0]}</span><span class="pill">${esc(String(e.kind || "other").replace(/_/g, " "))}</span>${e.pinned ? '<span class="pill amber">Pinned</span>' : ""}${st === "all" ? `<span class="pill">${e.status}</span>` : ""}</div>
          ${e.organizer ? `<p class="small mt-s">By ${esc(e.organizer)}${e.author_name && e.source === "user" ? ` · sent by ${esc(e.author_name)}` : ""}</p>` : e.author_name ? `<p class="small mt-s">Sent by ${esc(e.author_name)}</p>` : ""}
          ${e.description ? `<p class="small muted mt-s">${esc(e.description.slice(0, 280))}${e.description.length > 280 ? "…" : ""}</p>` : ""}${e.link ? `<a class="xs" href="${esc(e.link)}" target="_blank" rel="noopener nofollow">${esc(e.link.slice(0, 60))}</a>` : ""}
          ${e.review_note ? `<p class="xs mt-s">Note: ${esc(e.review_note)}</p>` : ""}
          <div class="row mt">${e.status !== "approved" ? `<button class="btn sm primary" data-eap="${e.id}">${icon("check", "sm")} Approve</button>` : ""}${e.status !== "rejected" ? `<button class="btn sm danger-soft" data-erj="${e.id}">${icon("x", "sm")} ${e.status === "approved" ? "Unpublish" : "Reject"}</button>` : ""}
            <button class="btn sm ghost" data-epin="${e.id}" aria-label="${e.pinned ? "Unpin" : "Pin"}">${icon("star", "sm")}</button><button class="btn sm ghost" data-eed="${e.id}" aria-label="Edit">${icon("edit", "sm")}</button><button class="btn sm ghost" data-edel="${e.id}" aria-label="Delete">${icon("trash", "sm")}</button></div></article>`).join("")
          : `<div class="card"><p class="small muted">${st === "pending" ? "No suggestions waiting. Nice." : "Nothing here yet."}</p></div>`}</div>`;
      const reload = () => { h.refreshBadges?.(); return h.VIEWS.events(el); }, byId = (id) => rows.find((r) => r.id === id);
      const set = (id, patch, label) => act(label, byId(id).title, () => api().update("events", { id }, patch)).then(reload).catch((err) => toast(err.message, "error"));
      $$("[data-es]", el).forEach((b) => b.addEventListener("click", () => { el.dataset.st = b.dataset.es; reload(); }));
      $("#e-run", el).addEventListener("click", async (e) => { busy(e.currentTarget, true); try { const r = await api().runJob("events"); toast(r.ok ? "Updated from ewubd.edu" : "Fetch failed", r.ok ? "success" : "error", r.detail); } catch (err) { toast(err.message, "error"); } reload(); });
      $$("[data-eap]", el).forEach((b) => b.addEventListener("click", () => set(b.dataset.eap, { status: "approved", review_note: "" }, "Approved event")));
      $$("[data-erj]", el).forEach((b) => b.addEventListener("click", () => { const e = byId(b.dataset.erj); openModal(e.status === "approved" ? "Unpublish event" : "Reject event", `<form id="erf" class="stack"><p class="small">“${esc(e.title)}”${e.source === "user" ? " — the poster gets this note in their inbox." : ""}</p>
        <label class="field">Reason (optional)<input class="input" name="note" maxlength="300" placeholder="e.g. Not an EWU event, or missing date and venue"></label><div class="row"><span class="grow"></span><button class="btn danger">${icon("x", "sm")} ${e.status === "approved" ? "Unpublish" : "Reject"}</button></div></form>`,
        (m) => $("#erf", m).addEventListener("submit", (ev) => { ev.preventDefault(); closeModal(); set(e.id, { status: "rejected", review_note: String(new FormData(ev.target).get("note") || "").trim() }, "Rejected event"); })); }));
      $$("[data-epin]", el).forEach((b) => b.addEventListener("click", () => set(b.dataset.epin, { pinned: !byId(b.dataset.epin).pinned }, byId(b.dataset.epin).pinned ? "Unpinned event" : "Pinned event")));
      $$("[data-edel]", el).forEach((b) => b.addEventListener("click", () => confirmAct("Delete this event?", byId(b.dataset.edel).source === "auto" ? "Official events come back on the next fetch. Use Unpublish to keep one hidden." : "It can be restored from Change history.", "Delete",
        async () => { await act("Deleted event", byId(b.dataset.edel).title, () => api().remove("events", { id: b.dataset.edel })); reload(); })));
      const KINDS = [["workshop", "Workshop"], ["seminar", "Seminar & talk"], ["concert", "Concert"], ["cultural", "Cultural"], ["club_recruitment", "Club recruitment"], ["club_event", "Club event"], ["competition", "Competition"], ["fair", "Fair & expo"], ["sports", "Sports"], ["other", "Other"]];
      const local = (d) => d ? new Date(new Date(d).getTime() + 6 * 36e5).toISOString().slice(0, 16) : ""; // Dhaka wall-clock for <input type=datetime-local>
      const form = (e = { title: "", kind: "club_event", starts_at: "", ends_at: "", venue: "", organizer: "", description: "", link: "", image: "", all_day: false }) => openModal(e.id ? "Edit event" : "Add event", `<form id="ef" class="grid g2">
          <label class="field full-row">Title<input class="input" name="title" required minlength="3" maxlength="160" value="${esc(e.title)}"></label>
          <label class="field">Type<select class="select" name="kind">${KINDS.map(([v, l]) => `<option value="${v}" ${e.kind === v ? "selected" : ""}>${l}</option>`).join("")}</select></label><label class="field">Organizer<input class="input" name="organizer" maxlength="120" value="${esc(e.organizer)}"></label>
          <label class="field">Starts (Dhaka time)<input class="input" name="starts_at" type="datetime-local" required value="${local(e.starts_at)}"></label><label class="field">Ends (optional)<input class="input" name="ends_at" type="datetime-local" value="${local(e.ends_at)}"></label>
          <label class="field full-row row nowrap" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" class="check" name="all_day" ${e.all_day ? "checked" : ""}> All-day (ignore the times)</label>
          <label class="field full-row">Venue<input class="input" name="venue" maxlength="160" value="${esc(e.venue)}"></label>
          <label class="field full-row">Link (https)<input class="input" name="link" type="url" pattern="https://.+" value="${esc(e.link)}"></label>
          <div class="row nowrap full-row"><label class="field grow">Image (https)<input class="input" name="image" pattern="https://.+" value="${esc(e.image)}"></label><button type="button" class="btn outline" id="ef-pick" style="align-self:flex-end">${icon("image", "sm")} Library</button></div>
          <label class="field full-row">Description<textarea class="input" name="description" rows="4" maxlength="3000">${esc(e.description)}</textarea></label>
          <div class="row full-row"><span class="grow"></span><button class="btn primary">${icon("check")} ${e.id ? "Save" : "Publish"}</button></div></form>`, (m) => {
          $("#ef-pick", m).addEventListener("click", async () => { const u = await pickMedia(); if (u) m.querySelector('[name="image"]').value = u; });
          $("#ef", m).addEventListener("submit", async (ev) => {
            ev.preventDefault(); const f = Object.fromEntries(new FormData(ev.target)), tz = (v) => (v ? `${v}:00+06:00` : null);
            const row = { title: f.title.trim(), kind: f.kind, organizer: f.organizer.trim(), venue: f.venue.trim(), link: f.link.trim(), image: f.image.trim(), description: f.description.trim(), starts_at: tz(f.starts_at), ends_at: tz(f.ends_at), all_day: Boolean(f.all_day) };
            if (row.ends_at && new Date(row.ends_at) < new Date(row.starts_at)) return toast("It can't end before it starts", "warn");
            try { await act(e.id ? "Edited event" : "Added event", row.title, () => (e.id ? api().update("events", { id: e.id }, row) : api().insert("events", { ...row, source: "admin", status: "approved", author_name: "EWUdiots team" }))); closeModal(); toast("Saved", "success", "It's live in the app now."); reload(); }
            catch (err) { toast(err.message, "error"); }
          });
        });
      $("#e-add", el).addEventListener("click", () => form());
      $$("[data-eed]", el).forEach((b) => b.addEventListener("click", () => form(byId(b.dataset.eed))));
    },

    /* ═════════ News & notices feed (automatic + manual) ═════════ */
    async feed(el) {
      const kind = el.dataset.kind || "news", rows = await api().list("feed_items", { eq: { kind }, order: "date", limit: 300 });
      const q = (el.dataset.q || "").toLowerCase(), shown = rows.filter((r) => !q || `${r.title} ${r.title_override} ${r.tag} ${r.category}`.toLowerCase().includes(q));
      const runs = await api().list("job_runs", { eq: { job: kind === "news" ? "news" : "notices" }, order: "started_at", limit: 1 }).catch(() => []);
      el.innerHTML = `<div class="row"><div class="seg">${[["news", "Campus news"], ["notice", "Notice board"]].map(([v, l]) => `<button data-fk="${v}" aria-selected="${kind === v}">${l}</button>`).join("")}</div>
          <form class="searchbar grow" id="fq">${icon("search")}<input class="input" name="q" type="search" value="${esc(el.dataset.q || "")}" placeholder="Search titles"></form>
          <button class="btn outline" id="f-run">${icon("sync")} Fetch from ewubd.edu now</button><button class="btn primary" id="f-add">${icon("plus")} Add ${kind === "news" ? "news" : "notice"}</button></div>
        <p class="xs mt-s">${icon("zap", "sm")} Filled automatically every day from ${kind === "news" ? "ewubd.edu/news" : "the EWU notice board"}${runs[0] ? ` · last run ${ago(runs[0].started_at)} (${esc(runs[0].detail)})` : ""}. Hide, pin or rename any item: your changes survive the next update.</p>
        <section class="card mt tight">${shown.length ? shown.slice(0, 150).map((r) => `<div class="lrow ${r.hidden ? "dim" : ""}">${r.image ? `<img class="feed-thumb" src="${esc(r.image)}" alt="" loading="lazy">` : `<span class="itile sm ${kind === "news" ? "blue" : "orange"}">${icon(kind === "news" ? "globe" : "file")}</span>`}
          <span class="body"><b>${esc(r.title_override || r.title)}</b><span>${r.date ? esc(r.date) + " · " : ""}${esc(r.tag_override || r.tag || r.category || "")}${r.source === "manual" ? " · added by the team" : ""}${r.title_override ? " · renamed" : ""}</span></span>
          ${r.pinned ? '<span class="pill amber">Pinned</span>' : ""}${r.hidden ? '<span class="pill red">Hidden</span>' : ""}
          <button class="btn sm ghost" data-pin="${esc(r.id)}" aria-label="${r.pinned ? "Unpin" : "Pin"}">${icon("star", "sm")}</button><button class="btn sm ghost" data-hide="${esc(r.id)}" aria-label="${r.hidden ? "Show" : "Hide"}">${icon("eye", "sm")}</button><button class="btn sm ghost" data-fe="${esc(r.id)}" aria-label="Edit">${icon("edit", "sm")}</button></div>`).join("")
          : `<p class="small muted">Nothing yet. Press "Fetch from ewubd.edu now" to fill it.</p>`}</section>`;
      const reload = () => h.VIEWS.feed(el), byId = (id) => rows.find((r) => r.id === id);
      $$("[data-fk]", el).forEach((b) => b.addEventListener("click", () => { el.dataset.kind = b.dataset.fk; reload(); }));
      $("#fq", el).addEventListener("submit", (e) => { e.preventDefault(); el.dataset.q = new FormData(e.target).get("q"); reload(); });
      $("#f-run", el).addEventListener("click", async (e) => { busy(e.currentTarget, true); try { const r = await api().runJob(kind === "news" ? "news" : "notices"); toast(r.ok ? "Updated from ewubd.edu" : "Fetch failed", r.ok ? "success" : "error", r.detail); } catch (err) { toast(err.message, "error"); } reload(); });
      const set = (id, patch, label) => act(label, byId(id).title, () => api().update("feed_items", { id }, { ...patch, updated_at: new Date().toISOString() })).then(reload).catch((e) => toast(e.message, "error"));
      $$("[data-pin]", el).forEach((b) => b.addEventListener("click", () => set(b.dataset.pin, { pinned: !byId(b.dataset.pin).pinned }, byId(b.dataset.pin).pinned ? "Unpinned feed item" : "Pinned feed item")));
      $$("[data-hide]", el).forEach((b) => b.addEventListener("click", () => set(b.dataset.hide, { hidden: !byId(b.dataset.hide).hidden }, byId(b.dataset.hide).hidden ? "Showed feed item" : "Hid feed item")));
      const form = (r = { id: "", kind, title: "", url: "", image: "", excerpt: "", tag: "", date: new Date().toISOString().slice(0, 10), source: "manual" }) => openModal(r.id ? "Edit item" : `Add ${kind}`, `<form id="ff" class="stack">
          ${r.source === "auto" ? `<p class="xs">From ewubd.edu: “${esc(r.title)}”. Your title and tag replace the official ones in the app.</p><label class="field">Title shown in the app<input class="input" name="title_override" maxlength="300" value="${esc(r.title_override || "")}" placeholder="${esc(r.title)}"></label><label class="field">Tag<input class="input" name="tag_override" maxlength="30" value="${esc(r.tag_override || "")}" placeholder="${esc(r.tag || r.category)}"></label>`
            : `<label class="field">Title<input class="input" name="title" required minlength="2" maxlength="300" value="${esc(r.title)}"></label><label class="field">Link (https)<input class="input" name="url" type="url" pattern="https://.+" value="${esc(r.url)}"></label>
              <div class="row nowrap"><label class="field grow">Image (https)<input class="input" name="image" id="ff-img" pattern="https://.+" value="${esc(r.image)}"></label><button type="button" class="btn outline" id="ff-pick" style="align-self:flex-end">${icon("image", "sm")} Library</button></div>
              <label class="field">Summary<textarea class="input" name="excerpt" rows="3" maxlength="1000">${esc(r.excerpt)}</textarea></label><div class="grid g2"><label class="field">Tag<input class="input" name="tag" maxlength="30" value="${esc(r.tag)}"></label><label class="field">Date<input class="input" name="date" type="date" value="${esc(r.date || "")}"></label></div>`}
          <div class="row"><span class="grow"></span>${r.source === "manual" && r.id ? `<button type="button" class="btn danger-soft" id="ff-del">${icon("trash", "sm")} Delete</button>` : ""}<button class="btn primary">${icon("check")} Save</button></div></form>`, (m) => {
          $("#ff-pick", m)?.addEventListener("click", async () => { const u = await pickMedia(); if (u) form({ ...r, ...Object.fromEntries(new FormData($("#ff", m) || document.createElement("form"))), image: u }); });
          $("#ff-del", m)?.addEventListener("click", async () => { await act("Deleted feed item", r.title, () => api().remove("feed_items", { id: r.id })); closeModal(); reload(); });
          $("#ff", m).addEventListener("submit", async (e) => {
            e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
            try {
              if (r.source === "auto") await act("Edited feed item", r.title, () => api().update("feed_items", { id: r.id }, { title_override: f.title_override.trim(), tag_override: f.tag_override.trim(), updated_at: new Date().toISOString() }));
              else { const row = { kind, title: f.title.trim(), url: f.url.trim(), image: f.image.trim(), excerpt: f.excerpt.trim(), tag: f.tag.trim(), date: f.date || null, source: "manual", updated_at: new Date().toISOString() };
                await act(r.id ? "Edited feed item" : "Added feed item", row.title, () => (r.id ? api().update("feed_items", { id: r.id }, row) : api().insert("feed_items", { id: `manual:${crypto.randomUUID()}`, ...row }))); }
              closeModal(); toast("Saved", "success", "The app shows it within 30 minutes."); reload();
            } catch (err) { toast(err.message, "error"); }
          });
        });
      $("#f-add", el).addEventListener("click", () => form());
      $$("[data-fe]", el).forEach((b) => b.addEventListener("click", () => form(byId(b.dataset.fe))));
    },

    /* ═════════ All alumni (edit anything) + newsletter import ═════════ */
    async alumdb(el) {
      const tabv = el.dataset.t || "all";
      const head = `<div class="seg">${[["all", "All alumni"], ["import", "Newsletter import"]].map(([v, l]) => `<button data-at="${v}" aria-selected="${tabv === v}">${l}</button>`).join("")}</div>`;
      if (tabv === "import") return importView(el, head);
      const rows = await api().list("alumni_profiles", { limit: 2000 }), q = (el.dataset.q || "").toLowerCase();
      const shown = rows.filter((a) => !q || `${a.name} ${a.org} ${a.role} ${a.country} ${a.dept}`.toLowerCase().includes(q));
      el.innerHTML = `${head}<div class="row mt"><form class="searchbar grow" id="aq">${icon("search")}<input class="input" name="q" type="search" value="${esc(el.dataset.q || "")}" placeholder="Search ${rows.length} alumni"></form><button class="btn outline" id="a-csv">${icon("download")} CSV</button><button class="btn primary" id="a-add">${icon("plus")} Add alumni</button></div>
        <section class="card mt tight">${shown.slice(0, 200).map((a) => `<div class="lrow ${a.status !== "approved" ? "dim" : ""}"><span class="avatar sm">${esc(a.name.slice(0, 2).toUpperCase())}</span><span class="body"><b>${esc(a.name)}</b><span>${esc(a.role)} · ${esc(a.org)} · ${esc(a.country)}${a.source === "newsletter" ? " · newsletter" : a.source === "admin" ? " · added by the team" : " · submitted"}</span></span>
          <span class="pill ${a.status === "approved" ? "green" : a.status === "pending" ? "amber" : "red"}">${esc(a.status)}</span><button class="btn sm ghost" data-ae="${a.id}" aria-label="Edit">${icon("edit", "sm")}</button></div>`).join("") || '<p class="small muted">No alumni match.</p>'}</section>`;
      $$("[data-at]", el).forEach((b) => b.addEventListener("click", () => { el.dataset.t = b.dataset.at; h.VIEWS.alumdb(el); }));
      $("#aq", el).addEventListener("submit", (e) => { e.preventDefault(); el.dataset.q = new FormData(e.target).get("q"); h.VIEWS.alumdb(el); });
      $("#a-csv", el).addEventListener("click", () => downloadCSV("alumni", shown, ["name", "role", "org", "country", "dept", "sector", "kind", "status", "source", "source_url", "note"]));
      $("#a-add", el).addEventListener("click", () => alumForm(null, el));
      $$("[data-ae]", el).forEach((b) => b.addEventListener("click", () => alumForm(rows.find((a) => String(a.id) === b.dataset.ae), el)));
    },

    /* ═════════ Analytics (cookie-free) ═════════ */
    async analytics(el) {
      const days = Number(el.dataset.d || 30), a = await api().rpc("admin_analytics", { days });
      const bars = (list, key) => { const max = Math.max(1, ...list.map((x) => x.n)); return list.map((x) => `<div class="hbar"><span class="grow ellipsis">${esc(x[key])}</span><b>${x.n}</b><i style="width:${(x.n / max) * 100}%"></i></div>`).join("") || '<p class="small muted">No data yet.</p>'; };
      el.innerHTML = `<div class="row"><div class="seg">${[[7, "7 days"], [30, "30 days"], [90, "90 days"]].map(([d, l]) => `<button data-ad="${d}" aria-selected="${d === days}">${l}</button>`).join("")}</div><span class="grow"></span><button class="btn outline sm" id="an-csv">${icon("download")} CSV</button></div>
        <div class="kpis mt">${[["eye", "purple", a.views, "Page views", delta(a.views, a.views_prev)], ["user", "green", a.visitors, "Visitors", delta(a.visitors, a.visitors_prev)], ["chart", "blue", a.visitors ? (a.views / a.visitors).toFixed(1) : 0, "Pages per visitor", ""]]
          .map(([i, t, n, l, d], k) => `<div class="kpi fx-rise" style="--i:${k}"><span class="itile ${t}">${icon(i)}</span><b>${n}</b><span>${l} ${d}</span></div>`).join("")}</div>
        <section class="card mt"><div class="card-h"><h2>Views per day</h2><span class="xs">vs the previous ${days} days</span></div>${barChart(a.daily)}</section>
        <div class="grid g3 mt"><section class="card"><h2>Top pages</h2><div class="mt-s">${bars(a.pages, "path")}</div></section><section class="card"><h2>Where visitors come from</h2><div class="mt-s">${bars(a.sources, "source")}</div></section><section class="card"><h2>Devices</h2><div class="mt-s">${bars(a.devices, "device")}</div></section></div>
        <p class="xs mt">No cookies. A visitor is a daily-changing fingerprint, never an IP address. "Do Not Track" is respected and bots are skipped.</p>`;
      $$("[data-ad]", el).forEach((b) => b.addEventListener("click", () => { el.dataset.d = b.dataset.ad; h.VIEWS.analytics(el); }));
      $("#an-csv", el).addEventListener("click", () => downloadCSV("analytics-daily", a.daily, ["day", "n"]));
    },

    /* ═════════ Scheduled jobs ═════════ */
    async jobs(el) {
      const runs = await api().list("job_runs", { order: "started_at", limit: 60 });
      const JOBS = [["news", "globe", "Campus news", "Reads ewubd.edu/news into the feed"], ["notices", "file", "Notice board", "Reads the EWU notice board into the feed"], ["events", "calendar", "Campus events", "Reads ewubd.edu/events into Events"], ["newsletters", "mail", "Newsletters", "Finds new EWU newsletters for alumni import"], ["cleanup", "trash", "Clean-up", "Empties 30-day trash, old analytics and logs"]];
      el.innerHTML = `<p class="small muted">These run automatically every day at about 8 AM Dhaka time. Run one now if you need fresh data.</p>
        <div class="adm-cards mt">${JOBS.map(([id, ic, t, d]) => { const last = runs.find((r) => r.job === id); return `<article class="card"><div class="row nowrap"><span class="itile ${last && !last.ok ? "red" : "purple"}">${icon(ic)}</span><div class="grow"><b>${t}</b><p class="xs">${d}</p></div></div>
          <p class="small mt-s">${last ? `${last.ok ? "✓" : "✗"} ${ago(last.started_at)} · ${esc(last.detail)} · ${last.ms} ms` : "Hasn't run yet"}</p><button class="btn sm primary mt-s" data-run="${id}">${icon("play", "sm")} Run now</button></article>`; }).join("")}</div>
        <section class="card mt tight"><div class="card-h"><h2>Run history</h2></div>${runs.map((r) => `<div class="lrow"><span class="itile sm ${r.ok ? "green" : "red"}">${icon(r.ok ? "checkc" : "alert")}</span><span class="body"><b>${esc(r.job)} · ${esc(r.detail)}</b><span>${ago(r.started_at)} · ${r.ms} ms · ${esc(r.trigger)}</span></span></div>`).join("") || '<p class="small muted">No runs yet.</p>'}</section>`;
      $$("[data-run]", el).forEach((b) => b.addEventListener("click", async () => { busy(b, true); try { const r = await api().runJob(b.dataset.run); toast(r.ok ? "Done" : "Failed", r.ok ? "success" : "error", r.detail); } catch (e) { toast(e.message, "error"); } h.VIEWS.jobs(el); }));
    },

    /* ═════════ Change history: compare and restore ═════════ */
    async history(el) {
      const rows = await api().list("revisions", { limit: 200 }), f = el.dataset.f || "all";
      const shown = rows.filter((r) => f === "all" || r.table_name === f);
      const label = (r) => r.table_name === "site_settings" ? `Setting: ${r.row_key}` : r.table_name === "posts" ? `Post: ${r.data.title}` : r.table_name === "feed_items" ? `Feed: ${r.data.title_override || r.data.title}` : r.table_name === "events" ? `Event: ${r.data.title}` : `Alumni: ${r.data.name}`;
      el.innerHTML = `<div class="seg">${[["all", "Everything"], ["posts", "Posts"], ["site_settings", "Settings"], ["feed_items", "Feed"], ["events", "Events"], ["alumni_profiles", "Alumni"]].map(([v, l]) => `<button data-hf="${v}" aria-selected="${f === v}">${l}</button>`).join("")}</div>
        <p class="xs mt-s">Every change keeps the version before it. Compare it with what's live now, and restore it if needed.</p>
        <section class="card mt tight">${shown.map((r) => `<div class="lrow"><span class="itile sm purple">${icon("clock")}</span><span class="body"><b>${esc(label(r))}</b><span>Version from before ${ago(r.created_at)} · changed by ${esc(r.actor)}</span></span><button class="btn sm" data-hv="${r.id}">${icon("eye", "sm")} Compare</button></div>`).join("") || '<p class="small muted">No changes recorded yet.</p>'}</section>`;
      $$("[data-hf]", el).forEach((b) => b.addEventListener("click", () => { el.dataset.f = b.dataset.hf; h.VIEWS.history(el); }));
      $$("[data-hv]", el).forEach((b) => b.addEventListener("click", async () => {
        const r = rows.find((x) => String(x.id) === b.dataset.hv), key = r.table_name === "site_settings" ? "key" : "id", keyVal = r.table_name === "site_settings" ? r.row_key : r.data.id;
        const cur = (await api().list(r.table_name, { eq: { [key]: keyVal }, order: null, limit: 1 }))[0];
        const before = flat(r.table_name === "site_settings" ? r.data.value : r.data), now = cur ? flat(r.table_name === "site_settings" ? cur.value : cur) : "(deleted)";
        openModal(label(r), `<p class="xs"><del>Red</del> is only in the old version, <ins>green</ins> is only in the current one.</p><pre class="diff">${diffWords(before, now)}</pre>
          <div class="row mt"><span class="grow"></span><button class="btn primary" id="h-restore">${icon("reset")} Restore this version</button></div>`, (m) => $("#h-restore", m).addEventListener("click", async () => {
          const data = { ...r.data }; delete data.created_at;
          try {
            if (r.table_name === "site_settings") await api().upsert("site_settings", { key: r.row_key, value: data.value, updated_at: new Date().toISOString() });
            else if (cur) { const { id, ...rest } = data; await api().update(r.table_name, { id }, rest); }
            else await api().insert(r.table_name, data);
            await api().log("Restored a version", label(r)).catch(() => {}); closeModal(); toast("Restored", "success", "The current version was saved in history too."); h.VIEWS.history(el);
          } catch (e) { toast(e.message, "error"); }
        }));
      }));
    },

    /* ═════════ Roles & permissions ═════════ */
    async roles(el) {
      const rows = await api().list("role_permissions", { order: null }), owner = h.me().role === "owner";
      const ROLES = [["admin", "Admin"], ["editor", "Editor"], ["moderator", "Moderator"]];
      const has = (role, p) => (rows.find((r) => r.role === role)?.perms || []).includes(p);
      el.innerHTML = `<p class="small muted">Owners can do everything, always (so nobody can lock themselves out). Choose what the other roles can do. The server checks these on every action, not just this page.</p>
        <div class="table-wrap card mt"><table class="perm-table"><thead><tr><th>Permission</th>${ROLES.map(([, l]) => `<th>${l}</th>`).join("")}</tr></thead><tbody>
        ${PERMS.map(([p, l]) => `<tr><td><b>${esc(l)}</b><span class="xs" style="display:block">${p}</span></td>${ROLES.map(([r]) => `<td><input type="checkbox" class="check" data-perm="${r}|${p}" ${has(r, p) ? "checked" : ""} ${owner ? "" : "disabled"} aria-label="${esc(l)} for ${r}"></td>`).join("")}</tr>`).join("")}</tbody></table></div>
        ${owner ? `<div class="row mt"><span class="grow"></span><button class="btn primary" id="rp-save">${icon("check")} Save permissions</button></div>` : '<p class="xs mt">Only owners can change permissions.</p>'}`;
      $("#rp-save", el)?.addEventListener("click", async (e) => {
        busy(e.currentTarget, true);
        try { for (const [r] of ROLES) await api().upsert("role_permissions", { role: r, perms: $$(`[data-perm^="${r}|"]`, el).filter((c) => c.checked).map((c) => c.dataset.perm.split("|")[1]), updated_at: new Date().toISOString() });
          await api().log("Changed role permissions", "").catch(() => {}); toast("Permissions saved", "success", "They apply right away."); }
        catch (err) { toast(err.message, "error"); }
        busy(e.currentTarget, false);
      });
    }
  };

  function alumForm(a, el) {
    const r = a || { name: "", role: "", org: "", country: "Bangladesh", dept: "", sector: "", kind: "job", note: "", source_url: "", status: "approved" };
    openModal(a ? `Edit ${a.name}` : "Add alumni", `<form id="af" class="grid g2">
      <label class="field">Name<input class="input" name="name" required minlength="2" maxlength="80" value="${esc(r.name)}"></label><label class="field">Department<input class="input" name="dept" value="${esc(r.dept)}" placeholder="CSE"></label>
      <label class="field">Role / programme<input class="input" name="role" required minlength="2" maxlength="120" value="${esc(r.role)}"></label><label class="field">Organisation / university<input class="input" name="org" required minlength="2" maxlength="120" value="${esc(r.org)}"></label>
      <label class="field">Country<input class="input" name="country" value="${esc(r.country)}"></label><label class="field">Sector<input class="input" name="sector" value="${esc(r.sector)}" placeholder="Technology"></label>
      <label class="field">Type<select class="select" name="kind">${[["job", "Working"], ["study", "Higher study"], ["award", "Award"]].map(([v, l]) => `<option value="${v}" ${r.kind === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="field">Status<select class="select" name="status">${["approved", "pending", "rejected"].map((s) => `<option ${r.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></label>
      <label class="field full-row">Note<textarea class="input" name="note" rows="2" maxlength="400">${esc(r.note)}</textarea></label>
      <label class="field full-row">Source (newsletter PDF, https)<input class="input" name="source_url" pattern="https://.+" value="${esc(r.source_url || "")}"></label>
      <div class="row full-row"><span class="grow"></span>${a ? `<button type="button" class="btn danger-soft" id="af-del">${icon("trash", "sm")} Delete</button>` : ""}<button class="btn primary">${icon("check")} Save</button></div></form>`, (m) => {
      $("#af-del", m)?.addEventListener("click", () => { closeModal(); confirmAct(`Delete ${esc(a.name)}?`, "Removes them from the Alumni section. You can restore it from History.", "Delete", async () => { await act("Deleted alumni", a.name, () => api().remove("alumni_profiles", { id: a.id })); h.VIEWS.alumdb(el); }); });
      $("#af", m).addEventListener("submit", async (e) => {
        e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); Object.keys(f).forEach((k) => { f[k] = String(f[k]).trim(); });
        try { await act(a ? "Edited alumni" : "Added alumni", f.name, () => (a ? api().update("alumni_profiles", { id: a.id }, f) : api().insert("alumni_profiles", { ...f, user_id: null, source: "admin" }))); closeModal(); toast("Saved"); h.VIEWS.alumdb(el); }
        catch (err) { toast(err.message, "error"); }
      });
    });
  }

  /* Newsletter import: the daily job finds new issues; this reads the PDF, drafts alumni entries and lets you fix and add them. */
  async function importView(el, head) {
    const issues = await api().list("newsletter_issues", { order: "date", limit: 60 });
    el.innerHTML = `${head}<p class="small muted mt">New EWU newsletters appear here automatically. Open one: EWUdiots reads its “Alumni Success Stories” and drafts entries for you to check before they go live.</p>
      <section class="card mt tight">${issues.map((i) => `<div class="lrow">${i.image ? `<img class="feed-thumb" src="${esc(i.image)}" alt="" loading="lazy">` : `<span class="itile sm green">${icon("mail")}</span>`}<span class="body"><b>${esc(i.title)}</b><span>${esc(i.date || "")} · found ${ago(i.found_at)}</span></span>
        <span class="pill ${i.status === "new" ? "amber" : i.status === "imported" ? "green" : ""}">${esc(i.status)}</span><button class="btn sm ${i.status === "new" ? "primary" : ""}" data-imp="${esc(i.url)}">${icon("sparkle", "sm")} Read alumni</button></div>`).join("") || '<p class="small muted">No issues found yet. Run the Newsletters job in Scheduled jobs.</p>'}</section><div id="imp" class="mt"></div>`;
    $$("[data-at]", el).forEach((b) => b.addEventListener("click", () => { el.dataset.t = b.dataset.at; h.VIEWS.alumdb(el); }));
    $$("[data-imp]", el).forEach((b) => b.addEventListener("click", async () => {
      const issue = issues.find((i) => i.url === b.dataset.imp), box = $("#imp", el);
      box.innerHTML = `<div class="card"><div class="skel" style="height:80px"></div><p class="xs mt-s">Reading the PDF…</p></div>`;
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/legacy/build/pdf.worker.mjs?url")).default;
        const doc = await pdfjs.getDocument({ url: "/api/pdf?url=" + encodeURIComponent(issue.url), isEvalSupported: false }).promise;
        let text = "";
        for (let p = 1; p <= doc.numPages; p++) { const c = await (await doc.getPage(p)).getTextContent(); text += c.items.map((x) => x.str).join(" ") + "\n"; }
        const drafts = draftAlumni(text);
        box.innerHTML = `<section class="card"><div class="card-h"><h2>${esc(issue.title)}: ${drafts.length} draft${drafts.length === 1 ? "" : "s"}</h2><a class="btn sm ghost" href="${esc(issue.url)}" target="_blank" rel="noopener">${icon("external", "sm")} Open PDF</a></div>
          ${drafts.length ? `<p class="xs">Check each one, fix what's wrong, untick anything that isn't an alumni story, then add.</p><div class="table-wrap"><table class="rv-table"><thead><tr><th></th><th>Name</th><th>Role</th><th>Organisation</th><th>Country</th><th>Dept</th></tr></thead><tbody>
            ${drafts.map((d, i) => `<tr data-row="${i}"><td><input type="checkbox" class="check" data-k="keep" ${d.role && d.org ? "checked" : ""}></td>${["name", "role", "org", "country", "dept"].map((k) => `<td><input class="input" data-k="${k}" value="${esc(d[k])}"></td>`).join("")}</tr>`).join("")}</tbody></table></div>
            <div class="row mt"><button class="btn ghost" id="imp-skip">Mark issue as done without adding</button><span class="grow"></span><button class="btn primary" id="imp-add">${icon("plus")} Add ticked alumni</button></div>`
            : `<p class="small muted">No alumni stories were recognised in this issue. You can add people by hand in All alumni.</p><div class="row mt"><span class="grow"></span><button class="btn" id="imp-skip">Mark issue as done</button></div>`}</section>`;
        const done = (status) => api().update("newsletter_issues", { url: issue.url }, { status });
        $("#imp-skip", box)?.addEventListener("click", async () => { await done("ignored").catch(() => {}); h.VIEWS.alumdb(el); });
        $("#imp-add", box)?.addEventListener("click", async (e) => {
          busy(e.currentTarget, true); let n = 0;
          for (const tr of $$("tr[data-row]", box)) {
            const v = Object.fromEntries($$("[data-k]", tr).map((i) => [i.dataset.k, i.type === "checkbox" ? i.checked : i.value.trim()]));
            if (!v.keep || v.name.length < 2 || v.role.length < 2 || v.org.length < 2) continue;
            const d = drafts[+tr.dataset.row];
            try { await api().insert("alumni_profiles", { user_id: null, status: "approved", source: "newsletter", source_url: issue.url, name: v.name, role: v.role, org: v.org, country: v.country || "Bangladesh", dept: v.dept, kind: d.kind, note: d.note.slice(0, 400) }); n++; } catch (err) { toast(`${v.name}: ${err.message}`, "error"); }
          }
          await done("imported").catch(() => {}); await api().log("Imported alumni from newsletter", `${issue.title}: ${n}`).catch(() => {});
          toast(`Added ${n} alumni`, "success", "They're live in the app's Alumni section."); h.VIEWS.alumdb(el);
        });
      } catch (err) { box.innerHTML = `<div class="alert red">${icon("alert")}<div><b>Couldn't read this newsletter</b><p>${esc(err.message)}</p></div></div>`; }
    }));
  }
}
