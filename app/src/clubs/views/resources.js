/* Resource library (#/club/resources?c=…&folder=…&tab=…), from the "Resource Library" board. Library: type chips,
   featured resources, folder grid, recent files. Folder: header, Files / Overview / Activity / Shared With tabs, a file
   grid with picture thumbnails and a file preview (PDFs drawn in the app with pdf.js, so it works on phones too).
   Files live in the private bucket behind 5-minute signed links; members see them, resources.manage organises them. */

const TYPES = [["all", "All", ""], ["pdf", "Documents", "file"], ["ppt", "Presentations", "play"], ["img", "Images", "image"], ["xls", "Sheets", "grid"], ["link", "Links", "link"], ["other", "Others", "paperclip"]];
const COLORS = ["purple", "blue", "amber", "pink", "green", "teal", "orange", "gray"];
const FOLDER_HEX = { purple: "#8b7bff", blue: "#3b82f6", amber: "#f5b301", pink: "#f472a6", green: "#4ccf7f", teal: "#22b8c9", orange: "#fb8a3c", gray: "#94a3b8" };
const kindOf = (d) => { const s = `${d.title} ${d.mime} ${d.url}`.toLowerCase(); return d.url && !d.path ? "link" : /pdf|word|docx?/.test(s) ? "pdf" : /presentation|pptx?/.test(s) ? "ppt" : /image|png|jpe?g|webp/.test(s) ? "img" : /sheet|xlsx?|csv/.test(s) ? "xls" : "other"; };
const isPdf = (d) => !!d.path && /pdf/i.test(`${d.mime} ${d.title}`);

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store, ctx } = kit;
  let type = "all", q = "", sort = "new", pv = null; // pv: the file shown in the folder's preview

  pages["club/resources"] = () => {
    const c = kit.param("c") || kit.myClubs()[0]?.club_id || "", folderId = kit.param("folder") || "";
    const g = kit.memberGate(c, "the resource library"); if (g) return g;
    if (!kit.feature(c, "resources")) return ui.emptyBox("folder", "Resources are switched off", "The club admin can turn them on in Manage → Features.");
    const fe = store.use(`club:folders:${c}`, () => api.folders(c), { ttl: 60e3 }), de = store.use(`club:res:${c}`, () => api.resources(c), { ttl: 45e3 });
    const can = kit.can(c, "resources.manage") || kit.can(c, "docs.manage");
    const folders = fe.value || [], docs = de.value || [], folder = folders.find((f) => f.id === folderId);
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = docs.filter((d) => (!folderId || d.folder_id === folderId) && (type === "all" || kindOf(d) === type) && (!words.length || words.every((w) => `${d.title} ${d.description}`.toLowerCase().includes(w))))
      .sort((a, b) => (sort === "name" ? a.title.localeCompare(b.title) : sort === "old" ? new Date(a.created_at) - new Date(b.created_at) : new Date(b.created_at) - new Date(a.created_at)));
    const fname = (d) => folders.find((f) => f.id === d.folder_id)?.name || "General";
    const fileRow = (d) => `<div class="rs-file">${ui.ftype(d.url && !d.path ? d.url : d.title, d.mime)}<button class="rs-open" data-doc="${d.id}"><b>${esc(d.title)}</b>
        <span class="xs">${esc(fname(d))} · ${ui.size(d.size) || "Link"} · ${ui.dateShort(d.created_at)}${d.audience === "exec" ? " · Executives" : ""}</span></button>
        <button class="icon-btn" data-doc="${d.id}" aria-label="Open ${esc(d.title)}">${icon(d.url && !d.path ? "external" : "download")}</button>${can ? `<button class="icon-btn" data-dmenu="${d.id}" aria-label="More for ${esc(d.title)}">${icon("more")}</button>` : ""}</div>`;
    const sortSel = ui.select("sort", [["new", "Latest First"], ["old", "Oldest First"], ["name", "Name"]], sort, 'id="rs-sort" style="width:auto" aria-label="Sort files"');
    if (de.loading && !de.value) return ui.skeleton(4, 64);
    return folder ? folderPage(c, folder, list, docs.filter((d) => d.folder_id === folderId), can, sortSel)
      : `${kit.back(`#/club/space?c=${c}`, kit.membership(c)?.short_name || "Club")}${ui.ph("Resources", "Learn, collaborate, and access club resources", can ? `<button class="btn primary" id="rs-up">${icon("plus")} Upload</button>` : "")}
      <div class="searchbar cl-search">${icon("search")}<input class="input" id="rs-q" type="search" placeholder="Search files, folders, or topics…" value="${esc(q)}" autocomplete="off"></div>
      <div class="cl-chips rs-types mt-s">${TYPES.map(([v, l, ic]) => `<button class="${type === v ? "on" : ""}" data-ty="${v}" aria-pressed="${type === v}">${ic ? icon(ic, "sm") : ""}${l}</button>`).join("")}</div>
      ${type === "all" && !q && docs.some((d) => d.featured) ? `${ui.sec("Featured Resources")}<div class="cl-hscroll">${docs.filter((d) => d.featured).slice(0, 8).map((d) => `<button class="cl-fcard rs-feat" data-doc="${d.id}"><span class="th">${ui.ftype(d.url && !d.path ? d.url : d.title, d.mime)}</span><b class="clamp2">${esc(d.title)}</b><span class="xs">${(kindOf(d) === "link" ? "Link" : kindOf(d).toUpperCase())}${d.size ? ` · ${ui.size(d.size)}` : ""}</span></button>`).join("")}</div>` : ""}
      ${ui.sec("Folders", can ? `<button class="btn sm soft" id="rs-fnew">${icon("plus", "sm")} New folder</button>` : "")}
      ${folders.length ? `<div class="cl-fgrid">${folders.map((f) => `<a class="cl-folder2" href="#/club/resources?c=${c}&folder=${f.id}" style="color:inherit"><span style="color:${FOLDER_HEX[f.color] || FOLDER_HEX.purple}">${icon("folder")}</span><span class="min0"><b class="ellipsis">${esc(f.name)}</b><span class="xs">${ui.plural(docs.filter((d) => d.folder_id === f.id).length, "file")}${f.audience === "exec" ? " · Executives" : ""}</span></span></a>`).join("")}</div>` : `<p class="small muted">No folders yet.</p>`}
      ${ui.sec("Recent Files", sortSel)}
      ${list.length ? `<div class="card tight">${list.slice(0, 40).map(fileRow).join("")}</div>` : ui.emptyBox("folder", "No files here", can ? "Upload templates, guides and slides for your members." : "Your club's shared files appear here.")}`;
  };

  /** One folder: header, tabs, grid of files and the preview. */
  function folderPage(c, folder, list, inFolder, can, sortSel) {
    const tab = ["files", "overview", "activity", "shared"].includes(kit.param("tab")) ? kit.param("tab") : "files", base = `#/club/resources?c=${c}&folder=${folder.id}`;
    const last = inFolder[0]?.created_at, total = inFolder.reduce((s, d) => s + (d.size || 0), 0);
    const thumbs = store.use(`club:thumbs:${folder.id}:${inFolder.filter((d) => kindOf(d) === "img").length}`, async () => Object.fromEntries(await Promise.all(inFolder.filter((d) => kindOf(d) === "img" && d.path).slice(0, 24).map(async (d) => [d.id, await api.signedUrl(d.path).catch(() => "")]))), { ttl: 240e3 }).value || {};
    if (!pv || !inFolder.some((d) => d.id === pv)) pv = (inFolder.find(isPdf) || inFolder.find((d) => kindOf(d) === "img"))?.id || null;
    const sel = inFolder.find((d) => d.id === pv);
    const body = tab === "overview" ? `<dl class="cl-kv">${[["Description", folder.description || "No description"], ["Files", ui.plural(inFolder.length, "file")], ["Total size", ui.size(total) || "—"], ["Last updated", last ? ui.dateLong(last) : "—"], ["Created", ui.dateLong(folder.created_at)], ["Who can see it", folder.audience === "exec" ? "Executives only" : "All club members"]].map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`
      : tab === "activity" ? (inFolder.length ? `<div class="cl-list">${inFolder.slice(0, 30).map((d) => `<div class="cl-li"><span class="itile sm blue">${icon("upload")}</span><span class="body"><b class="ellipsis">${esc(d.title)}</b><span>Added ${ui.ago(d.created_at)}</span></span></div>`).join("")}</div>` : `<p class="small muted">Nothing has happened in this folder yet.</p>`)
      : tab === "shared" ? `<div class="cl-note"><span class="itile purple">${icon(folder.audience === "exec" ? "lock" : "users")}</span><div class="grow"><b>${folder.audience === "exec" ? "Executives only" : "All club members"}</b><span class="xs">${folder.audience === "exec" ? "Only the executive committee can open these files." : "Everyone in the club can open these files. Nobody outside the club can."}</span></div>${can ? `<button class="btn sm soft" id="rs-fedit2">Change</button>` : ""}</div>`
      : `<div class="row nowrap" style="gap:8px"><div class="searchbar cl-search grow">${icon("search")}<input class="input" id="rs-q" type="search" placeholder="Search in this folder…" value="${esc(q)}" autocomplete="off"></div>${sortSel}</div>
        ${list.length ? `<div class="cl-fgrid mt-s">${list.map((d) => `<div class="cl-fcard ${d.id === pv ? "on" : ""}"><button class="th" data-pv="${d.id}" aria-label="Preview ${esc(d.title)}" style="border:0;cursor:pointer;padding:0">${thumbs[d.id] ? `<img src="${esc(thumbs[d.id])}" alt="" loading="lazy">` : ui.ftype(d.url && !d.path ? d.url : d.title, d.mime)}</button>
            <b class="clamp2">${esc(d.title)}</b><span class="xs">${kindOf(d) === "link" ? "Link" : kindOf(d).toUpperCase()}${d.size ? ` · ${ui.size(d.size)}` : ""}</span>
            <span class="row between xs">${ui.dateShort(d.created_at)}<span><button class="icon-btn" data-doc="${d.id}" aria-label="Open ${esc(d.title)}">${icon(d.url && !d.path ? "external" : "download", "sm")}</button>${can ? `<button class="icon-btn" data-dmenu="${d.id}" aria-label="More for ${esc(d.title)}">${icon("more", "sm")}</button>` : ""}</span></span></div>`).join("")}</div>`
          : ui.emptyBox("folder", q || type !== "all" ? "No files match" : "This folder is empty", can ? "Upload the first file with Upload." : "Files your club shares here will show up.")}
        ${sel ? `${ui.sec("File Preview")}<section class="card tight rs-pv"><div class="row nowrap" style="gap:10px;padding:10px">${ui.ftype(sel.title, sel.mime)}<span class="grow min0"><b class="ellipsis" style="display:block">${esc(sel.title)}</b><span class="xs">${ui.size(sel.size)}</span></span><button class="icon-btn" data-doc="${sel.id}" aria-label="Open full size">${icon("external")}</button></div>
          <div id="rs-pv" class="rs-pvbody">${kindOf(sel) === "img" && thumbs[sel.id] ? `<img src="${esc(thumbs[sel.id])}" alt="${esc(sel.title)}">` : `<p class="small muted" style="padding:16px">Loading preview…</p>`}</div></section>` : ""}`;
    return `${kit.back(`#/club/resources?c=${c}`, "Resources")}
      <header class="cl-ph rs-fhead"><div class="row nowrap" style="gap:14px"><span class="rs-fic" style="color:${FOLDER_HEX[folder.color] || FOLDER_HEX.purple}">${icon("folder")}</span><div class="min0"><h1>${esc(folder.name)}</h1>${folder.description ? `<p>${esc(folder.description)}</p>` : ""}<p class="xs">${ui.plural(inFolder.length, "file")}${last ? ` · Last updated: ${ui.dateShort(last)}` : ""}</p></div></div>
        ${can ? `<div class="actions"><button class="icon-btn" id="rs-fedit" aria-label="Edit folder">${icon("more")}</button></div>` : ""}</header>
      <div class="row nowrap" style="gap:8px;align-items:flex-start"><nav class="cl-seg sm grow" role="tablist">${[["files", "Files"], ["overview", "Overview"], ["activity", "Activity"], ["shared", "Shared With"]].map(([v, l]) => `<a role="tab" href="${base}&tab=${v}" aria-selected="${tab === v}">${l}</a>`).join("")}</nav>
        ${can ? `<button class="btn primary sm" id="rs-up">${icon("upload", "sm")} Upload</button>` : ""}</div>
      <div class="mt-s">${body}</div>`;
  }

  pages["club/resources"].mount = (el) => {
    kit.bindRetry(el);
    const c = kit.param("c") || kit.myClubs()[0]?.club_id, folderId = kit.param("folder") || "";
    const reload = () => store.invalidate(`club:res:${c}`, `club:folders:${c}`, "club:thumbs:");
    const input = kit.$("#rs-q", el);
    input?.addEventListener("input", () => { q = input.value; const pos = input.selectionStart; ctx.rerender(); const i = kit.$("#rs-q"); if (i) { i.focus(); i.setSelectionRange(pos, pos); } });
    kit.$$("[data-ty]", el).forEach((b) => b.addEventListener("click", () => { type = b.dataset.ty; ctx.rerender(); }));
    kit.$("#rs-sort", el)?.addEventListener("change", (e) => { sort = e.target.value; ctx.rerender(); });
    const docs = store.peek(`club:res:${c}`) || [], folders = store.peek(`club:folders:${c}`) || [];
    kit.$$("[data-doc]", el).forEach((b) => b.addEventListener("click", () => preview(docs.find((d) => d.id === b.dataset.doc))));
    kit.$$("[data-pv]", el).forEach((b) => b.addEventListener("click", () => { pv = b.dataset.pv; ctx.rerender(); kit.$("#rs-pv")?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }));
    kit.$("#rs-up", el)?.addEventListener("click", () => upload(c, folderId, folders, reload));
    kit.$("#rs-fnew", el)?.addEventListener("click", () => editFolder({ club_id: c }, reload));
    kit.$$("#rs-fedit, #rs-fedit2", el).forEach((b) => b.addEventListener("click", () => editFolder(folders.find((f) => f.id === folderId), reload)));
    kit.$$("[data-dmenu]", el).forEach((b) => b.addEventListener("click", () => docMenu(docs.find((d) => d.id === b.dataset.dmenu), folders, reload)));
    const sel = docs.find((d) => d.id === pv), box = kit.$("#rs-pv", el);
    if (box && sel && isPdf(sel)) pdfViewer(box, sel);
  };

  /** Draw a PDF page by page with pdf.js: page number, zoom, download. */
  async function pdfViewer(box, d) {
    try {
      const url = await api.signedUrl(d.path);
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/legacy/build/pdf.worker.mjs?url")).default;
      const doc = await pdfjs.getDocument({ url, isEvalSupported: false, disableFontFace: true }).promise;
      let page = 1, zoom = 1;
      box.innerHTML = `<div class="rs-pvbar"><span><span id="pv-n">1</span> / ${doc.numPages}</span><button class="icon-btn" data-p="-1" aria-label="Previous page">${icon("chevL", "sm")}</button><button class="icon-btn" data-p="1" aria-label="Next page">${icon("chevR", "sm")}</button>
        <span class="push"></span><button class="icon-btn" data-z="-1" aria-label="Zoom out">${icon("minus", "sm")}</button><span id="pv-z">100%</span><button class="icon-btn" data-z="1" aria-label="Zoom in">${icon("plus", "sm")}</button>
        <a class="icon-btn" href="${esc(url)}" target="_blank" rel="noopener" download aria-label="Download">${icon("download", "sm")}</a></div><div class="rs-pvpage"><canvas></canvas></div>`;
      const canvas = box.querySelector("canvas");
      const draw = async () => {
        const p = await doc.getPage(page), w = box.clientWidth || 340, base = p.getViewport({ scale: 1 }), vp = p.getViewport({ scale: (w / base.width) * zoom * (devicePixelRatio || 1) });
        canvas.width = vp.width; canvas.height = vp.height; canvas.style.width = `${(w * zoom) | 0}px`;
        await p.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
        box.querySelector("#pv-n").textContent = String(page); box.querySelector("#pv-z").textContent = `${Math.round(zoom * 100)}%`;
      };
      box.querySelectorAll("[data-p]").forEach((b) => b.addEventListener("click", () => { page = Math.min(doc.numPages, Math.max(1, page + Number(b.dataset.p))); draw(); }));
      box.querySelectorAll("[data-z]").forEach((b) => b.addEventListener("click", () => { zoom = Math.min(3, Math.max(0.5, zoom + Number(b.dataset.z) * 0.25)); draw(); }));
      await draw();
    } catch { box.innerHTML = `<p class="small muted" style="padding:16px">Couldn't show this PDF here. Use the open button above.</p>`; }
  }

  async function preview(d) {
    if (!d) return;
    try {
      const url = d.url && !d.path ? d.url : await api.signedUrl(d.path);
      if (kindOf(d) !== "img") return void window.open(url, "_blank", "noopener");
      ui.sheet(d.title, `<img src="${esc(url)}" alt="${esc(d.title)}" style="width:100%;border-radius:14px"><a class="btn outline block mt-s" href="${esc(url)}" target="_blank" rel="noopener" download>${icon("download")} Download</a>`);
    } catch (e) { kit.toast(e.message, "error"); }
  }
  function upload(c, folderId, folders, reload) {
    ui.sheet("Add a resource", `<form id="up" class="stack">
      <button type="button" class="btn outline block" id="up-pick">${icon("upload")} Choose a file (up to 10 MB)</button><p class="xs" id="up-name">No file chosen. Or paste a link below.</p>
      ${ui.field("Or a link (Google Drive, Figma…)", ui.input("url", "", 'type="url" placeholder="https://"'))}
      ${ui.field("Title", ui.input("title", "", 'maxlength="140"'))}${ui.field("Description", ui.input("description", "", 'maxlength="300"'))}
      ${ui.field("Folder", ui.select("folder", [["", "General"], ...folders.map((f) => [f.id, f.name])], folderId))}
      ${ui.field("Who can see it", ui.select("audience", [["members", "All members"], ["exec", "Executives only"]], "members"))}
      ${ui.toggle("featured", false, "Feature it", "Shown at the top of Resources")}
      <div id="cl-err"></div><button class="btn primary block">${icon("check")} Add</button></form>`, (s) => {
      let file = null;
      kit.$("#up-pick", s).addEventListener("click", async () => { file = await ui.pickFile("application/pdf,.docx,.xlsx,.pptx,.csv,.zip,image/*,.txt"); if (file) { kit.$("#up-name", s).textContent = `${file.name} · ${ui.size(file.size)}`; const t = s.querySelector('[name="title"]'); if (!t.value) t.value = file.name.replace(/\.\w+$/, ""); } });
      kit.$("#up", s).addEventListener("submit", async (e) => {
        e.preventDefault(); const f = ui.values(e.target), btn = e.target.querySelector("button.primary"), url = String(f.url || "").trim();
        if (!file && !/^https:\/\//.test(url)) return ui.fail(s, "Choose a file or paste an https:// link.");
        if (file && file.size > 10e6) return ui.fail(s, "Files can be up to 10 MB.");
        ctx.busy(btn, true, "Uploading…");
        try {
          const path = file ? await api.uploadDoc(c, file) : "";
          await api.addDoc({ club_id: c, title: (f.title || file?.name || "Link").slice(0, 140), description: f.description || "", url: file ? "" : url, path, mime: file?.type || "", size: file?.size || 0, folder_id: f.folder || null, audience: f.audience, featured: !!f.featured });
          ctx.closeModal(); reload(); kit.toast("Added", "success");
        } catch (err) { ctx.busy(btn, false); ui.fail(s, err.message); }
      });
    });
  }
  function editFolder(f, reload) {
    ui.sheet(f.id ? "Edit folder" : "New folder", `<form id="fd" class="stack">${ui.field("Name", ui.input("name", f.name || "", 'required maxlength="60" placeholder="Event Planning"'))}
      ${ui.field("Description", ui.input("description", f.description || "", 'maxlength="300"'))}
      ${ui.field("Colour", ui.select("color", COLORS.map((x) => [x, x[0].toUpperCase() + x.slice(1)]), f.color || "purple"))}
      ${ui.field("Who can see it", ui.select("audience", [["members", "All members"], ["exec", "Executives only"]], f.audience || "members"))}
      <button class="btn primary block">Save</button>${f.id ? `<button type="button" class="btn ghost block" id="fd-del" style="color:var(--error)">Delete folder (files move to General)</button>` : ""}</form>`, (s) => {
      kit.$("#fd", s).addEventListener("submit", async (e) => { e.preventDefault(); const v = ui.values(e.target); try { await api.saveFolder({ ...(f.id ? { id: f.id } : { club_id: f.club_id }), name: v.name.trim(), description: v.description, color: v.color, audience: v.audience }); ctx.closeModal(); reload(); } catch (err) { ui.fail(s, err.message); } });
      kit.$("#fd-del", s)?.addEventListener("click", async () => { try { await api.deleteFolder(f.id); ctx.closeModal(); reload(); kit.go(`#/club/resources?c=${f.club_id}`); } catch (err) { kit.toast(err.message, "error"); } });
    });
  }
  function docMenu(d, folders, reload) {
    ui.sheet(d.title, `<form id="dm" class="stack">${ui.field("Title", ui.input("title", d.title, 'maxlength="140"'))}${ui.field("Folder", ui.select("folder", [["", "General"], ...folders.map((f) => [f.id, f.name])], d.folder_id || ""))}
      ${ui.field("Who can see it", ui.select("audience", [["members", "All members"], ["exec", "Executives only"]], d.audience))}${ui.toggle("featured", d.featured, "Featured")}
      <button class="btn primary block">Save</button><button type="button" class="btn ghost block" id="dm-del" style="color:var(--error)">${icon("trash", "sm")} Delete</button></form>`, (s) => {
      kit.$("#dm", s).addEventListener("submit", async (e) => { e.preventDefault(); const v = ui.values(e.target); try { await api.updateDoc(d.id, { title: v.title, folder_id: v.folder || null, audience: v.audience, featured: !!v.featured }); ctx.closeModal(); reload(); } catch (err) { ui.fail(s, err.message); } });
      kit.$("#dm-del", s).addEventListener("click", () => { ctx.closeModal(); ui.confirm("Delete this file?", "Members won't be able to open it any more.", "Delete", async () => { await api.deleteDoc(d.id); reload(); }, true); });
    });
  }
}
