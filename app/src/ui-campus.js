/* Campus screens: study vault (+ file detail), free rooms, faculty directory (+ profile & reviews), cover page. */
export function install(ctx) {
  const { pages, icon, esc, $, $$, toast, openModal, closeModal, modalHead, confirmModal, busy } = ctx;
  const S = () => ctx.S;
  const C = ctx.C;
  const live = () => ctx.cloud.enabled && C.user;
  const hash = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };

  /* ═════════════ STUDY VAULT ═════════════ */
  const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round((b || 0) / 1024)) + " KB");
  const ext = (v) => { const m = String(v.file_path || v.title || "").toLowerCase().match(/\.(pdf|pptx?|docx?|zip|png|jpe?g)$/); return m ? m[1].replace(/x$/, "").replace("jpeg", "jpg") : "pdf"; };
  const ftype = (v) => { const e = ext(v); const k = e === "ppt" ? "ppt" : e === "doc" ? "doc" : e === "zip" ? "zip" : /png|jpg/.test(e) ? "img" : "pdf"; return `<span class="ftype ${k}" aria-hidden="true">${k.toUpperCase()}</span>`; };
  const GROUP = (t) => (t === "Notes" ? "Lecture Notes" : t === "Past paper" ? "Past Papers" : t === "Slides" ? "Slides" : "Others");
  const ago = (d) => { if (!d) return ""; const m = Math.round((Date.now() - new Date(d)) / 6e4); return m < 60 ? "just now" : m < 1440 ? `${Math.round(m / 60)} hours ago` : m < 10080 ? `${Math.round(m / 1440)} days ago` : ctx.fmtDate(d); };
  let vTab = "All", vQ = "", vMine = false;
  const vaultItems = () => (live() ? C.vault || [] : S().demo ? ctx.DEMO.vault : []);
  pages.vault = () => {
    const qp = ctx.qparam("q"); if (qp) { vQ = qp; history.replaceState(null, "", "#/vault"); }
    const items = vaultItems(), mine = new Set(S().routine.map((r) => r.code)), saved = new Set(S().bookmarks.files);
    const list = items.filter((v) => (vTab === "All" || (vTab === "Saved" ? saved.has(v.id) : GROUP(v.type) === vTab)) && (!vMine || mine.has(v.course)) && (!vQ || `${v.title} ${v.course} ${v.type}`.toLowerCase().includes(vQ.toLowerCase())));
    const popular = items.slice().sort((a, b) => b.votes - a.votes).slice(0, 6);
    const latest = list.slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0) || b.votes - a.votes);
    const headHtml = ctx.head("Study Vault", "Notes, past papers, resources — by students, for students.", live() ? `<button class="btn primary" id="v-up">${icon("upload")} Upload</button>` : "");
    if (!items.length && !(live() && !C.vault)) {
      const why = !ctx.cloud.enabled ? ["icon:cloudoff", "The shared vault isn't connected yet", "The study vault needs the EWUdiots online service, which isn't connected in this build. Everything else works on your device."]
        : !C.user ? ["icon:lock", "Sign in to open the vault", "Only verified EWU students can browse, download and share notes, slides and past papers.", `<a class="btn primary" href="#/login?from=profile">${icon("mail")} Sign in with EWU email</a>`]
        : ["icon:notes", "No Notes Yet", "Be the first to add notes for your courses.", `<button class="btn primary" id="v-up2">${icon("upload")} Upload Notes</button>`];
      return `${headHtml}<div class="card">${ctx.empty(...why)}</div>`;
    }
    return `${headHtml}${S().demo && !live() ? `<div class="alert purple" style="margin-bottom:12px"><span class="a-ic">${icon("info")}</span><div><b>Sample items</b><p>Sign in with your EWU email to browse and share real material.</p></div></div>` : ""}
      ${ctx.seg(["All", "Lecture Notes", "Past Papers", "Slides", "Others", "Saved"].map((x) => [x, x]), vTab, "data-vt")}
      <div class="row nowrap mt"><div class="searchbar grow">${icon("search")}<input class="input" id="v-q" type="search" placeholder="Search notes, courses, topics…" value="${esc(vQ)}" aria-label="Search vault"></div><button class="icon-btn" id="v-mine" aria-pressed="${vMine}" aria-label="Only my courses" style="${vMine ? "background:var(--primary-l);color:var(--primary)" : ""}">${icon("sliders")}</button></div>
      ${live() && !C.vault ? `<div class="grid g3 mt">${[1, 2, 3].map(() => '<div class="skel" style="height:140px"></div>').join("")}</div>` : `
      ${vTab === "All" && !vQ && popular.length ? `<div class="section-h"><h2>Popular This Week</h2></div><div class="hscroll">${popular.map((v) => `<a class="popcard" href="#/file?id=${encodeURIComponent(v.id)}">${ftype(v)}<b style="margin-top:8px">${esc(v.course)}</b><span class="small">${esc(v.title)}</span><span class="xs">${esc(v.type)} · ${fmtSize(v.size_bytes)}</span><span class="stats"><span>${icon("heart")} ${v.votes}</span>${saved.has(v.id) ? `<span>${icon("bookmark")}</span>` : ""}</span></a>`).join("")}</div>` : ""}
      <div class="section-h"><h2>${vQ || vTab !== "All" ? `${latest.length} result${latest.length === 1 ? "" : "s"}` : "Latest Uploads"}</h2></div>
      ${latest.length ? `<section class="card tight">${latest.slice(0, 50).map((v) => `<a class="lrow" href="#/file?id=${encodeURIComponent(v.id)}">${ftype(v)}<span class="body"><b>${esc(v.course)} - ${esc(v.title)}</b><span>${v.mine ? "Shared by you" : esc(v.type)}${v.created_at ? ` · ${ago(v.created_at)}` : ""}</span><span class="row mt-s" style="gap:6px"><span class="tag">${esc(v.course)}</span><span class="tag">${esc(GROUP(v.type))}</span></span></span><span class="meta"><span class="row nowrap" style="gap:4px">${icon("heart", "sm")} ${v.votes}</span><span>${fmtSize(v.size_bytes)}</span></span></a>`).join("")}</section>`
        : `<div class="card">${ctx.empty("icon:search", "No Results Found", "Try a different keyword or filter.", `<button class="btn" id="v-clear">Clear Filters</button>`)}</div>`}`}`;
  };
  pages.vault.mount = (el) => {
    const q = $("#v-q", el); let t;
    q && q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { vQ = q.value; ctx.rerender(); const n = $("#v-q"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 220); });
    $$("[data-vt]", el).forEach((b) => b.addEventListener("click", () => { vTab = b.dataset.vt; ctx.rerender(); }));
    const on = (s, fn) => $$(s, el).forEach((b) => b.addEventListener("click", fn));
    on("#v-mine", () => { vMine = !vMine; ctx.rerender(); toast(vMine ? "Showing your courses only" : "Showing all courses", "info"); });
    on("#v-clear", () => { vQ = ""; vTab = "All"; vMine = false; ctx.rerender(); });
    on("#v-up, #v-up2", () => ctx.materials.share("", {}));
    if (live() && !C.vault) loadVault();
    if (ctx.qparam("up") && live()) { history.replaceState(null, "", "#/vault"); setTimeout(() => ctx.materials.share("", {})); }
  };
  const loadVault = () => Promise.all([ctx.cloud.listResources(), ctx.cloud.myVotes(C.user.id)]).then(([l, v]) => { C.vault = l; C.votes = v; if (["vault", "file"].includes(ctx.route())) ctx.rerender(); }).catch((e) => toast("Failed to load data", "error", e.message));
  pages.file = () => {
    const id = ctx.qparam("id"), v = vaultItems().find((x) => String(x.id) === id);
    if (live() && !C.vault) { loadVault(); return `${ctx.subHead("Loading…", "", "#/vault")}<div class="skel" style="height:260px"></div>`; }
    if (!v) return `${ctx.subHead("File", "", "#/vault")}<div class="card">${ctx.empty("mascot-confused", "File not found", "It may have been removed.", `<a class="btn primary" href="#/vault">Back to Vault</a>`)}</div>`;
    const saved = S().bookmarks.files.includes(v.id), voted = C.votes.has(v.id);
    return `${ctx.subHead(`${esc(v.course)} - ${esc(v.title)}`, "", "#/vault", `<button class="icon-btn" id="f-save" aria-pressed="${saved}" aria-label="${saved ? "Remove from" : "Save to"} My Vault">${icon("bookmark", saved ? "fill" : "")}</button>`)}<div style="max-width:760px;margin:0 auto">
      <section class="card row nowrap">${ftype(v)}<div class="min0"><b style="font-size:17px">${esc(v.course)} - ${esc(v.title)}</b><p class="small muted">${esc(v.type)} · ${fmtSize(v.size_bytes)}${v.created_at ? ` · ${ctx.fmtDate(v.created_at)}` : ""}</p></div></section>
      <section class="card mt fstats"><div><b>${icon("heart")} ${v.votes}</b><span class="xs">Upvotes</span></div><div><b>${icon("file")} ${ext(v).toUpperCase()}</b><span class="xs">Format</span></div><div><b>${icon("vault")} ${fmtSize(v.size_bytes)}</b><span class="xs">Size</span></div>${live() && !v.mine ? `<button class="btn ghost" id="f-report" style="flex-direction:column;gap:2px;color:var(--error-t)">${icon("alert")}<span class="xs" style="color:var(--error-t)">Report</span></button>` : "<div></div>"}</section>
      <div class="row nowrap mt"><button class="btn primary lg grow" id="f-dl">${icon("download")} Download ${ext(v).toUpperCase()} (${fmtSize(v.size_bytes)})</button></div>
      <h2 class="mt-l">About This File</h2><div class="row mt-s"><span class="tag">${esc(v.course)}</span><span class="tag">${esc(v.type)}</span><span class="tag">${esc(GROUP(v.type))}</span></div>
      ${ext(v) === "pdf" ? `<div class="section-h"><h2>Preview</h2></div><div class="preview-box" id="f-prev"><button class="btn outline" id="f-load">${icon("eye")} Load preview</button></div>` : ""}
      <div class="row mt"><button class="btn ${voted ? "primary" : "outline"} grow" id="f-vote" aria-pressed="${voted}">${icon("thumb")} Upvote (${v.votes})</button><button class="btn outline grow" id="f-save2">${icon("bookmark")} ${saved ? "Saved" : "Save to My Vault"}</button></div></div>`;
  };
  pages.file.mount = (el) => {
    const v = vaultItems().find((x) => String(x.id) === ctx.qparam("id")); if (!v) return;
    const toggleSave = () => { const B = S().bookmarks; B.files = B.files.includes(v.id) ? B.files.filter((x) => x !== v.id) : [...B.files, v.id]; ctx.save({ silent: true }); ctx.rerender(); toast(B.files.includes(v.id) ? "Saved to My Vault" : "Removed from My Vault", "info"); };
    const on = (s, fn) => { const b = $(s, el); b && b.addEventListener("click", fn); };
    on("#f-save", toggleSave); on("#f-save2", toggleSave);
    on("#f-dl", async () => { if (!live()) return toast(ctx.cloud.enabled ? "Sign in to download" : "Downloads need the online service", "warn"); try { window.open(await ctx.cloud.downloadUrl(v.file_path), "_blank", "noopener"); } catch (e) { toast("Download failed", "error", e.message); } });
    on("#f-load", async () => { if (!live()) return toast("Sign in to preview files", "warn"); try { $("#f-prev", el).innerHTML = `<iframe src="${esc(await ctx.cloud.downloadUrl(v.file_path))}" title="Preview of ${esc(v.title)}"></iframe>`; } catch (e) { toast("Preview failed", "error", e.message); } });
    on("#f-vote", async () => {
      if (!live()) return toast("Sign in to vote", "warn");
      const on2 = !C.votes.has(v.id);
      try { await ctx.cloud.voteResource(C.user.id, v.id, on2); on2 ? C.votes.add(v.id) : C.votes.delete(v.id); v.votes += on2 ? 1 : -1; ctx.rerender(); } catch (e) { toast(e.message, "error"); }
    });
    on("#f-report", () => confirmModal("Report this file?", "Report copyrighted, wrong or inappropriate material. Three reports hide it until reviewed.", "Report", () => ctx.cloud.report(C.user.id, "resource", v.id).then(() => toast("Reported. Thanks.", "info")), true, "flag"));
  };

  /* ═════════════ FREE ROOMS ═════════════ */
  let rmTab = "now", rmDay = null, rmSlot = null, rmBld = "any", rmType = "any", rmQ = "", rmShowBusy = false;
  const BLD = (r) => { const p = (r.match(/^[A-Z]+\d?/i) || ["Other"])[0].toUpperCase(); const m = p.match(/^AB(\d)$/); return m ? `Academic Building ${m[1]}` : /^\d/.test(r) ? "Main Campus" : p === "LB" ? "Library Building" : `${p} Building`; };
  pages.rooms = () => {
    const qp = ctx.qparam("q"); if (qp) { rmQ = qp; history.replaceState(null, "", "#/rooms"); }
    const now = new Date(), nm = now.getHours() * 60 + now.getMinutes();
    const d = rmDay ?? now.getDay();
    const slot = rmTab === "later" ? rmSlot || ctx.SLOTS.find((s) => ctx.toMin(s.split("-")[0]) > nm) || ctx.SLOTS[0] : null;
    const [ss, se] = slot ? slot.split("-").map(ctx.toMin) : [rmDay === null ? nm : 8 * 60, (rmDay === null ? nm : 8 * 60) + 30];
    const { occ, rooms, kind } = ctx.roomData(), favs = new Set(S().bookmarks.rooms);
    const busyAt = new Map(); occ.filter((o) => o.day === d && o.s < se && ss < o.e).forEach((o) => busyAt.set(o.room, Math.max(busyAt.get(o.room) || 0, o.e)));
    const nextStart = (r) => Math.min(...occ.filter((o) => o.room === r && o.day === d && o.s >= se).map((o) => o.s), 24 * 60);
    const blds = [...new Set(rooms.map(BLD))].sort();
    let list = rooms.filter((r) => (rmBld === "any" || BLD(r) === rmBld) && (rmType === "any" || (kind[r] || "Classroom") === rmType) && (!rmQ || r.toLowerCase().includes(rmQ.toLowerCase())) && (rmTab !== "favs" || favs.has(r)));
    const free = list.filter((r) => !busyAt.has(r)), busyL = list.filter((r) => busyAt.has(r));
    const card = (r) => { const isBusy = busyAt.has(r), until = isBusy ? busyAt.get(r) : nextStart(r);
      return `<div class="room"><img src="/img/room-${(hash(r) % 5) + 1}.webp" alt="" width="104" height="72" loading="lazy"><div class="min0"><h3>${esc(r.replace(/-/, " - "))}</h3><span class="xs">${icon("pin", "sm")} ${esc(BLD(r))}</span><span class="xs">${icon("room", "sm")} ${esc(kind[r] || "Classroom")}</span></div>
        <div class="right"><span class="pill ${isBusy ? "red" : "green"}">${isBusy ? "Occupied" : "Available"}</span><span>${isBusy ? `Until ${ctx.fmt12(until)}` : until >= 24 * 60 ? `${rmTab === "later" ? ctx.fmt12(ss) : "Now"} – Rest of day` : `${rmTab === "later" ? ctx.fmt12(ss) : "Now"} – ${ctx.fmt12(until)}`}</span><a class="bm" href="#/map?to=${encodeURIComponent(r)}" aria-label="Directions to ${esc(r)}">${icon("map")}</a><button class="bm" data-fav="${esc(r)}" aria-pressed="${favs.has(r)}" aria-label="${favs.has(r) ? "Remove from" : "Add to"} favorites">${icon("bookmark", favs.has(r) ? "fill" : "")}</button></div></div>`; };
    const days = [now.getDay(), ...[1, 2, 3, 4, 5, 6].map((k) => (now.getDay() + k) % 7)];
    return `${ctx.head("Free Rooms", "Find empty classrooms, labs and study spaces.", `<span class="live-chip">Live Status</span>`)}
      ${ctx.seg([["now", "Now"], ["later", "Later"], ["favs", "Favorites"]], rmTab, "data-rt")}
      <div class="row mt" style="gap:8px">
        <select class="select sm" id="rm-day" aria-label="Day">${days.map((x, i) => { const dt = new Date(now); dt.setDate(now.getDate() + i); return `<option value="${x}" ${x === d ? "selected" : ""}>${i === 0 ? "Today" : i === 1 ? "Tomorrow" : ""}${i < 2 ? ", " : ""}${dt.toLocaleDateString("en-GB", { weekday: i < 2 ? undefined : "short", day: "numeric", month: "short" })}</option>`; }).join("")}</select>
        ${rmTab === "later" ? `<select class="select sm" id="rm-slot" aria-label="Time">${ctx.SLOTS.map((s) => `<option value="${s}" ${s === slot ? "selected" : ""}>${s.split("-").map(ctx.fmt12).join(" – ")}</option>`).join("")}</select>` : ""}
        <select class="select sm" id="rm-bld" aria-label="Building"><option value="any">Any Building</option>${blds.map((b) => `<option ${b === rmBld ? "selected" : ""}>${esc(b)}</option>`).join("")}</select>
        <select class="select sm" id="rm-type" aria-label="Room type">${[["any", "Any Type"], ["Classroom", "Classroom"], ["Lab", "Lab"]].map(([v, l]) => `<option value="${v}" ${rmType === v ? "selected" : ""}>${l}</option>`).join("")}</select>
        ${rmQ ? `<button class="chip" id="rm-qx" aria-pressed="true">${esc(rmQ)} ${icon("x", "sm")}</button>` : ""}</div>
      ${!C.sections ? `<p class="xs mt-s">${ctx.cloud.enabled ? `<a href="#/login?from=profile">Sign in</a> for the campus-wide timetable. ` : ""}Using ${S().planner.offered ? "your synced offered courses and routine" : "your routine"} (${rooms.length} rooms known).</p>` : ""}
      ${!rooms.length ? `<div class="card mt">${ctx.empty("icon:door", "No room data yet", "Sync your Offered Courses page (all departments you like) to fill the room map.", `<a class="btn primary" href="#/sync">${icon("sync")} Sync Portal</a>`)}</div>` :
        list.length ? `<div class="mt">${free.slice(0, 40).map(card).join("")}</div>${free.length > 40 ? `<p class="xs mt-s">Showing 40 of ${free.length} free rooms. Use the filters to narrow down.</p>` : ""}
          ${busyL.length ? `<button class="btn ghost mt" id="rm-busy">${rmShowBusy ? "Hide" : "Show"} ${busyL.length} occupied room${busyL.length > 1 ? "s" : ""}</button>${rmShowBusy ? `<div class="mt-s">${busyL.slice(0, 40).map(card).join("")}</div>` : ""}` : ""}`
        : `<div class="card mt">${ctx.empty("icon:search", rmTab === "favs" ? "No favorites yet" : "No rooms match", rmTab === "favs" ? "Tap the bookmark on a room to save it here." : "Try a different building or type.")}</div>`}
      <p class="xs mt">Based on scheduled classes. Rooms may still be booked for events or make-up classes.</p>`;
  };
  pages.rooms.mount = (el) => {
    const ch = (s, fn) => { const x = $(s, el); x && x.addEventListener("change", (e) => { fn(e.target.value); ctx.rerender(); }); };
    $$("[data-rt]", el).forEach((b) => b.addEventListener("click", () => { rmTab = b.dataset.rt; ctx.rerender(); }));
    ch("#rm-day", (v) => { rmDay = Number(v) === new Date().getDay() ? null : Number(v); }); ch("#rm-slot", (v) => { rmSlot = v; }); ch("#rm-bld", (v) => { rmBld = v; }); ch("#rm-type", (v) => { rmType = v; });
    $("#rm-qx", el)?.addEventListener("click", () => { rmQ = ""; ctx.rerender(); });
    $("#rm-busy", el)?.addEventListener("click", () => { rmShowBusy = !rmShowBusy; ctx.rerender(); });
    $$("[data-fav]", el).forEach((b) => b.addEventListener("click", () => { const r = b.dataset.fav, B = S().bookmarks; B.rooms = B.rooms.includes(r) ? B.rooms.filter((x) => x !== r) : [...B.rooms, r]; ctx.save({ silent: true }); ctx.rerender(); }));
    if (C.user && !C.sections) ctx.cloud.fetchSections(S().routineSem || ctx.currentSemester()).then((s) => { C.sections = s; if (ctx.route() === "rooms") ctx.rerender(); }).catch(() => {});
  };

  /* ═════════════ FACULTY ═════════════ */
  let facQ = "", facDept = "All", facMine = false, facShow = 60;
  const face = (f, cls = "") => `<span class="avatar face ${cls}" style="background:${ctx.colorFor(f.init)}">${esc(ctx.initials(f.name || f.init))}${f.photo ? `<img src="${esc(f.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}</span>`;
  const showInit = (f) => (f.init && !f.init.startsWith("@") ? f.init : "");
  const stars = (r) => `<span style="color:var(--yellow)" aria-hidden="true">★</span> <b>${r.toFixed(1)}</b>`;
  pages.faculty = () => {
    const qp = ctx.qparam("q"); if (qp) { facQ = qp; history.replaceState(null, "", "#/faculty"); }
    const mine = new Set(S().routine.map((r) => r.faculty).concat(S().profile?.advisorInitial || []));
    const all = [...ctx.facultyIndex().values()].sort((a, b) => (mine.has(b.init) - mine.has(a.init)) || (b.rating || 0) - (a.rating || 0) || (a.name || a.init).localeCompare(b.name || b.init));
    const depts = ["All", ...new Set(all.map((f) => f.dept).filter(Boolean))];
    const q = facQ.toLowerCase();
    const list = all.filter((f) => (facDept === "All" || f.dept === facDept) && (!facMine || mine.has(f.init)) && (!q || [f.name, showInit(f), f.dept, f.deptName, f.designation, f.email, f.roomCode].join(" ").toLowerCase().includes(q)));
    const loading = C.directory === null;
    return `${ctx.demoBanner()}${ctx.head("Faculty Directory", `${C.directory?.length ? `${all.length} faculty members from ${depts.length - 1} departments` : "Contacts, offices and honest ratings"}, with reviews from verified EWU students.`)}
      <div class="row nowrap"><div class="searchbar grow">${icon("search")}<input class="input" id="fac-q" type="search" placeholder="Search name, initials, department, room" value="${esc(facQ)}" aria-label="Search faculty"></div><button class="chip" id="fac-mine" aria-pressed="${facMine}">My faculty</button></div>
      ${depts.length > 2 ? `<div class="seg mt">${depts.map((d) => `<button data-dept="${esc(d)}" aria-selected="${facDept === d}">${esc(d)}</button>`).join("")}</div>` : ""}
      ${loading ? `<div class="grid g2 mt">${[1, 2, 3, 4].map(() => '<div class="skel" style="height:84px"></div>').join("")}</div>` : list.length ? `<div class="grid g2 mt">${list.slice(0, facShow).map((f) => `<a class="lcard" href="#/prof?i=${encodeURIComponent(f.init)}" style="margin:0">${face(f)}<div class="grow min0"><b class="ellipsis" style="display:block">${esc(f.name || f.init)}</b><span class="xs">${[f.designation, showInit(f), f.dept].filter(Boolean).map(esc).join(" · ")}</span>${f.roomCode ? `<span class="xs" style="display:block">${icon("pin", "sm")} Room ${esc(f.roomCode)}</span>` : ""}
          <div class="small" style="margin-top:2px">${f.rating ? `${stars(f.rating)} <span class="muted">(${f.reviews} reviews)</span>` : '<span class="xs">No reviews yet</span>'}</div></div>${mine.has(f.init) ? '<span class="pill purple">Yours</span>' : ""}${icon("chevR", "chev")}</a>`).join("")}</div>
        ${list.length > facShow ? `<button class="btn outline block mt" id="fac-more">Show more (${list.length - facShow} left)</button>` : ""}
        <p class="xs mt">Names, titles, offices and photos come from EWU's public faculty pages; each profile links to the original. Faculty member? <a href="mailto:civicframe01@gmail.com?subject=Faculty%20listing">Ask us to update or remove your listing</a>.</p>`
        : `<div class="card mt">${ctx.empty("icon:users", facQ ? "No Results Found" : "No faculty yet", facQ ? `No faculty match "${esc(facQ)}".` : "Sync your Class Schedule to add your teachers.", facQ ? "" : `<a class="btn primary" href="#/sync">Sync Class Schedule</a>`)}</div>`}`;
  };
  pages.faculty.mount = (el) => {
    const q = $("#fac-q", el); let t;
    q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { facQ = q.value; ctx.rerender(); const n = $("#fac-q"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 220); });
    $$("[data-dept]", el).forEach((b) => b.addEventListener("click", () => { facDept = b.dataset.dept; facShow = 60; ctx.rerender(); }));
    $("#fac-mine", el).addEventListener("click", () => { facMine = !facMine; ctx.rerender(); });
    $("#fac-more", el)?.addEventListener("click", () => { facShow += 60; ctx.rerender(); });
    ctx.loadDirectory();
    if (C.user && !C.faculty) ctx.cloud.fetchFaculty().then((f) => { C.faculty = f; if (ctx.route() === "faculty") ctx.rerender(); }).catch(() => {});
  };
  let rvSort = "all", rvCache = {};
  const TAGS = ["Clear Concepts", "Helpful", "Fair Grading", "Well Organized", "Engaging Classes", "Strict Attendance", "Tough Exams", "Lots of Quizzes"];
  async function loadReviews(init) {
    try { rvCache[init] = C.user ? await ctx.cloud.fetchReviews(init) : (S().localReviews[init] || []).map((r) => ({ ...r, body: r.text, created_at: r.at, mine: true })); }
    catch (e) { rvCache[init] = { error: e.message }; }
    if (ctx.route() === "prof") ctx.rerender();
  }
  pages.prof = () => {
    const init = (ctx.qparam("i") || "").toUpperCase(), f = ctx.facBy(init);
    if (!f && C.directory === null) { ctx.loadDirectory(); return `${ctx.subHead("Faculty", "", "#/faculty")}<div class="skel" style="height:220px"></div>`; }
    if (!f) return `${ctx.subHead("Faculty", "", "#/faculty")}<div class="card">${ctx.empty("mascot-confused", "Faculty not found", "They may not be in the directory yet.", `<a class="btn primary" href="#/faculty">Back to Faculty</a>`)}</div>`;
    const fav = (S().bookmarks.fac || []).includes(init);
    const taught = new Map();
    (C.sections || []).filter((s) => s.faculty === init).forEach((s) => taught.set(s.course, s.title));
    Object.entries(ctx.offered()).forEach(([code, c]) => c.sections.some((s) => s.faculty === init) && taught.set(code, c.title));
    S().routine.filter((r) => r.faculty === init).forEach((r) => taught.set(r.code, r.title));
    const raw = rvCache[init];
    if (raw === undefined) loadReviews(init);
    const list = Array.isArray(raw) ? raw.slice().sort((a, b) => rvSort === "high" ? b.stars - a.stars : rvSort === "low" ? a.stars - b.stars : new Date(b.created_at) - new Date(a.created_at)) : [];
    return `${ctx.subHead(esc(f.name || f.init), "", "#/faculty", `<button class="icon-btn" id="pf-fav" aria-pressed="${fav}" aria-label="${fav ? "Remove from" : "Add to"} favorites">${icon("heart", fav ? "fill" : "")}</button>`)}<div style="max-width:760px;margin:0 auto">
      <section class="card row nowrap top" style="gap:16px">${face(f, "xl")}<div class="grow min0"><h2 style="font-size:22px">${esc(f.name || f.init)}</h2><p class="muted">${esc([f.designation, f.deptName ? `Dept. of ${f.deptName}` : f.dept && `Department of ${f.dept}`, showInit(f)].filter(Boolean).join(" · "))}</p>
        <p class="mt-s">${f.rating ? `${stars(f.rating)} <span class="muted">(${f.reviews} reviews)</span>` : '<span class="xs">No ratings yet</span>'}</p>
        <div class="row mt-s">${f.email ? `<a class="btn sm" href="mailto:${esc(f.email)}">${icon("mail")} Email</a><button class="btn sm neutral" id="pf-copy">${icon("copy")} Copy email</button>` : ""}</div></div></section>
      ${f.room || f.hours || f.email ? `<section class="card mt"><h3>Contact</h3>${[["mail", f.email], ["room", f.room && `${f.room}${f.roomCode && ctx.campus.placeText(f.roomCode) ? ` · ${ctx.campus.placeText(f.roomCode)}` : ""}`], ["phone", f.ext && `Ext. ${f.ext} (EWU switchboard 09666775577)`], ["clock", f.hours]].filter(([, v]) => v).map(([ic, v]) => `<div class="lrow" style="min-height:44px"><span class="itile sm purple">${icon(ic)}</span><span class="body"><b style="font-weight:500">${esc(v)}</b></span>${ic === "room" && f.roomCode ? `<a class="btn sm outline" href="#/map?to=${encodeURIComponent(f.roomCode)}">${icon("map", "sm")} Directions</a>` : ""}</div>`).join("")}</section>` : ""}
      ${f.degree || f.bio ? `<section class="card mt"><h3>About</h3>${f.degree ? `<p class="small mt-s"><b>${icon("cap", "sm")} ${esc(f.degree)}</b></p>` : ""}${f.bio ? `<p class="small muted mt-s">${esc(f.bio)}</p>` : ""}${f.url ? `<a class="btn sm ghost mt-s" href="${esc(f.url)}" target="_blank" rel="noopener">${icon("external", "sm")} Full profile on ewubd.edu</a>` : ""}</section>` : ""}
      ${taught.size ? `<div class="section-h"><h2>Courses Taught</h2></div><section class="card tight">${[...taught].map(([code, title]) => `<div class="lrow"><span style="width:4px;height:30px;border-radius:3px;background:${ctx.colorFor(code)}"></span><span class="itile sm ${ctx.toneFor(code)}">${icon("calendar")}</span><span class="body"><b>${esc(code)}</b><span>${esc(title || "")}</span></span></div>`).join("")}</section>` : ""}
      ${ctx.materials.teacherSection(init)}
      <div class="section-h"><h2>Student Reviews</h2></div>${ctx.seg([["all", "All"], ["latest", "Latest"], ["high", "Highest Rated"], ["low", "Lowest Rated"]], rvSort, "data-rs")}
      <div class="mt">${raw === undefined ? '<div class="skel" style="height:90px"></div>' : raw?.error ? `<div class="alert red"><span class="a-ic">${icon("wifioff")}</span><div class="grow"><b>Couldn't load reviews</b><p>${esc(raw.error)}</p></div><button class="btn sm" id="rv-retry">Try Again</button></div>` :
        list.length ? list.map((r) => `<div class="card tight" style="margin-bottom:10px"><div class="row between"><span class="row" style="gap:8px"><span class="avatar sm" style="background:var(--surface-3);color:var(--text-2)">${icon("user", "sm")}</span><b class="small">Verified EWU student</b></span><span class="small">${stars(r.stars)} <span class="xs">${new Date(r.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</span></span></div>
          ${r.course ? `<p class="xs mt-s">${esc(r.course)}</p>` : ""}${r.body ? `<p class="small mt-s">${esc(r.body)}</p>` : ""}${r.tags?.length ? `<div class="row mt-s" style="gap:6px">${r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
          ${C.user && !r.mine && r.id ? `<button class="btn sm ghost mt-s" data-report="${r.id}">${icon("flag")} Report</button>` : ""}</div>`).join("")
        : ctx.empty("icon:star", "No reviews yet", "Be the first to share how their classes are.")}</div>
      <button class="btn primary lg block mt sticky-bottom" id="rv-rate" ${ctx.content.feature("reviews") ? "" : "hidden"}>${icon("star")} Rate ${esc((f.name || f.init).split(" ").slice(0, 2).join(" "))}</button></div>`;
  };
  pages.prof.mount = (el) => {
    const init = (ctx.qparam("i") || "").toUpperCase(), f = ctx.facBy(init); if (!f) return;
    $$("[data-rs]", el).forEach((b) => b.addEventListener("click", () => { rvSort = b.dataset.rs; ctx.rerender(); }));
    ctx.materials.mountTeacher(el, init);
    const on = (s, fn) => { const b = $(s, el); b && b.addEventListener("click", fn); };
    on("#pf-fav", () => { const B = S().bookmarks; B.fac = B.fac || []; B.fac = B.fac.includes(init) ? B.fac.filter((x) => x !== init) : [...B.fac, init]; ctx.save({ silent: true }); ctx.rerender(); });
    on("#pf-copy", async () => { try { await navigator.clipboard.writeText(f.email); toast("Email copied"); } catch { toast(f.email, "info"); } });
    on("#rv-retry", () => { delete rvCache[init]; ctx.rerender(); });
    $$("[data-report]", el).forEach((b) => b.addEventListener("click", () => confirmModal("Report this review?", "Personal attacks, private info and harassment are removed. 3 reports hide a review automatically.", "Report", () => ctx.cloud.report(C.user.id, "review", b.dataset.report).then(() => toast("Reported. Thanks.", "info")), true, "flag")));
    on("#rv-rate", () => {
      if (ctx.cloud.enabled && !C.user) return confirmModal("Sign in to review", "Only verified EWU students can post reviews. Sign in with your EWU email.", "Sign in", () => ctx.go("#/login?from=profile"), false, "lock");
      openModal(modalHead(`Rate ${f.name || f.init}`) + `<form id="rv-form" class="stack">
        <fieldset class="bare"><legend class="small strong">Rating</legend><div class="row" style="gap:6px">${[1, 2, 3, 4, 5].map((n) => `<label class="chip" style="font-size:20px;color:var(--yellow)"><input type="radio" name="stars" value="${n}" ${n === 5 ? "checked" : ""} class="sr-only">${"★".repeat(n)}</label>`).join("")}</div></fieldset>
        <fieldset class="bare"><legend class="small strong">Tags</legend><div class="row" style="gap:6px">${TAGS.map((t) => `<label class="chip"><input type="checkbox" name="tags" value="${t}" class="sr-only">${t}</label>`).join("")}</div></fieldset>
        <label class="field">Course taken<input class="input" name="course" placeholder="e.g. CSE211" value="${esc(S().routine.find((r) => r.faculty === init)?.code || "")}"></label>
        <label class="field">Your experience<textarea class="input" name="text" maxlength="500" placeholder="Be specific and respectful. Your name is never shown."></textarea></label>
        <p class="xs">Reviews are anonymous. Personal attacks, private info and harassment are removed; 3 reports hide a review automatically.</p>
        <button class="btn primary block">Post Review</button></form>`, (m) => {
        $$("label.chip", m).forEach((l) => { const i = l.querySelector("input"); const sync = () => { if (i.type === "radio") $$('input[name="stars"]', m).forEach((r) => r.closest("label").setAttribute("aria-pressed", r.checked)); else l.setAttribute("aria-pressed", i.checked); }; i.addEventListener("change", sync); sync(); });
        $("#rv-form", m).addEventListener("submit", async (e) => {
          e.preventDefault(); const fd = new FormData(e.target), btn = e.target.querySelector("button.primary");
          const r = { init, stars: Number(fd.get("stars")), tags: fd.getAll("tags"), course: String(fd.get("course") || "").toUpperCase(), text: String(fd.get("text") || "").trim(), at: Date.now() };
          busy(btn, true, "Posting…");
          try {
            if (C.user) { await ctx.cloud.contribute({ semester: S().routineSem || ctx.currentSemester(), faculty: [{ init, name: f.name || "", email: f.email || "" }] }); await ctx.cloud.postReview(C.user.id, { ...r, name: f.name || "", email: f.email || "" }); C.faculty = null; }
            else { (S().localReviews[init] = S().localReviews[init] || []).push(r); ctx.save(); }
            delete rvCache[init]; closeModal(); toast("Thanks — review posted"); ctx.rerender();
          } catch (err) { busy(btn, false); toast(err.message, "error"); }
        });
      });
    });
  };

  /* ═════════════ COVER PAGE ═════════════
     Five designs (classic, modern, minimal, lab report, group project) with an accent colour; fill once, the details are
     remembered (not the date). Picking a course fills its title, section and teacher from the routine or past classes. */
  const COVER_KINDS = ["Assignment", "Lab Report", "Project Report", "Case Study", "Term Paper", "Presentation", "Thesis Proposal"];
  const COVER_STYLES = [["classic", "Classic"], ["modern", "Modern"], ["minimal", "Minimal"], ["lab", "Lab report"], ["group", "Group project"]];
  const ACCENTS = [["#1e3a8a", "Navy"], ["#7f1d1d", "Maroon"], ["#0f766e", "Teal"], ["#5b21b6", "Purple"], ["#111827", "Black"]];
  let coverStyle = "";
  pages.cover = () => {
    const p = S().profile || {}, r0 = S().routine.find((r) => !r.lab) || {}, f0 = ctx.facBy(r0.faculty);
    const c = Object.assign({ kind: "Assignment", no: "1", course: r0.code || "", ctitle: r0.title || "", topic: "", sec: r0.sec || "", faculty: f0?.name || "", ftitle: "", fdept: "Department of " + (p.department || "CSE"), name: p.name || "", id: p.id || "", program: p.program || "", semester: S().routineSem || "", performed: "", members: "", accent: ACCENTS[0][0] }, S().cover, { date: localToday() });
    coverStyle = coverStyle || S().cover?.style || "classic";
    const lab = coverStyle === "lab", group = coverStyle === "group";
    const F = [["kind", "Document type", `select:${COVER_KINDS.join(",")}`], ["no", lab ? "Experiment no." : "Number"], ["course", "Course code"], ["ctitle", "Course title"], ["sec", "Section"], ["semester", "Semester"],
      ["topic", lab ? "Experiment name" : "Topic / title", "", "full"], ["faculty", "Submitted to"], ["ftitle", "Designation (e.g. Lecturer)"], ["fdept", "Faculty department", "", "full"],
      ...(group ? [["members", "Group members (one per line: Name, ID)", "area", "full"]] : [["name", "Your name"], ["id", "Student ID"]]),
      ...(lab ? [["performed", "Date of performance", "date"]] : []), ["date", "Submission date", "date"]];
    const field = ([k, l, t, w]) => t && t.startsWith("select:") ? `<label class="field">${l}<select class="select" name="${k}">${t.slice(7).split(",").map((o) => `<option ${o === c[k] ? "selected" : ""}>${o}</option>`).join("")}</select></label>`
      : t === "area" ? `<label class="field full-row">${l}<textarea class="input" name="${k}" rows="4" placeholder="${esc(p.name || "Your name")}, ${esc(p.id || "2024-1-60-000")}">${esc(c[k] || (p.name ? `${p.name}, ${p.id || ""}` : ""))}</textarea></label>`
      : `<label class="field${w ? " full-row" : ""}">${l}<input class="input" name="${k}" type="${t || "text"}" value="${esc(c[k])}" ${k === "faculty" ? 'list="fac-list"' : k === "course" ? 'list="cv-courses"' : ""}></label>`;
    const courses = [...new Set([...S().routine.map((r) => r.code), ...Object.values(S().history || {}).flat().map((r) => r.code)])];
    return `${ctx.head("Cover Page", "Pick a design, fill once (we remember your details), then save as PDF or print.", `<button class="btn primary" id="cv-print">${icon("download")} Save as PDF</button>`)}
      <div class="cv-styles" role="radiogroup" aria-label="Design">${COVER_STYLES.map(([v, l]) => `<button class="cv-style${v === coverStyle ? " on" : ""}" data-cvs="${v}" role="radio" aria-checked="${v === coverStyle}"><span class="cv-thumb ${v}" style="--acc:${c.accent}"><i></i><i></i><i></i></span><b>${l}</b></button>`).join("")}</div>
      <div class="grid g2 mt"><form class="card grid g2" id="cv-form">
        <div class="field full-row"><span>Accent colour</span><div class="cv-accents">${ACCENTS.map(([hex, n]) => `<label class="cv-acc" title="${n}"><input type="radio" name="accent" value="${hex}" ${hex === c.accent ? "checked" : ""}><i style="--acc:${hex}"></i><span class="sr-only">${n}</span></label>`).join("")}</div></div>
        ${F.map(field).join("")}
        <datalist id="fac-list">${[...ctx.facultyIndex().values()].filter((f) => f.name).map((f) => `<option value="${esc(f.name)}">`).join("")}</datalist><datalist id="cv-courses">${courses.map((x) => `<option value="${esc(x)}">`).join("")}</datalist></form>
      <div><div id="print-area" class="cover-preview cv-${coverStyle}" style="--acc:${c.accent}" aria-label="Cover page preview">${coverHTML(c)}</div><p class="xs mt-s" style="text-align:center">A4 · prints without the app around it. In the print dialog choose "Save as PDF".</p></div></div>`;
  };
  const localToday = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  function coverHTML(c) {
    const day = (v) => (v ? new Date(v + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");
    const title = `${esc(c.kind)}${c.no ? ` ${coverStyle === "lab" ? "· Experiment" : "No."} ${esc(c.no)}` : ""}`;
    const course = `${esc(c.course)}${c.ctitle ? ` · ${esc(c.ctitle)}` : ""}`;
    const members = String(c.members || "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [n, ...rest] = l.split(","); return [n.trim(), rest.join(",").trim()]; });
    const to = `<b>${esc(c.faculty || "—")}</b>${c.ftitle ? `<span>${esc(c.ftitle)}</span>` : ""}<span>${esc(c.fdept)}</span><span>East West University</span>`;
    const by = coverStyle === "group" ? `<span>${members.length} member${members.length === 1 ? "" : "s"} (below)</span><span>Section ${esc(c.sec)}</span>` : `<b>${esc(c.name || "—")}</b><span>ID: ${esc(c.id)}</span><span>Section ${esc(c.sec)}</span>${c.program ? `<span>${esc(c.program)}</span>` : ""}`;
    const meta = [c.semester && ["Semester", esc(c.semester)], coverStyle === "lab" && c.performed && ["Performed on", day(c.performed)], ["Submitted on", day(c.date)]].filter(Boolean);
    const membersTable = coverStyle === "group" && members.length ? `<table class="cv-members"><thead><tr><th>#</th><th>Name</th><th>Student ID</th></tr></thead><tbody>${members.map(([n, id], i) => `<tr><td>${i + 1}</td><td>${esc(n)}</td><td>${esc(id)}</td></tr>`).join("")}</tbody></table>` : "";
    const marks = coverStyle === "lab" ? `<div class="cv-marks"><div><span>Marks</span><b></b></div><div><span>Teacher's signature</span><b></b></div><div><span>Remarks</span><b></b></div></div>` : "";
    return `<div class="cv-top"><div class="cv-uni">East West University</div><div class="cv-dept">${esc(c.fdept)}</div></div>
      <div class="cv-mid"><div class="cv-kind">${title}</div>${c.topic ? `<div class="cv-topic">${esc(c.topic)}</div>` : ""}<div class="cv-course">${course}</div></div>
      ${membersTable}
      <div class="cv-bottom"><div class="cv-blocks"><div class="cv-block"><span class="cv-h">Submitted to</span>${to}</div><div class="cv-block"><span class="cv-h">Submitted by</span>${by}</div></div>
        <div class="cv-meta">${meta.map(([k, v]) => `<span><b>${k}:</b> ${v}</span>`).join("")}</div>${marks}</div>`;
  }
  pages.cover.mount = (el) => {
    const form = $("#cv-form", el);
    // The date isn't remembered: a new cover defaults to today.
    const upd = () => { const v = Object.fromEntries(new FormData(form)); S().cover = { ...S().cover, ...Object.fromEntries(Object.entries(v).filter(([k]) => k !== "date")), style: coverStyle }; ctx.save({ silent: true }); const a = $("#print-area", el); a.style.setProperty("--acc", v.accent); a.innerHTML = coverHTML({ ...S().cover, ...v }); };
    form.addEventListener("input", upd);
    form.elements.course.addEventListener("change", () => {
      const code = form.elements.course.value.toUpperCase().replace(/\s/g, ""), now = S().routine.find((x) => x.code === code && !x.lab) || S().routine.find((x) => x.code === code);
      const r = now || Object.values(S().history || {}).flat().find((x) => x.code === code), t = (S().grades.find((g) => g.code === code) || {}).title;
      form.elements.course.value = code;
      if (r || t) { form.elements.ctitle.value = r?.title || t || form.elements.ctitle.value; if (r) { form.elements.sec.value = r.sec || ""; const f = ctx.facBy(r.faculty); if (f?.name) form.elements.faculty.value = f.name; } }
      upd();
    });
    $$("[data-cvs]", el).forEach((b) => b.addEventListener("click", () => { coverStyle = b.dataset.cvs; S().cover = { ...S().cover, style: coverStyle }; ctx.save({ silent: true }); ctx.rerender(); }));
    $("#cv-print", el).addEventListener("click", () => window.print());
  };
}
