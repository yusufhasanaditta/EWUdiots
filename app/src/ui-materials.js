/* Course materials: on every course page students share slides, notes, assignments, questions and past papers
   (files or links), tagged with the teacher, section, semester and topic. Anyone who opens the same course or that
   teacher's profile sees them, grouped topic by topic as a study path. Google Classroom imports land here too. */
const TYPES = { Slides: ["layers", "purple"], Notes: ["notes", "blue"], Assignment: ["clipboard", "orange"], Question: ["help", "red"], "Past paper": ["exam", "pink"], Solutions: ["checkc", "green"],
  Lab: ["calc", "teal"], Syllabus: ["list", "yellow"], Book: ["book", "blue"], Video: ["play", "red"], Announcement: ["megaphone", "orange"], "Cheat sheet": ["bulb", "yellow"], Other: ["file", "purple"] };
const ACCEPT = ".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.txt,.zip,image/*";

export function install(ctx) {
  const { icon, esc, $, $$, toast, openModal, closeModal, modalHead, busy, confirmModal } = ctx;
  const S = () => ctx.S, me = () => ctx.C.user;
  const cache = {};
  const load = (key, fn) => {
    const c = cache[key];
    if (c && Date.now() - c.at < 60e3) return c.v;
    if (!c?.busy) { cache[key] = { ...(c || {}), busy: true }; fn().then((v) => { cache[key] = { at: Date.now(), v }; ctx.rerender(); }).catch((e) => { cache[key] = { at: Date.now(), v: { error: e.message } }; ctx.rerender(); }); }
    return c?.v || null;
  };
  const ago = (d) => { const m = Math.round((Date.now() - new Date(d)) / 6e4); return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : ctx.fmtDate(d); };
  const roleLbl = { student: "Student", faculty: "Teacher", alumni: "Alumni" };
  const done = (code) => ((S().matDone = S().matDone || {})[code] = S().matDone[code] || []);

  const isMine = (r) => r.mine || (me() && r.user_id === me().id);
  const item = (r) => {
    const [ic, tone] = TYPES[r.type] || TYPES.Other;
    return `<div class="lrow mat-row"><span class="itile ${tone}">${icon(ic)}</span><button class="body mat-open" data-mopen="${r.id}"><b>${esc(r.title)}</b>
      <span>${[r.type, r.topic, r.faculty && `${r.faculty}${r.section ? ` · Sec ${r.section}` : ""}`, r.semester, r.source === "classroom" ? "Google Classroom" : r.uploader_name && `by ${r.uploader_name}${r.uploader_role ? ` (${roleLbl[r.uploader_role] || r.uploader_role})` : ""}`, ago(r.created_at)].filter(Boolean).map(esc).join(" · ")}</span></button>
      ${r.visibility === "private" ? `<span class="pill" title="Only you can see it">${icon("lock", "sm")} Only me</span>` : ""}${r.link ? icon("external", "sm") : icon("download", "sm")}${isMine(r) ? `<button class="btn sm ghost" data-mdel="${r.id}" aria-label="Delete">${icon("trash", "sm")}</button>` : me() ? `<button class="btn sm ghost" data-mrep="${r.id}" aria-label="Report this material" title="Report">${icon("flag", "sm")}</button>` : ""}</div>`;
  };

  /* The Materials tab of a course page. info: { faculty, sec, sem, title } from the student's routine. */
  let scope = "section";
  function panel(code, info) {
    if (!ctx.cloud.enabled) return `<section class="card">${ctx.empty("icon:cloudoff", "Needs the EWUdiots server", "Shared materials aren't available in this build.")}</section>`;
    const rows = load("c:" + code, () => ctx.cloud.listMaterials({ course: code }));
    const head = `<div class="row between wrap" style="gap:8px"><div class="seg">${[["section", "My section"], ["teacher", "My teacher"], ["all", "All sections"]].map(([v, l]) => `<button data-mscope="${v}" aria-pressed="${scope === v}">${l}</button>`).join("")}</div>
      ${me() ? `<button class="btn primary" id="mat-add">${icon("upload")} Share material</button>` : `<a class="btn" href="#/login?from=profile">${icon("user")} Sign in to share</a>`}</div>`;
    if (!rows) return head + '<div class="skel mt" style="height:140px"></div>';
    if (rows.error) return head + `<div class="alert red mt">${icon("alert")}<div><p>${esc(rows.error)}</p></div></div>`;
    const list = rows.filter((r) => scope === "all" || (scope === "teacher" ? r.faculty && r.faculty === info.faculty : r.faculty === info.faculty && (!info.sec || r.section === info.sec)));
    const topics = [...new Set(list.slice().reverse().map((r) => r.topic).filter(Boolean))], d = done(code);
    const byTopic = topics.map((t) => [t, list.filter((r) => r.topic === t)]).concat([["", list.filter((r) => !r.topic)]]).filter(([, l]) => l.length);
    const pct = topics.length ? Math.round((topics.filter((t) => d.includes(t)).length / topics.length) * 100) : 0;
    return `${head}
      ${topics.length ? `<section class="card mt mat-path"><div class="card-h"><h2><span class="itile sm green">${icon("target")}</span> Study path</h2><span class="pill ${pct === 100 ? "green" : "purple"}">${pct}% done</span></div>
        <div class="mat-bar"><span style="width:${pct}%"></span></div>
        <ol class="mat-steps">${topics.map((t, i) => `<li class="${d.includes(t) ? "done" : ""}"><label><input type="checkbox" data-mtopic="${esc(t)}" ${d.includes(t) ? "checked" : ""}><span class="n">${i + 1}</span><span class="grow">${esc(t)}</span><span class="xs">${list.filter((r) => r.topic === t).length} items</span></label></li>`).join("")}</ol>
        <p class="xs mt-s">Built from the topics students${list.some((r) => r.source === "classroom") ? " and Google Classroom" : ""} shared for ${esc(code)}. Tick topics as you study them.</p></section>` : ""}
      ${byTopic.length ? byTopic.map(([t, l]) => `<h3 class="mat-h">${esc(t || "Other materials")}</h3><section class="card tight">${l.map(item).join("")}</section>`).join("")
        : `<div class="card mt">${ctx.empty("icon:upload", scope === "all" ? "Nothing shared yet" : "Nothing for your section yet", `Be the first: share your ${esc(code)} slides, notes or assignment questions. ${scope !== "all" ? "Or look at All sections." : ""}`, me() ? `<button class="btn primary" id="mat-add2">${icon("upload")} Share material</button>` : "")}</div>`}`;
  }
  function mountPanel(el, code, info) {
    $$("[data-mscope]", el).forEach((b) => b.addEventListener("click", () => { scope = b.dataset.mscope; ctx.rerender(); }));
    $$("[data-mtopic]", el).forEach((b) => b.addEventListener("change", () => { const d = done(code), t = b.dataset.mtopic; if (b.checked) { if (!d.includes(t)) d.push(t); } else d.splice(d.indexOf(t), 1); ctx.save(); ctx.rerender(); }));
    ["#mat-add", "#mat-add2"].forEach((s) => $(s, el)?.addEventListener("click", () => share(code, info)));
    bindRows(el, "c:" + code);
  }
  function bindRows(el, key) {
    const rows = () => (Array.isArray(cache[key]?.v) ? cache[key].v : []);
    $$("[data-mopen]", el).forEach((b) => b.addEventListener("click", async () => {
      const r = rows().find((x) => x.id === b.dataset.mopen); if (!r) return;
      if (r.link) { window.open(r.link, "_blank", "noopener"); return; }
      if (!me()) { toast("Sign in to open shared files", "info"); return; }
      try { window.open(await ctx.cloud.downloadUrl(r.file_path), "_blank", "noopener"); } catch (e) { toast("Couldn't open the file", "error", e.message); }
    }));
    $$("[data-mrep]", el).forEach((b) => b.addEventListener("click", () => openModal(modalHead("Report this material") + `<form id="rep-f" class="stack"><p class="small muted">Tell the team what's wrong. Three reports hide it until a moderator checks; moderators can remove it for good.</p>
      ${["Fake or misleading", "Wrong course or teacher", "Copyrighted book or paid material", "Spam or advertising", "Broken link or file", "Something else"].map((t, i) => `<label class="check-row"><input type="radio" class="check" name="why" value="${t}" ${i ? "" : "checked"}> <span>${t}</span></label>`).join("")}
      <button class="btn danger block">${icon("flag")} Report</button></form>`, (m) => $("#rep-f", m).addEventListener("submit", async (e) => {
        e.preventDefault(); const why = new FormData(e.target).get("why");
        try { await ctx.cloud.report(me().id, "resource", b.dataset.mrep, String(why)); closeModal(); toast("Reported", "success", "Thanks. The EWUdiots team will check it."); }
        catch (x) { toast(/duplicate|unique/i.test(x.message) ? "You've already reported this" : "Couldn't report", "error", /duplicate|unique/i.test(x.message) ? "" : x.message); }
      }))));
    $$("[data-mdel]", el).forEach((b) => b.addEventListener("click", () => confirmModal("Delete this material?", "It disappears for everyone.", "Delete", async () => {
      const r = rows().find((x) => x.id === b.dataset.mdel); await ctx.cloud.deleteMaterial(r.id, r.file_path); delete cache[key]; ctx.rerender(); toast("Deleted");
    }, true)));
  }

  /* Teacher, section and semester for a course, from your routine (this semester) or your class history. */
  function detect(code) {
    const now = S().routine.find((r) => r.code === code && !r.lab) || S().routine.find((r) => r.code === code);
    if (now) return { faculty: now.faculty || "", sec: now.sec || "", sem: S().routineSem || "", how: "your routine" };
    const past = Object.entries(S().history || {}).sort((a, b) => ctx.semesterKey(b[0]) - ctx.semesterKey(a[0])).map(([sem, rows]) => [sem, rows.find((r) => r.code === code)]).find(([, r]) => r);
    return past ? { faculty: past[1].faculty || "", sec: past[1].sec || "", sem: past[0], how: `your ${past[0]} classes` } : { faculty: "", sec: "", sem: "", how: "" };
  }
  /* Share a file or a link. With no course (Study Vault → Upload), the form starts with a course picker; the teacher and
     section are filled in from the routine. The student chooses who sees it: everyone, or only themselves. */
  function share(code, info) {
    let mode = "file", vis = "everyone", course = code || "", tags = code ? { ...info, how: info.faculty ? "your routine" : "" } : detect("");
    const mine = [...new Set([...S().routine.map((r) => r.code), ...Object.values(S().history || {}).flat().map((r) => r.code)])];
    const topicsOf = (c) => [...new Set((cache["c:" + c]?.v || []).map?.((r) => r.topic).filter(Boolean) || [])];
    const draw = (m) => {
      m.innerHTML = `<div class="grabber" aria-hidden="true"></div>${modalHead(course && code ? `Share ${course} material` : "Share study material")}<form id="mf" class="stack" novalidate>
        ${!code ? `<label class="field">Course<input class="input" name="course" id="mf-course" list="mf-courses" value="${esc(course)}" placeholder="CSE106" required autocomplete="off"><datalist id="mf-courses">${mine.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></label>` : ""}
        <div class="mf-tags" id="mf-tags">${tagLine()}</div>
        <div class="seg">${[["file", "upload", "Upload a file"], ["link", "link", "Add a link"]].map(([v, ic, l]) => `<button type="button" data-mm="${v}" aria-pressed="${mode === v}">${icon(ic, "sm")} ${l}</button>`).join("")}</div>
        ${mode === "file" ? `<label class="mat-drop"><input type="file" name="file" accept="${ACCEPT}" hidden><span class="itile purple">${icon("upload")}</span><b id="mf-name">Choose a file</b><span class="xs">PDF, slides, Word, images, up to 25 MB</span></label>`
          : `<label class="field">Link (PDF, Google Drive, YouTube, website)<input class="input" name="link" type="url" placeholder="https://drive.google.com/…" required></label>`}
        <div class="grid g2"><label class="field">Type<select class="select" name="type">${Object.keys(TYPES).map((t) => `<option>${t}</option>`).join("")}</select></label>
          <label class="field">Topic or week<input class="input" name="topic" maxlength="80" list="mf-topics" placeholder="e.g. Week 3: Linked lists"><datalist id="mf-topics">${topicsOf(course).map((t) => `<option value="${esc(t)}">`).join("")}</datalist></label></div>
        <label class="field">Title<input class="input" name="title" required minlength="3" maxlength="120" placeholder="Lecture 5 slides"></label>
        <label class="field">Note (optional)<textarea class="input" name="description" rows="2" maxlength="1000" placeholder="What's inside, chapters covered…"></textarea></label>
        <fieldset class="vis-pick"><legend class="small"><b>Who can see it?</b></legend>
          ${[["everyone", "users", "Everyone at EWU", "Students searching this course or teacher find it"], ["private", "lock", "Only me", "Keep it in your own library"]].map(([v, ic, t, d]) => `<label class="vis-opt"><input type="radio" name="vis" value="${v}" ${vis === v ? "checked" : ""}><span class="itile sm ${v === "private" ? "orange" : "green"}">${icon(ic, "sm")}</span><span class="grow"><b>${t}</b><span class="xs">${d}</span></span></label>`).join("")}</fieldset>
        <p class="xs">Share only what you're allowed to: your own notes, or material your teacher gave the class. Anyone can report fake material; moderators remove it.</p>
        <div id="mf-err"></div><button class="btn primary block">${icon("check")} ${vis === "private" ? "Save to my library" : `Share${course ? ` with ${esc(course)} students` : ""}`}</button></form>`;
      $$("[data-mm]", m).forEach((b) => b.addEventListener("click", () => { mode = b.dataset.mm; draw(m); }));
      $$('input[name="vis"]', m).forEach((r) => r.addEventListener("change", () => { vis = r.value; const b = m.querySelector("button.primary"); b.innerHTML = `${icon("check")} ${vis === "private" ? "Save to my library" : `Share${course ? ` with ${esc(course)} students` : ""}`}`; }));
      const ci = $("#mf-course", m);
      ci?.addEventListener("input", () => {
        const c = ci.value.toUpperCase().replace(/\s/g, "");
        if (/^[A-Z]{2,4}\d{3,4}[A-Z]?$/.test(c)) { course = c; tags = detect(c); } else { course = ""; tags = detect(""); }
        $("#mf-tags", m).innerHTML = tagLine();
      });
      m.querySelector('input[name="file"]')?.addEventListener("change", (e) => { const f = e.target.files[0]; $("#mf-name", m).textContent = f ? f.name : "Choose a file"; const t = m.querySelector('[name="title"]'); if (f && !t.value) t.value = f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 120); });
      $("#mf", m).addEventListener("submit", async (e) => {
        e.preventDefault(); const fd = new FormData(e.target), file = mode === "file" ? fd.get("file") : null, err = (t) => { $("#mf-err", m).innerHTML = `<div class="alert red">${icon("alert")}<div><p>${esc(t)}</p></div></div>`; };
        const title = String(fd.get("title") || "").trim(), link = String(fd.get("link") || "").trim();
        if (!course) return err("Pick the course, like CSE106.");
        if (mode === "file" && (!file || !file.size)) return err("Choose a file to upload.");
        if (file && file.size > 25 * 1024 * 1024) return err("That file is over 25 MB.");
        if (mode === "link" && !/^https:\/\/\S+\.\S+/.test(link)) return err("The link must start with https://");
        if (title.length < 3) return err("Give it a title.");
        const b = e.target.querySelector("button.primary"); busy(b, true, "Sharing…");
        try {
          await ctx.cloud.shareMaterial(me().id, file, { course, type: fd.get("type"), title, topic: String(fd.get("topic") || "").trim(), description: String(fd.get("description") || "").trim(), visibility: vis,
            link: mode === "link" ? link : "", faculty: tags.faculty || "", section: String(tags.sec || "").slice(0, 6), semester: tags.sem || "", uploader_name: (S().profile?.name || "").slice(0, 80), uploader_role: ctx.cloud.roleOf(me()) || "student" });
          delete cache["c:" + course]; if (tags.faculty) delete cache["t:" + tags.faculty]; ctx.C.vault = null; closeModal(); ctx.rerender();
          toast(vis === "private" ? "Saved to your library" : "Shared", "success", vis === "private" ? "Only you can see it." : `${course} students can see it now.`); if (vis !== "private") ctx.study?.award?.(10, "shared material");
        } catch (x) { busy(b, false); err(/row-level|limit/i.test(x.message) ? "You've shared a lot today. Try again tomorrow." : /mime|type/i.test(x.message) ? "That file type isn't allowed. Use PDF, slides, Word, images or a zip." : x.message); }
      });
    };
    const tagLine = () => course ? `${icon("users", "sm")} <span>${tags.faculty ? `Teacher <b>${esc(ctx.facName(tags.faculty) || tags.faculty)}</b>` : "No teacher found"}${tags.sec ? ` · Section ${esc(tags.sec)}` : ""}${tags.sem ? ` · ${esc(tags.sem)}` : ""}${tags.how ? ` <span class="xs">(from ${esc(tags.how)})</span>` : ""}</span>` : `<span class="xs">${icon("info", "sm")} Type a course and we fill in your teacher and section.</span>`;
    openModal("", draw);
  }

  /* Teacher profile: everything shared from this teacher's courses. */
  function teacherSection(init) {
    if (!ctx.cloud.enabled || !init) return "";
    const rows = load("t:" + init, () => ctx.cloud.listMaterials({ faculty: init }));
    if (!rows) return '<div class="skel mt" style="height:90px"></div>';
    if (rows.error || !rows.length) return `<section class="card mt"><h3>${icon("layers", "sm")} Study materials</h3><p class="small muted">No materials shared from ${esc(init)}'s courses yet. Students can share them from the course page.</p></section>`;
    const courses = [...new Set(rows.map((r) => r.course))];
    return `<h2 class="mt-l">Study materials from ${esc(init)}'s classes</h2>${courses.map((c) => `<h3 class="mat-h">${esc(c)}</h3><section class="card tight">${rows.filter((r) => r.course === c).slice(0, 12).map(item).join("")}</section>`).join("")}`;
  }
  const mountTeacher = (el, init) => bindRows(el, "t:" + init);
  return { panel, mountPanel, teacherSection, mountTeacher, share, detect, TYPES, bust: () => Object.keys(cache).forEach((k) => delete cache[k]) };
}
