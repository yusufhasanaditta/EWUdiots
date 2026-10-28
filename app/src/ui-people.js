/* Community and teaching features:
   · Blog: students, teachers and alumni write (tips, experiences, career, study…); readers mark posts "Helpful".
   · Jobs & internships: alumni and teachers post openings for students.
   · Mentors: alumni who offer mentoring; students send a request, the alumnus accepts with a reply.
   · Office hours: teachers publish office hours; students request a consultation.
   · Teaching hub (teachers): profile + office hours, consultation inbox, announcements to a course/section.
   · Alumni hub (alumni): mentoring switch, mentoring requests, own job posts.
   All writes go through Supabase RLS (migration 0009), which checks the account's role server-side. */
const CATS = [["tips", "Tips", "bulb"], ["experience", "Experience", "heart"], ["career", "Career", "briefcase"], ["study", "Study", "book"], ["campus", "Campus life", "building"], ["research", "Research", "brain"], ["other", "Other", "notes"]];
const ROLE_LBL = { student: "Student", faculty: "Teacher", alumni: "Alumni", admin: "EWUdiots team" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function install(ctx) {
  const { pages, icon, esc, $, $$, toast, openModal, closeModal, modalHead, busy, confirmModal } = ctx;
  const S = () => ctx.S, sb = () => ctx.cloud.sb, me = () => ctx.C.user, myRole = () => ctx.cloud.roleOf(me());
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const myName = () => S().profile?.name || (me()?.user_metadata?.name) || (me()?.email || "").split("@")[0];
  const ago = (d) => { const m = Math.round((Date.now() - new Date(d)) / 6e4); return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : ctx.fmtDate(d); };
  // Signed-out or local-only: explain instead of failing.
  const gate = (why, roles) => {
    if (!ctx.cloud.enabled) return ctx.empty("icon:cloudoff", "Needs the EWUdiots server", "This build runs on this device only.");
    if (!me()) return ctx.empty("icon:user", "Sign in first", why, `<a class="btn primary" href="#/login?from=profile">${icon("user")} Sign in or create an account</a>`);
    if (roles && !roles.includes(myRole())) return ctx.empty("icon:lock", "Not for this account", `This page is for ${roles.map((r) => ROLE_LBL[r].toLowerCase()).join(" and ")} accounts.`);
    return "";
  };
  // Plain text → paragraphs, with safe https links.
  const prose = (t) => esc(t).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>").replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener nofollow">$1</a>')}</p>`).join("");
  const roleChip = (r) => `<span class="role-chip ${r}">${esc(ROLE_LBL[r] || r)}</span>`;
  const cache = {};
  const load = async (key, fn, force = false) => { if (!force && cache[key] && Date.now() - cache[key].at < 60e3) return cache[key].v; const v = await fn(); cache[key] = { at: Date.now(), v }; return v; };
  const later = (key, fn) => { if (cache[key]) return cache[key].v; load(key, fn).then(() => ctx.rerender()).catch((e) => { cache[key] = { at: Date.now(), v: { error: e.message } }; ctx.rerender(); }); return null; };
  const bust = (...keys) => keys.forEach((k) => delete cache[k]);
  const loading = `<div class="grid g2 mt">${[1, 2, 3, 4].map(() => '<div class="skel" style="height:130px"></div>').join("")}</div>`;

  /* ═════════ BLOG ═════════ */
  let bCat = "all", bQ = "";
  pages.blog = () => {
    const head = ctx.head("Blog", "Tips, stories and advice from EWU students, teachers and alumni.", me() && ["student", "faculty", "alumni"].includes(myRole()) ? `<a class="btn primary" href="#/write">${icon("edit")} Write</a>` : "");
    if (!ctx.cloud.enabled) return head + `<section class="card">${gate()}</section>`;
    const rows = later("blog", async () => ok(await sb().from("blog_feed").select("*").eq("status", "published").order("created_at", { ascending: false }).limit(200)));
    if (!rows) return head + loading;
    if (rows.error) return head + `<div class="alert red">${icon("alert")}<div><b>Couldn't load the blog</b><p>${esc(rows.error)}</p></div></div>`;
    const q = bQ.trim().toLowerCase(), list = rows.filter((p) => (bCat === "all" || p.category === bCat) && (!q || `${p.title} ${p.body} ${p.author_name}`.toLowerCase().includes(q)));
    const top = bCat === "all" && !q ? rows.slice().sort((a, b) => b.claps - a.claps)[0] : null;
    return `${head}<div class="row nowrap"><div class="searchbar grow">${icon("search")}<input class="input" id="bq" type="search" value="${esc(bQ)}" placeholder="Search posts"></div></div>
      <div class="chips mt-s">${[["all", "All", "grid"], ...CATS].map(([v, l, ic]) => `<button class="chip" data-bc="${v}" aria-pressed="${bCat === v}">${icon(ic, "sm")} ${l}</button>`).join("")}</div>
      ${top && top.claps ? `<a class="blog-lead mt" href="#/post?id=${top.id}"><span class="eyebrow">Most helpful</span><h2>${esc(top.title)}</h2><p>${esc(top.body.slice(0, 180))}…</p><span class="xs">${esc(top.author_name)} · ${roleChip(top.author_role)} · ${icon("thumb", "sm")} ${top.claps}</span></a>` : ""}
      <div class="blog-grid mt">${list.map((p) => `<a class="blog-card" href="#/post?id=${p.id}">${p.cover_url ? `<img src="${esc(p.cover_url)}" alt="" loading="lazy">` : `<span class="blog-ic">${icon((CATS.find((c) => c[0] === p.category) || CATS[6])[2])}</span>`}
        <div class="min0"><span class="pill">${esc((CATS.find((c) => c[0] === p.category) || CATS[6])[1])}</span><b>${esc(p.title)}</b><p class="xs">${esc(p.body.slice(0, 110))}…</p>
        <span class="xs">${esc(p.author_name)} · ${roleChip(p.author_role)} · ${ago(p.created_at)} · ${icon("thumb", "sm")} ${p.claps}</span></div></a>`).join("") || `<div class="card">${ctx.empty("icon:notes", "No posts here yet", "Be the first to share a tip.", me() ? `<a class="btn primary" href="#/write">${icon("edit")} Write a post</a>` : "")}</div>`}</div>`;
  };
  pages.blog.mount = (el) => {
    $("#bq", el)?.addEventListener("input", (e) => { bQ = e.target.value; clearTimeout(pages.blog.t); pages.blog.t = setTimeout(() => { ctx.rerender(); $("#bq")?.focus(); const i = $("#bq"); i && i.setSelectionRange(i.value.length, i.value.length); }, 250); });
    $$("[data-bc]", el).forEach((b) => b.addEventListener("click", () => { bCat = b.dataset.bc; ctx.rerender(); }));
  };
  pages.post = () => {
    const id = ctx.qparam("id"), back = ctx.subHead("Blog", "", "#/blog");
    const p = later(`post:${id}`, async () => ok(await sb().from("blog_feed").select("*").eq("id", id).maybeSingle()));
    if (!p) return back + loading;
    if (p.error || !p.id) return back + `<section class="card">${ctx.empty("icon:notes", "Post not found", "It may have been removed.")}</section>`;
    const clapped = cache[`clap:${id}`]?.v;
    if (me() && clapped === undefined) later(`clap:${id}`, async () => Boolean((ok(await sb().from("blog_claps").select("post_id").eq("post_id", id).eq("user_id", me().id))).length));
    return `${back}<article class="blog-read">${p.cover_url ? `<img class="blog-cover" src="${esc(p.cover_url)}" alt="">` : ""}
      <span class="pill">${esc((CATS.find((c) => c[0] === p.category) || CATS[6])[1])}</span><h1>${esc(p.title)}</h1>
      <div class="row nowrap author"><span class="avatar">${esc(ctx.initials(p.author_name))}</span><div><b>${esc(p.author_name)}</b><span class="xs" style="display:block">${roleChip(p.author_role)} · ${ago(p.created_at)} · ${Math.max(1, Math.round(p.body.split(/\s+/).length / 200))} min read</span></div></div>
      <div class="prose">${prose(p.body)}</div>
      <div class="row mt-l"><button class="btn ${clapped ? "primary" : "outline"}" id="clap" ${me() ? "" : "disabled"}>${icon("thumb")} Helpful · ${p.claps}</button><button class="btn ghost" id="share">${icon("share")} Share</button><span class="grow"></span>
        ${p.mine ? `<a class="btn ghost" href="#/write?id=${p.id}">${icon("edit")} Edit</a><button class="btn ghost" id="del">${icon("trash")}</button>` : me() ? `<button class="btn ghost" id="rep">${icon("flag")} Report</button>` : ""}</div></article>`;
  };
  pages.post.mount = (el) => {
    const id = ctx.qparam("id"), p = cache[`post:${id}`]?.v;
    $("#clap", el)?.addEventListener("click", async () => {
      const on = !cache[`clap:${id}`]?.v;
      try { if (on) ok(await sb().from("blog_claps").insert({ post_id: id })); else ok(await sb().from("blog_claps").delete().eq("post_id", id).eq("user_id", me().id)); bust(`post:${id}`, `clap:${id}`, "blog"); ctx.rerender(); } catch (e) { toast(e.message, "error"); }
    });
    $("#share", el)?.addEventListener("click", () => ctx.native.share({ title: p?.title, text: p?.title, url: `${ctx.SITE}/app.html#/post?id=${id}` }).then((r) => r === "copied" && toast("Link copied")).catch(() => {}));
    $("#del", el)?.addEventListener("click", () => confirmModal("Delete this post?", "It disappears for everyone.", "Delete", async () => { ok(await sb().from("blog_posts").delete().eq("id", id)); bust("blog"); ctx.go("#/blog"); toast("Post deleted", "info"); }, true));
    $("#rep", el)?.addEventListener("click", () => confirmModal("Report this post?", "The team will check it. Three reports hide a post until then.", "Report", async () => { await ctx.cloud.report(me().id, "blog", id, "Reported from the blog"); toast("Thanks, the team will check it", "info"); }, true, "flag"));
  };
  pages.write = () => {
    const back = ctx.subHead("Write a post", "Shown with your name and role", "#/blog"), g = gate("Sign in to write for the blog.", ["student", "faculty", "alumni"]);
    if (g) return back + `<section class="card">${g}</section>`;
    const id = ctx.qparam("id"), p = id ? cache[`post:${id}`]?.v || {} : {};
    return `${back}<form class="card stack" id="wf" style="max-width:760px;margin:0 auto" novalidate>
      <label class="field">Title<input class="input" name="title" required minlength="5" maxlength="140" value="${esc(p.title || "")}" placeholder="5 things I wish I knew before my first semester"></label>
      <label class="field">Category<select class="select" name="category">${CATS.map(([v, l]) => `<option value="${v}" ${p.category === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="field">Your post<textarea class="input" name="body" rows="14" required minlength="40" maxlength="20000" placeholder="Write freely. Leave an empty line between paragraphs.">${esc(p.body || "")}</textarea><span class="hint" id="wc">0 words</span></label>
      <label class="field">Cover image link (optional, https)<input class="input" name="cover_url" type="url" pattern="https://.+" value="${esc(p.cover_url || "")}"></label>
      <p class="xs">Be kind and honest. No personal attacks or private information about others. Posts can be reported and hidden.</p>
      <div class="row"><span class="grow"></span><button class="btn primary lg">${icon("check")} ${id ? "Save changes" : "Publish"}</button></div></form>`;
  };
  pages.write.mount = (el) => {
    const f = $("#wf", el); if (!f) return;
    const wc = () => { $("#wc", el).textContent = `${f.body.value.trim().split(/\s+/).filter(Boolean).length} words`; }; f.body.addEventListener("input", wc); wc();
    f.addEventListener("submit", async (e) => {
      e.preventDefault(); const d = Object.fromEntries(new FormData(f)), b = f.querySelector("button.primary"), id = ctx.qparam("id");
      if (d.title.trim().length < 5) return toast("Give it a title (5+ characters)", "warn"); if (d.body.trim().length < 40) return toast("Write a little more (40+ characters)", "warn");
      busy(b, true, "Publishing…");
      try {
        const row = { title: d.title.trim(), body: d.body.trim(), category: d.category, cover_url: d.cover_url.trim(), updated_at: new Date().toISOString() };
        const r = id ? ok(await sb().from("blog_posts").update(row).eq("id", id).select("id").single()) : ok(await sb().from("blog_posts").insert({ ...row, author_name: myName().slice(0, 80) }).select("id").single());
        bust("blog", `post:${r.id}`); toast(id ? "Saved" : "Published", "success"); ctx.study?.award?.(15, "blog post"); ctx.go(`#/post?id=${r.id}`);
      } catch (err) { busy(b, false); toast(/limit|row-level/i.test(err.message) ? "You've posted a lot today. Try again tomorrow." : err.message, "error"); }
    });
  };

  /* ═════════ JOBS & INTERNSHIPS ═════════ */
  let jKind = "all";
  pages.jobs = () => {
    const can = me() && ["alumni", "faculty"].includes(myRole());
    const head = ctx.head("Jobs & internships", "Openings shared by EWU alumni and teachers.", can ? `<button class="btn primary" id="jnew">${icon("plus")} Post an opening</button>` : "");
    const g = gate("Sign in to see openings shared by alumni and teachers."); if (g) return head + `<section class="card">${g}</section>`;
    const rows = later("jobs", async () => ok(await sb().from("job_posts").select("*").neq("status", "hidden").order("created_at", { ascending: false }).limit(200)));
    if (!rows) return head + loading;
    const list = (rows.error ? [] : rows).filter((j) => jKind === "all" || j.kind === jKind);
    return `${head}<div class="chips">${[["all", "All"], ["job", "Jobs"], ["internship", "Internships"], ["part-time", "Part-time"], ["research", "Research"]].map(([v, l]) => `<button class="chip" data-jk="${v}" aria-pressed="${jKind === v}">${l}</button>`).join("")}</div>
      <div class="grid g2 mt">${list.map((j) => { const closed = j.status === "closed" || (j.deadline && ctx.daysUntil(j.deadline) < 0); return `<article class="card job ${closed ? "dim" : ""}"><div class="row nowrap top"><span class="itile ${j.kind === "internship" ? "green" : j.kind === "research" ? "purple" : "blue"}">${icon(j.kind === "research" ? "brain" : "briefcase")}</span>
        <div class="grow min0"><b style="font-size:16px">${esc(j.title)}</b><p class="small muted">${esc(j.company)} · ${esc(j.location)}</p></div><span class="pill ${closed ? "" : "green"}">${closed ? "Closed" : esc(j.kind)}</span></div>
        ${j.details ? `<p class="small mt-s">${esc(j.details.slice(0, 260))}${j.details.length > 260 ? "…" : ""}</p>` : ""}
        <p class="xs mt-s">Shared by ${esc(j.author_name)} · ${roleChip(j.author_role)} · ${ago(j.created_at)}${j.deadline ? ` · apply by ${ctx.fmtDate(j.deadline)}` : ""}</p>
        <div class="row mt-s">${j.link && !closed ? `<a class="btn sm primary" href="${esc(j.link)}" target="_blank" rel="noopener nofollow">${icon("external", "sm")} Apply</a>` : ""}${j.author_id === me().id ? `<button class="btn sm ghost" data-jc="${j.id}">${j.status === "closed" ? "Reopen" : "Close"}</button><button class="btn sm ghost" data-jd="${j.id}" aria-label="Delete">${icon("trash", "sm")}</button>` : ""}</div></article>`; }).join("")
        || `<div class="card">${ctx.empty("icon:briefcase", "No openings yet", can ? "Share one from your company or lab." : "Alumni and teachers post jobs and internships here.")}</div>`}</div>`;
  };
  pages.jobs.mount = (el) => {
    $$("[data-jk]", el).forEach((b) => b.addEventListener("click", () => { jKind = b.dataset.jk; ctx.rerender(); }));
    const rows = cache.jobs?.v || [];
    $$("[data-jc]", el).forEach((b) => b.addEventListener("click", async () => { const j = rows.find((x) => x.id === b.dataset.jc); try { ok(await sb().from("job_posts").update({ status: j.status === "closed" ? "open" : "closed" }).eq("id", j.id)); bust("jobs"); ctx.rerender(); } catch (e) { toast(e.message, "error"); } }));
    $$("[data-jd]", el).forEach((b) => b.addEventListener("click", () => confirmModal("Delete this opening?", "", "Delete", async () => { ok(await sb().from("job_posts").delete().eq("id", b.dataset.jd)); bust("jobs"); ctx.rerender(); }, true)));
    $("#jnew", el)?.addEventListener("click", () => openModal(modalHead("Post an opening") + `<form id="jf" class="grid g2">
      <label class="field full-row">Title<input class="input" name="title" required minlength="3" maxlength="120" placeholder="Junior Software Engineer"></label>
      <label class="field">Company / lab<input class="input" name="company" required minlength="2" maxlength="120"></label><label class="field">Location<input class="input" name="location" maxlength="80" value="Dhaka"></label>
      <label class="field">Type<select class="select" name="kind"><option value="job">Job</option><option value="internship">Internship</option><option value="part-time">Part-time</option><option value="research">Research assistant</option></select></label><label class="field">Apply by<input class="input" name="deadline" type="date"></label>
      <label class="field full-row">How to apply (https link)<input class="input" name="link" type="url" pattern="https://.+" placeholder="https://…"></label>
      <label class="field full-row">Details<textarea class="input" name="details" rows="4" maxlength="4000" placeholder="Requirements, salary range, who should apply…"></textarea></label>
      <div class="row full-row"><span class="grow"></span><button class="btn primary">${icon("check")} Post</button></div></form>`, (m) => $("#jf", m).addEventListener("submit", async (e) => {
      e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)), b = e.target.querySelector("button.primary"); busy(b, true);
      try { ok(await sb().from("job_posts").insert({ title: d.title.trim(), company: d.company.trim(), location: d.location.trim() || "Dhaka", kind: d.kind, deadline: d.deadline || null, link: d.link.trim(), details: d.details.trim(), author_name: myName().slice(0, 80) })); closeModal(); bust("jobs"); ctx.rerender(); toast("Opening posted", "success", "Students can see it now."); }
      catch (err) { busy(b, false); toast(err.message, "error"); }
    })));
  };

  /* ═════════ MENTORS (students ↔ alumni) ═════════ */
  pages.mentors = () => {
    const head = ctx.head("Alumni mentors", "Ask EWU graduates for career advice, higher-study help or a CV review.");
    const g = gate("Sign in to message alumni mentors."); if (g) return head + `<section class="card">${g}</section>`;
    const rows = later("mentors", async () => ok(await sb().from("alumni_profiles").select("id, name, role, org, country, dept, mentor_topics, linkedin").eq("mentor", true).eq("status", "approved").not("user_id", "is", null).limit(300)));
    const mine = later("myMentorReq", async () => ok(await sb().from("mentor_requests").select("*").eq("student_id", me().id).order("created_at", { ascending: false })));
    if (!rows || !mine) return head + loading;
    return `${head}${(mine.error ? [] : mine).length ? `<section class="card"><div class="card-h"><h2>Your requests</h2></div>${mine.map((r) => { const m = (rows.error ? [] : rows).find((x) => x.id === r.mentor_profile_id); return `<div class="lrow"><span class="itile sm ${r.status === "accepted" ? "green" : r.status === "declined" ? "red" : "amber"}">${icon(r.status === "accepted" ? "checkc" : r.status === "declined" ? "x" : "clock")}</span><span class="body"><b>${esc(m?.name || "Mentor")} · ${esc(r.topic)}</b><span>${esc(r.status)}${r.reply ? ` · “${esc(r.reply)}”` : ""}</span></span></div>`; }).join("")}</section>` : ""}
      <div class="grid g2 mt">${(rows.error ? [] : rows).map((a) => `<article class="card mentor"><div class="row nowrap"><span class="avatar">${esc(ctx.initials(a.name))}</span><div class="grow min0"><b>${esc(a.name)}</b><p class="small muted">${esc(a.role)} · ${esc(a.org)}</p><p class="xs">${icon("pin", "sm")} ${esc(a.country)}${a.dept ? ` · ${esc(a.dept)}` : ""}</p></div></div>
        ${a.mentor_topics ? `<p class="small mt-s"><b>Can help with:</b> ${esc(a.mentor_topics)}</p>` : ""}<div class="row mt-s"><button class="btn sm primary" data-ask="${a.id}">${icon("mail", "sm")} Ask for mentoring</button>${a.linkedin ? `<a class="btn sm ghost" href="${esc(a.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>` : ""}</div></article>`).join("")
        || `<div class="card">${ctx.empty("icon:community", "No mentors yet", "Alumni can offer mentoring from their Alumni hub.")}</div>`}</div>`;
  };
  pages.mentors.mount = (el) => $$("[data-ask]", el).forEach((b) => b.addEventListener("click", () => {
    const a = (cache.mentors?.v || []).find((x) => String(x.id) === b.dataset.ask);
    openModal(modalHead(`Ask ${a.name}`) + `<form id="mr" class="stack"><label class="field">Topic<input class="input" name="topic" required minlength="3" maxlength="120" placeholder="Applying for an MSc in Germany"></label>
      <label class="field">Message<textarea class="input" name="message" rows="5" required minlength="10" maxlength="1500" placeholder="Introduce yourself (department, semester) and what you'd like help with."></textarea></label>
      <p class="xs">${esc(a.name)} sees your name, email and message, and can reply here.</p><button class="btn primary">${icon("mail")} Send request</button></form>`, (m) => $("#mr", m).addEventListener("submit", async (e) => {
      e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)), btn = e.target.querySelector("button"); busy(btn, true);
      try { ok(await sb().from("mentor_requests").insert({ mentor_profile_id: a.id, topic: d.topic.trim(), message: d.message.trim(), student_name: myName().slice(0, 80) })); closeModal(); bust("myMentorReq"); ctx.rerender(); toast("Request sent", "success", "You'll see the reply here."); }
      catch (err) { busy(btn, false); toast(/row-level/i.test(err.message) ? "Only students can send up to 5 requests a day" : err.message, "error"); }
    }));
  }));

  /* ═════════ OFFICE HOURS & CONSULTATIONS (students) ═════════ */
  let oQ = "";
  const hoursText = (h) => (Array.isArray(h) && h.length ? h.map((x) => `${DAYS[x.day]} ${ctx.fmt12(x.start)}–${ctx.fmt12(x.end)}`).join(" · ") : "No office hours posted");
  pages.office = () => {
    const head = ctx.head("Office hours", "See when your teachers are free and request a consultation.");
    const g = gate("Sign in to see office hours and request consultations."); if (g) return head + `<section class="card">${g}</section>`;
    const rows = later("teachers", async () => ok(await sb().from("teacher_profiles").select("*").order("name").limit(500)));
    const mine = later("myConsult", async () => ok(await sb().from("consult_requests").select("*").eq("student_id", me().id).order("created_at", { ascending: false }).limit(30)));
    if (!rows || !mine) return head + loading;
    const myInits = new Set(S().routine.map((r) => String(r.faculty || "").toUpperCase()));
    const q = oQ.toLowerCase(), list = (rows.error ? [] : rows).filter((t) => !q || `${t.name} ${t.init} ${t.dept}`.toLowerCase().includes(q)).sort((a, b) => myInits.has(b.init) - myInits.has(a.init));
    return `${head}${(mine.error ? [] : mine).length ? `<section class="card"><div class="card-h"><h2>Your consultation requests</h2></div>${mine.map((r) => { const t = list.find((x) => x.user_id === r.teacher_id) || (rows.error ? [] : rows).find((x) => x.user_id === r.teacher_id); return `<div class="lrow"><span class="itile sm ${r.status === "accepted" ? "green" : r.status === "declined" ? "red" : r.status === "done" ? "blue" : "amber"}">${icon("calendar")}</span><span class="body"><b>${esc(t?.name || "Teacher")} · ${esc(r.topic)}</b><span>${esc(r.status)}${r.reply ? ` · “${esc(r.reply)}”` : ""}</span></span></div>`; }).join("")}</section>` : ""}
      <div class="searchbar mt">${icon("search")}<input class="input" id="oq" type="search" value="${esc(oQ)}" placeholder="Search teachers by name, initials or department"></div>
      <div class="grid g2 mt">${list.map((t) => `<article class="card"><div class="row nowrap"><span class="avatar">${esc(ctx.initials(t.name))}</span><div class="grow min0"><b>${esc(t.name)}${t.init ? ` (${esc(t.init)})` : ""}</b><p class="small muted">${esc([t.designation, t.dept].filter(Boolean).join(" · "))}</p></div>${myInits.has(t.init) ? '<span class="pill purple">Your teacher</span>' : ""}</div>
        <p class="small mt-s">${icon("clock", "sm")} ${esc(hoursText(t.office_hours))}</p>${t.room ? `<p class="xs">${icon("room", "sm")} Room ${esc(t.room)}</p>` : ""}${t.note ? `<p class="xs mt-s">${esc(t.note)}</p>` : ""}
        <div class="row mt-s">${t.consult_open ? `<button class="btn sm primary" data-cr="${t.user_id}">${icon("calendar", "sm")} Request consultation</button>` : '<span class="xs">Not taking requests right now</span>'}${t.room ? `<a class="btn sm ghost" href="#/map?to=${encodeURIComponent(t.room)}">${icon("map", "sm")} Directions</a>` : ""}</div></article>`).join("")
        || `<div class="card">${ctx.empty("icon:users", "No teachers here yet", "Teachers appear once they sign in with their EWU email and set office hours.")}</div>`}</div>`;
  };
  pages.office.mount = (el) => {
    $("#oq", el)?.addEventListener("input", (e) => { oQ = e.target.value; clearTimeout(pages.office.t); pages.office.t = setTimeout(() => { ctx.rerender(); const i = $("#oq"); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }, 250); });
    $$("[data-cr]", el).forEach((b) => b.addEventListener("click", () => {
      const t = (cache.teachers?.v || []).find((x) => x.user_id === b.dataset.cr), courses = [...new Set(S().routine.filter((r) => String(r.faculty || "").toUpperCase() === t.init).map((r) => r.code))];
      openModal(modalHead(`Consult ${t.name}`) + `<form id="cf" class="stack"><label class="field">Course${courses.length ? `<select class="select" name="course">${courses.map((c) => `<option>${esc(c)}</option>`).join("")}<option value="">Other</option></select>` : `<input class="input" name="course" maxlength="12" placeholder="CSE207">`}</label>
        <label class="field">What do you need help with?<input class="input" name="topic" required minlength="3" maxlength="140" placeholder="Doubt about Assignment 2, question 3"></label>
        <label class="field">When suits you?<input class="input" name="preferred" maxlength="80" placeholder="${esc(hoursText(t.office_hours).split(" · ")[0] || "Sunday after 2 PM")}"></label>
        <button class="btn primary">${icon("mail")} Send request</button></form>`, (m) => $("#cf", m).addEventListener("submit", async (e) => {
        e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)), btn = e.target.querySelector("button"); busy(btn, true);
        try { ok(await sb().from("consult_requests").insert({ teacher_id: t.user_id, course: String(d.course || "").toUpperCase().replace(/\s/g, ""), topic: d.topic.trim(), preferred: d.preferred.trim(), student_name: myName().slice(0, 80) })); closeModal(); bust("myConsult"); ctx.rerender(); toast("Request sent", "success", "You'll see the teacher's answer here."); }
        catch (err) { busy(btn, false); toast(/row-level/i.test(err.message) ? "Only students can request (up to 5 a day)" : err.message, "error"); }
      }));
    }));
  };

  /* ═════════ TEACHING HUB (teachers) ═════════ */
  let thTab = "requests";
  pages.teach = () => {
    const head = ctx.head("Teaching hub", "Office hours, consultations and announcements to your students.");
    const g = gate("Sign in with your EWU university email (name@ewubd.edu).", ["faculty"]); if (g) return head + `<section class="card">${g}</section>`;
    const prof = later("tprof", async () => ok(await sb().from("teacher_profiles").select("*").eq("user_id", me().id).maybeSingle()) || {});
    const reqs = later("treqs", async () => ok(await sb().from("consult_requests").select("*").eq("teacher_id", me().id).order("created_at", { ascending: false }).limit(100)));
    const notes = later("tnotes", async () => ok(await sb().from("course_notices").select("*").eq("teacher_id", me().id).order("created_at", { ascending: false }).limit(50)));
    if (!prof || !reqs || !notes) return head + loading;
    const p = prof.error ? {} : prof, pend = (reqs.error ? [] : reqs).filter((r) => r.status === "pending").length;
    const tabs = ctx.seg([["requests", `Consultations${pend ? ` (${pend})` : ""}`], ["notices", "Announcements"], ["profile", "Profile & office hours"]], thTab, "data-th");
    let body = "";
    if (!p.user_id && thTab !== "profile") body = `<div class="alert amber">${icon("info")}<div class="grow"><b>Set up your teaching profile first</b><p>Add your name, initials and office hours so students can find you.</p></div><button class="btn sm primary" data-th="profile">Set up</button></div>`;
    else if (thTab === "requests") body = (reqs.error ? [] : reqs).map((r) => `<article class="card"><div class="row"><span class="pill ${r.status === "pending" ? "amber" : r.status === "accepted" ? "green" : r.status === "declined" ? "red" : ""}">${esc(r.status)}</span>${r.course ? `<span class="pill">${esc(r.course)}</span>` : ""}<span class="grow"></span><span class="xs">${ago(r.created_at)}</span></div>
        <p class="mt-s"><b>${esc(r.topic)}</b></p><p class="small muted">${esc(r.student_name || "Student")} · <a href="mailto:${esc(r.student_email)}">${esc(r.student_email)}</a>${r.preferred ? ` · prefers ${esc(r.preferred)}` : ""}</p>${r.reply ? `<p class="xs mt-s">Your reply: “${esc(r.reply)}”</p>` : ""}
        <div class="row mt-s">${r.status === "pending" ? `<button class="btn sm primary" data-ans="${r.id}:accepted">${icon("check", "sm")} Accept</button><button class="btn sm ghost" data-ans="${r.id}:declined">Decline</button>` : r.status === "accepted" ? `<button class="btn sm" data-ans="${r.id}:done">Mark as done</button>` : ""}</div></article>`).join("") || `<div class="card">${ctx.empty("icon:calendar", "No requests yet", "Students request consultations from the Office hours page.")}</div>`;
    else if (thTab === "notices") body = `<form class="card stack" id="nf"><b>Announce to a course</b><div class="grid g2"><label class="field">Course<input class="input" name="course" required pattern="[A-Za-z]{2,4}\\s?[0-9]{3,4}[A-Za-z]?" placeholder="CSE207"></label><label class="field">Section (empty = all sections)<input class="input" name="section" inputmode="numeric" maxlength="3" placeholder="2"></label></div>
        <label class="field">Title<input class="input" name="title" required minlength="3" maxlength="140" placeholder="Quiz 2 moved to Thursday"></label><label class="field">Details<textarea class="input" name="body" rows="3" maxlength="3000"></textarea></label>
        <p class="xs">Students who have this course on their routine get it in their notifications.</p><button class="btn primary">${icon("megaphone")} Send announcement</button></form>
        ${(notes.error ? [] : notes).map((n) => `<div class="lrow"><span class="itile sm orange">${icon("megaphone")}</span><span class="body"><b>${esc(n.course)}${n.section ? ` · Sec ${esc(n.section)}` : ""}: ${esc(n.title)}</b><span>${ago(n.created_at)}</span></span><button class="btn sm ghost" data-nd="${n.id}" aria-label="Delete">${icon("trash", "sm")}</button></div>`).join("")}`;
    else body = `<form class="card stack" id="pfm"><div class="grid g2"><label class="field">Name<input class="input" name="name" required minlength="2" maxlength="80" value="${esc(p.name || myName())}"></label><label class="field">Routine initials<input class="input" name="init" maxlength="8" pattern="[A-Za-z]{2,8}" value="${esc(p.init || "")}" placeholder="NHR"></label>
        <label class="field">Department<input class="input" name="dept" value="${esc(p.dept || "")}" placeholder="CSE"></label><label class="field">Designation<input class="input" name="designation" value="${esc(p.designation || "")}" placeholder="Assistant Professor"></label>
        <label class="field">Office room<input class="input" name="room" value="${esc(p.room || "")}" placeholder="636"></label><label class="field">Note for students<input class="input" name="note" maxlength="300" value="${esc(p.note || "")}" placeholder="Email me before coming"></label></div>
        <b class="mt">Office hours</b><div id="oh" class="stack" style="gap:6px"></div><button type="button" class="btn sm outline" id="ohadd">${icon("plus", "sm")} Add a time</button>
        <label class="sw-row"><span class="grow">Students can request consultations</span><input type="checkbox" class="switch" name="consult_open" ${p.consult_open !== false ? "checked" : ""}></label>
        <button class="btn primary">${icon("check")} Save profile</button></form>`;
    return `${head}${tabs}<div class="stack mt">${body}</div>`;
  };
  pages.teach.mount = (el) => {
    $$("[data-th]", el).forEach((b) => b.addEventListener("click", () => { thTab = b.dataset.th; ctx.rerender(); }));
    $$("[data-ans]", el).forEach((b) => b.addEventListener("click", () => {
      const [id, status] = b.dataset.ans.split(":");
      const send = async (reply) => { try { ok(await sb().from("consult_requests").update({ status, reply: reply.slice(0, 1000) }).eq("id", id)); bust("treqs"); ctx.rerender(); toast(`Request ${status}`); } catch (e) { toast(e.message, "error"); } };
      if (status === "done") return send("");
      openModal(modalHead(status === "accepted" ? "Accept and reply" : "Decline") + `<form id="rf" class="stack"><label class="field">Message to the student<textarea class="input" name="r" rows="3" maxlength="1000" placeholder="${status === "accepted" ? "Come to room 636 on Sunday at 2 PM." : "Sorry, I'm away this week."}"></textarea></label><button class="btn primary">Send</button></form>`, (m) => $("#rf", m).addEventListener("submit", (e) => { e.preventDefault(); closeModal(); send(String(new FormData(e.target).get("r") || "").trim()); }));
    }));
    $("#nf", el)?.addEventListener("submit", async (e) => {
      e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)), b = e.target.querySelector("button.primary"), prof = cache.tprof?.v || {}; busy(b, true);
      try { ok(await sb().from("course_notices").insert({ course: d.course.toUpperCase().replace(/\s/g, ""), section: d.section.trim(), title: d.title.trim(), body: d.body.trim(), teacher_name: prof.name || myName() })); bust("tnotes"); ctx.rerender(); toast("Announcement sent", "success"); }
      catch (err) { busy(b, false); toast(err.message, "error"); }
    });
    $$("[data-nd]", el).forEach((b) => b.addEventListener("click", async () => { try { ok(await sb().from("course_notices").delete().eq("id", b.dataset.nd)); bust("tnotes"); ctx.rerender(); } catch (e) { toast(e.message, "error"); } }));
    const f = $("#pfm", el); if (!f) return;
    let hours = ((cache.tprof?.v || {}).office_hours || []).slice();
    const drawH = () => { $("#oh", el).innerHTML = hours.map((h, i) => `<div class="row nowrap"><select class="select" data-hd="${i}">${DAYS.map((d, k) => `<option value="${k}" ${h.day === k ? "selected" : ""}>${d}</option>`).join("")}</select><input class="input" type="time" data-hs="${i}" value="${h.start}"><input class="input" type="time" data-he="${i}" value="${h.end}"><button type="button" class="btn sm ghost" data-hx="${i}" aria-label="Remove">${icon("x", "sm")}</button></div>`).join("") || '<p class="xs">No office hours yet.</p>';
      $$("[data-hd]", el).forEach((s) => s.addEventListener("change", () => { hours[s.dataset.hd].day = Number(s.value); }));
      $$("[data-hs]", el).forEach((s) => s.addEventListener("change", () => { hours[s.dataset.hs].start = s.value; }));
      $$("[data-he]", el).forEach((s) => s.addEventListener("change", () => { hours[s.dataset.he].end = s.value; }));
      $$("[data-hx]", el).forEach((b) => b.addEventListener("click", () => { hours.splice(Number(b.dataset.hx), 1); drawH(); })); };
    drawH(); $("#ohadd", el).addEventListener("click", () => { hours.push({ day: 0, start: "10:00", end: "12:00" }); drawH(); });
    f.addEventListener("submit", async (e) => {
      e.preventDefault(); const d = Object.fromEntries(new FormData(f)), b = f.querySelector("button.primary"); busy(b, true);
      try { ok(await sb().from("teacher_profiles").upsert({ user_id: me().id, name: d.name.trim(), init: d.init.trim().toUpperCase(), dept: d.dept.trim(), designation: d.designation.trim(), room: d.room.trim(), note: d.note.trim(), consult_open: f.consult_open.checked,
        office_hours: hours.filter((h) => h.start && h.end && h.end > h.start).sort((a, b) => a.day - b.day || a.start.localeCompare(b.start)), updated_at: new Date().toISOString() }));
        S().profile = Object.assign(S().profile || {}, { name: d.name.trim(), init: d.init.trim().toUpperCase(), department: d.dept.trim() }); ctx.save();
        bust("tprof", "teachers"); thTab = "requests"; ctx.rerender(); toast("Profile saved", "success", "Students see your office hours now."); }
      catch (err) { busy(b, false); toast(err.message, "error"); }
    });
  };

  /* ═════════ ALUMNI HUB (alumni) ═════════ */
  pages.alumhub = () => {
    const head = ctx.head("Alumni hub", "Mentor students, share openings and keep your profile up to date.");
    const g = gate("Sign in with your alumni account.", ["alumni"]); if (g) return head + `<section class="card">${g}</section>`;
    const prof = later("aprof", async () => ok(await sb().from("alumni_profiles").select("*").eq("user_id", me().id).maybeSingle()) || {});
    const reqs = later("areqs", async () => ok(await sb().from("mentor_requests").select("*").order("created_at", { ascending: false }).limit(100)));
    if (!prof || !reqs) return head + loading;
    const p = prof.error ? {} : prof, list = reqs.error ? [] : reqs.filter((r) => r.mentor_profile_id === p.id);
    return `${head}<div class="grid g3">${[["community", "green", "Alumni directory", "Where graduates are now", "#/alumni"], ["briefcase", "blue", "Post a job or internship", "Help students get hired", "#/jobs"], ["edit", "purple", "Write for the blog", "Share your experience", "#/write"]].map(([ic, t, b, s, h]) => `<a class="dtile" href="${h}"><span class="itile ${t}">${icon(ic)}</span><div class="min0"><b>${b}</b><span>${s}</span></div></a>`).join("")}</div>
      <section class="card mt"><div class="card-h"><h2>Your alumni profile</h2>${p.id ? `<span class="pill ${p.status === "approved" ? "green" : "amber"}">${esc(p.status)}</span>` : ""}</div>
        ${p.id ? `<p><b>${esc(p.name)}</b> · ${esc(p.role)} at ${esc(p.org)} · ${esc(p.country)}</p>
          <form id="mt" class="stack mt"><label class="sw-row"><span class="grow"><b>Mentor EWU students</b><span class="xs" style="display:block">Students can ask you for advice. You choose whom to answer.</span></span><input type="checkbox" class="switch" name="mentor" ${p.mentor ? "checked" : ""} ${p.status === "approved" ? "" : "disabled"}></label>
          <label class="field">What can you help with?<input class="input" name="topics" maxlength="200" value="${esc(p.mentor_topics || "")}" placeholder="CV reviews, software jobs, MSc in Germany"></label><button class="btn primary" ${p.status === "approved" ? "" : "disabled"}>${icon("check")} Save</button>${p.status !== "approved" ? '<p class="xs">Mentoring opens once the team approves your profile.</p>' : ""}</form>`
          : `<p class="small muted">Add yourself to the Alumni section so students can find you and you can mentor.</p><a class="btn primary mt-s" href="#/alumni">${icon("plus")} Add my alumni profile</a>`}</section>
      <section class="card mt"><div class="card-h"><h2>Mentoring requests</h2></div>${list.map((r) => `<div class="lrow"><span class="itile sm ${r.status === "pending" ? "amber" : r.status === "accepted" ? "green" : "red"}">${icon("mail")}</span><span class="body"><b>${esc(r.student_name || "Student")}: ${esc(r.topic)}</b><span>${esc(r.message.slice(0, 160))} · <a href="mailto:${esc(r.student_email)}">${esc(r.student_email)}</a> · ${ago(r.created_at)}</span></span>
        ${r.status === "pending" ? `<button class="btn sm primary" data-ma="${r.id}:accepted">Accept</button><button class="btn sm ghost" data-ma="${r.id}:declined">Decline</button>` : `<span class="pill">${esc(r.status)}</span>`}</div>`).join("") || '<p class="small muted">No requests yet.</p>'}</section>`;
  };
  pages.alumhub.mount = (el) => {
    $("#mt", el)?.addEventListener("submit", async (e) => {
      e.preventDefault(); const f = e.target;
      try { ok(await sb().rpc("set_my_mentoring", { on_: f.mentor.checked, topics: f.topics.value.trim() })); bust("aprof", "mentors"); toast(f.mentor.checked ? "You're now listed as a mentor" : "Mentoring turned off"); ctx.rerender(); } catch (err) { toast(err.message, "error"); }
    });
    $$("[data-ma]", el).forEach((b) => b.addEventListener("click", () => {
      const [id, status] = b.dataset.ma.split(":");
      openModal(modalHead(status === "accepted" ? "Accept and reply" : "Decline") + `<form id="rf" class="stack"><label class="field">Reply<textarea class="input" name="r" rows="3" maxlength="1500" placeholder="${status === "accepted" ? "Happy to help! Email me at … or message me on LinkedIn." : "Sorry, I can't take this on right now."}"></textarea></label><button class="btn primary">Send</button></form>`,
        (m) => $("#rf", m).addEventListener("submit", async (e) => { e.preventDefault(); closeModal(); try { ok(await sb().from("mentor_requests").update({ status, reply: String(new FormData(e.target).get("r") || "").trim() }).eq("id", id)); bust("areqs"); ctx.rerender(); toast("Reply sent"); } catch (err) { toast(err.message, "error"); } }));
    }));
  };

  /* Course announcements for the student's courses (shown in Notifications). */
  async function courseNotices() {
    if (!ctx.cloud.enabled || !me() || !S().routine.length) return [];
    const codes = [...new Set(S().routine.map((r) => r.code))];
    const rows = ok(await sb().from("course_notices").select("*").in("course", codes).gt("created_at", new Date(Date.now() - 30 * 864e5).toISOString()).order("created_at", { ascending: false }).limit(40)) || [];
    const mySec = Object.fromEntries(S().routine.map((r) => [r.code, String(r.sec || "")]));
    return rows.filter((n) => !n.section || n.section === mySec[n.course]);
  }
  return { courseNotices, refresh: () => Object.keys(cache).forEach((k) => delete cache[k]) };
}
