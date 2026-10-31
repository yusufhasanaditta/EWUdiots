/* Resource library (#/club/resources?c=…&folder=…), from the "Resource Library" board: type chips, featured files,
   folders, recent files, upload, and a preview (images in the app; PDFs and office files open in a new tab with a
   5-minute signed link). Files live in the private bucket; members see them, resources.manage organises them. */

const TYPES = [["all", "All"], ["pdf", "Documents"], ["ppt", "Presentations"], ["img", "Images"], ["xls", "Sheets"], ["link", "Links"], ["other", "Others"]];
const COLORS = ["purple", "blue", "amber", "pink", "green", "teal", "orange", "gray"];
const kindOf = (d) => { const s = `${d.title} ${d.mime} ${d.url}`.toLowerCase(); return d.url && !d.path ? "link" : /pdf|word|docx?/.test(s) ? "pdf" : /presentation|pptx?/.test(s) ? "ppt" : /image|png|jpe?g|webp/.test(s) ? "img" : /sheet|xlsx?|csv/.test(s) ? "xls" : "other"; };

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store, ctx } = kit;
  let type = "all", q = "", sort = "new";

  pages["club/resources"] = () => {
    const c = kit.param("c") || kit.myClubs()[0]?.club_id || "", folderId = kit.param("folder") || "";
    const g = kit.memberGate(c, "the resource library"); if (g) return g;
    if (!kit.feature(c, "resources")) return ui.emptyBox("folder", "Resources are switched off", "The club admin can turn them on in Manage → Features.");
    const fe = store.use(`club:folders:${c}`, () => api.folders(c), { ttl: 60e3 }), de = store.use(`club:res:${c}`, () => api.resources(c), { ttl: 45e3 });
    const can = kit.can(c, "resources.manage") || kit.can(c, "docs.manage");
    const folders = fe.value || [], docs = de.value || [], folder = folders.find((f) => f.id === folderId);
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = docs.filter((d) => (!folderId || d.folder_id === folderId) && (type === "all" || kindOf(d) === type) && (!words.length || words.every((w) => `${d.title} ${d.description}`.toLowerCase().includes(w))))
      .sort((a, b) => (sort === "name" ? a.title.localeCompare(b.title) : new Date(b.created_at) - new Date(a.created_at)));
    const head = folder
      ? `${kit.back(`#/club/resources?c=${c}`, "Resources")}<header class="cl-ph"><div class="row nowrap" style="gap:14px"><span class="cl-folder f-${folder.color}" style="border:0;padding:0">${icon("folder")}</span><div><h1>${esc(folder.name)}</h1><p>${esc(folder.description || "")}${folder.description ? " · " : ""}${ui.plural(list.length, "file")}</p></div></div>
          ${can ? `<div class="actions"><button class="btn primary" id="rs-up">${icon("upload")} Upload</button><button class="btn" id="rs-fedit" aria-label="Edit folder">${icon("edit")}</button></div>` : ""}</header>`
      : `${kit.back(`#/club/space?c=${c}`, kit.membership(c)?.short_name || "Club")}${ui.ph("Resources", "Learn, collaborate, and access club resources", can ? `<button class="btn primary" id="rs-up">${icon("upload")} Upload</button>` : "")}`;
    return `${head}
      <div class="rs-search"><div class="searchbar cl-search">${icon("search")}<input class="input" id="rs-q" type="search" placeholder="Search files, folders, or topics…" value="${esc(q)}" autocomplete="off"></div>
        ${ui.select("sort", [["new", "Latest first"], ["name", "Name"]], sort, 'id="rs-sort" style="width:auto" aria-label="Sort"')}</div>
      <nav class="cl-seg sm mt-s">${TYPES.map(([v, l]) => `<button data-ty="${v}" aria-pressed="${type === v}">${l}</button>`).join("")}</nav>
      ${de.loading && !de.value ? ui.skeleton(4, 64) : `
        ${!folderId && type === "all" && !q && docs.some((d) => d.featured) ? `${ui.sec("Featured Resources")}<div class="cl-hscroll">${docs.filter((d) => d.featured).slice(0, 8).map((d) => `<button class="cl-vcard" data-doc="${d.id}" style="width:200px;text-align:left;cursor:pointer;font:inherit"><span class="art">${ui.ftype(d.title, d.mime)}</span><span class="in"><b class="ellipsis">${esc(d.title)}</b><span class="xs">${ui.size(d.size) || "Link"}</span></span></button>`).join("")}</div>` : ""}
        ${!folderId ? `${ui.sec("Folders", can ? `<button class="btn sm ghost" id="rs-fnew">${icon("plus", "sm")} New folder</button>` : "")}${folders.length ? `<div class="cl-folders">${folders.map((f) => `<a class="cl-folder f-${f.color}" href="#/club/resources?c=${c}&folder=${f.id}">${icon("folder")}<span class="min0"><b class="ellipsis">${esc(f.name)}</b><span>${ui.plural(docs.filter((d) => d.folder_id === f.id).length, "file")}${f.audience === "exec" ? " · Executives" : ""}</span></span></a>`).join("")}</div>` : `<p class="small muted">No folders yet.</p>`}` : ""}
        ${ui.sec(folderId ? "Files" : "Recent Files")}
        ${list.length ? `<div class="card tight">${list.map((d) => `<div class="rs-file">${ui.ftype(d.url && !d.path ? d.url : d.title, d.mime)}<button class="rs-open" data-doc="${d.id}"><b>${esc(d.title)}</b>
            <span class="xs">${esc(folders.find((f) => f.id === d.folder_id)?.name || "General")} · ${ui.size(d.size) || "Link"} · ${ui.dateShort(d.created_at)}${d.audience === "exec" ? " · Executives" : ""}</span></button>
            <button class="icon-btn" data-doc="${d.id}" aria-label="Open ${esc(d.title)}">${icon(d.url && !d.path ? "external" : "download")}</button>${can ? `<button class="icon-btn" data-dmenu="${d.id}" aria-label="More for ${esc(d.title)}">${icon("more")}</button>` : ""}</div>`).join("")}</div>`
          : ui.emptyBox("folder", "No files here", can ? "Upload templates, guides and slides for your members." : "Your club's shared files appear here.")}`}`;
  };
  pages["club/resources"].mount = (el) => {
    kit.bindRetry(el);
    const c = kit.param("c") || kit.myClubs()[0]?.club_id, folderId = kit.param("folder") || "";
    const reload = () => store.invalidate(`club:res:${c}`, `club:folders:${c}`);
    const input = kit.$("#rs-q", el);
    input?.addEventListener("input", () => { q = input.value; const pos = input.selectionStart; ctx.rerender(); const i = kit.$("#rs-q"); if (i) { i.focus(); i.setSelectionRange(pos, pos); } });
    kit.$$("[data-ty]", el).forEach((b) => b.addEventListener("click", () => { type = b.dataset.ty; ctx.rerender(); }));
    kit.$("#rs-sort", el)?.addEventListener("change", (e) => { sort = e.target.value; ctx.rerender(); });
    const docs = store.peek(`club:res:${c}`) || [], folders = store.peek(`club:folders:${c}`) || [];
    kit.$$("[data-doc]", el).forEach((b) => b.addEventListener("click", () => preview(docs.find((d) => d.id === b.dataset.doc))));
    kit.$("#rs-up", el)?.addEventListener("click", () => upload(c, folderId, folders, reload));
    kit.$("#rs-fnew", el)?.addEventListener("click", () => editFolder({ club_id: c }, reload));
    kit.$("#rs-fedit", el)?.addEventListener("click", () => editFolder(folders.find((f) => f.id === folderId), reload));
    kit.$$("[data-dmenu]", el).forEach((b) => b.addEventListener("click", () => docMenu(docs.find((d) => d.id === b.dataset.dmenu), folders, reload)));
  };

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
