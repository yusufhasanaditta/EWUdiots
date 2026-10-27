/* "Ask EWUdiots": a free assistant that runs entirely on the device, no AI service or key. It understands common
   questions (next class, a day's routine, where a room is, who a teacher is, CGPA, deadlines, fees, attendance,
   free rooms, notices, news, alumni, alarms, how-tos, "open …") and answers from your own data and the app's
   public data. Anything else falls back to a search across everything. Answers adapt to the role (student,
   faculty, alumni). */
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_RE = /\b(today|tonight|tomorrow|yesterday|sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:rs|rsday)?|fri(?:day)?|sat(?:urday)?)\b/;
const COURSE_RE = /\b([a-z]{2,4})\s?-?(\d{3,4}[a-z]?)\b/i;
const ROOM_RE = /\b((?:fub|ab\d?|lab|room)?\s*-?\s*\d{3,4}[a-z]?|[a-z]{2,3}\d?-\d{2,4}[a-z]?)\b/i;
const STOP = new Set("a an the is are was were be to of in on at for from with by me my i you your we our it its this that what whats which who whom where when how can could do does did please tell show find give about any some there here have has".split(" "));
export const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^\w\s@.-]/g, " ").replace(/\s+/g, " ").trim();
export const words = (s) => norm(s).split(" ").filter((w) => w.length > 1 && !STOP.has(w));
/* Token-overlap score with prefix matching (so "hos" finds "Hosney"). */
export function score(q, text) {
  const qs = words(q), ts = words(text); if (!qs.length || !ts.length) return 0;
  let s = 0; for (const w of qs) if (ts.some((t) => t === w)) s += 2; else if (w.length >= 3 && ts.some((t) => t.startsWith(w) || w.startsWith(t) && t.length >= 4)) s += 1;
  return s / (qs.length * 2);
}
const pick = (list, q, key, min = 0.34, n = 5) => list.map((x) => [score(q, key(x)), x]).filter(([s]) => s >= min).sort((a, b) => b[0] - a[0]).slice(0, n).map(([, x]) => x);
function dayOf(q) {
  const m = q.match(DAY_RE); if (!m) return null;
  const now = new Date().getDay(), w = m[1];
  if (w === "today" || w === "tonight") return { day: now, label: "today" };
  if (w === "tomorrow") return { day: (now + 1) % 7, label: "tomorrow" };
  if (w === "yesterday") return { day: (now + 6) % 7, label: "yesterday" };
  const d = DAYS.findIndex((x) => x.startsWith(w.slice(0, 3)));
  return { day: d, label: DAYS[d][0].toUpperCase() + DAYS[d].slice(1) };
}

export function createAssistant(ctx) {
  const S = () => ctx.S, esc = ctx.esc;
  const role = () => S().role || "student";
  const card = (icon, title, sub = "", href = "", tone = "purple") => ({ icon, title, sub, href, tone });
  const A = (text, cards = [], actions = []) => ({ text, cards, actions });
  const classLine = (b) => `${ctx.fmt12(b.s)}–${ctx.fmt12(b.e)} · ${b.room ? ctx.baseRoom(b.room) : "room TBA"}`;

  const suggestions = () => ({
    student: ["What's my next class?", "Tomorrow's classes", "Where is FUB-603?", "My CGPA", "Deadlines this week", "Remind me 30 min before class", "Free rooms now", "Latest notices"],
    faculty: ["Free rooms now", "Where is room 636?", "Find a faculty member", "Latest notices", "Campus news", "How do I share notes?"],
    alumni: ["Alumni working abroad", "Alumni at Google", "Campus news", "Latest notices", "Where is the library?", "How do I add my alumni profile?"]
  }[role()] || []);

  const H = []; // intent handlers: [test(q), handler(q)] — first match wins
  const on = (test, fn) => H.push([test, fn]);

  on((q) => /^(hi|hello|hey|assalamu|salam|good (morning|evening|afternoon))\b|what can you do|help me$|^help$/.test(q), () =>
    A(`Hi${S().profile?.name ? " " + esc(ctx.firstName()) : ""}! I can answer questions about your classes, rooms, teachers, grades, deadlines, fees, notices, news and alumni, set class alarms, and open any page. Try one of these:`));

  // Alarms: "remind me 30 minutes before class", "alarm 1 hour before CSE207"
  on((q) => /(remind|alarm|warn|notify|wake)/.test(q) && /(\d+(\.\d+)?)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours)\b/.test(q), (q) => {
    const m = q.match(/(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours)\b/), mins = Math.round(Number(m[1]) * (/^h/.test(m[2]) ? 60 : 1));
    if (!(mins >= 1 && mins <= 720)) return A("Pick a time between 1 minute and 12 hours before class.");
    const c = q.match(COURSE_RE), code = c ? (c[1] + c[2]).toUpperCase() : "", a = S().settings.alarms;
    const has = code && S().routine.some((r) => r.code === code);
    return A(`Set an alarm <b>${ctx.fmtBefore(mins)}</b> before ${has ? `every <b>${esc(code)}</b> class` : "every class"}?`, [], [{ label: `Yes, set it`, run: () => {
      a.on = true;
      if (has) a.perCourse[code] = [...new Set([...(a.perCourse[code] || a.offsets), mins])].slice(-4);
      else a.offsets = [...new Set([...a.offsets, mins])].slice(-4);
      ctx.save(); ctx.scheduleReminders(); if (!S().settings.notify) ctx.enableNotifications();
      return A(`Done. You'll be warned ${ctx.fmtBefore(mins)} before ${has ? esc(code) : "each class"}.`, [card("bell", "Class alarms", "Change or remove alarms", "#/alarms", "pink")]);
    } }, { label: "Open alarm settings", href: "#/alarms" }]);
  });
  on((q) => /(alarm|reminder)s?\b/.test(q), () => {
    const a = S().settings.alarms, next = ctx.upcomingAlarms(3);
    return A(a.on ? `Your class alarms ring <b>${a.offsets.map(ctx.fmtBefore).join(" and ")}</b> before each class.` : "Class alarms are off.", next.map((x) => card("clock", `${x.at.toLocaleDateString("en-GB", { weekday: "short" })} ${x.at.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })}`, `${x.code} · ${ctx.fmtBefore(x.off)} before`, "#/alarms", "pink")),
      [{ label: "Change alarms", href: "#/alarms" }]);
  });

  // Next class / a day's routine
  on((q) => /next class|class (now|next)|what.*(class|lecture).*(now|next)|am i late|my next/.test(q), () => {
    const nc = ctx.nextClass(); if (!nc) return noRoutine();
    const when = nc.live ? `happening now, ${nc.mins} min left` : nc.mins < 1440 ? `in ${ctx.fmtCountdown(nc.mins)}` : `on ${ctx.DAY_NAMES[nc.day]}`;
    return A(`Your next class is <b>${esc(nc.code)}</b>${nc.title ? ` (${esc(nc.title)})` : ""}, ${when}.`, [card("calendar", nc.code, classLine(nc), `#/course?c=${encodeURIComponent(nc.code)}`)],
      nc.room ? [{ label: `Directions to ${ctx.baseRoom(nc.room)}`, href: `#/map?to=${encodeURIComponent(ctx.baseRoom(nc.room))}` }] : []);
  });
  on((q) => dayOf(q) && /(class|routine|schedule|lecture|lab|have)/.test(q), (q) => {
    const d = dayOf(q); if (!S().routine.length) return noRoutine();
    const list = ctx.expand(S().routine).filter((b) => b.day === d.day).sort((a, b) => a.s - b.s);
    if (!list.length) return A(`No classes ${d.label === "today" || d.label === "tomorrow" || d.label === "yesterday" ? d.label : "on " + d.label}. 🎉`, [], [{ label: "Start a focus session", run: () => { ctx.study.focusOn(); return A("Focus timer started. Good luck!"); } }]);
    return A(`${list.length} class${list.length > 1 ? "es" : ""} ${["today", "tomorrow", "yesterday"].includes(d.label) ? d.label : "on " + d.label}:`, list.map((b) => card("calendar", `${b.code}${b.lab ? " Lab" : ""}`, classLine(b), `#/course?c=${encodeURIComponent(b.code)}`, ctx.toneFor(b.code))));
  });

  // Free rooms right now
  on((q) => /(free|empty|vacant|available)\s+(class)?rooms?|room.*(free|empty)/.test(q), () => {
    const now = new Date(), m = now.getHours() * 60 + now.getMinutes(), free = ctx.freeRoomsAt(now.getDay(), m, m + 60);
    return free.length ? A(`${free.length} rooms look free for the next hour (from synced timetables):`, free.slice(0, 6).map((r) => card("door", r, ctx.campus.placeText(r) || "No class scheduled", `#/map?to=${encodeURIComponent(r)}`, "green")), [{ label: "See all free rooms", href: "#/rooms" }])
      : A("I don't have enough timetable data to know which rooms are free right now.", [], [{ label: "Open Free Rooms", href: "#/rooms" }]);
  });

  // Where is a room / place
  on((q) => /(where|direction|how (do i|to) (get|go)|find|locate|which floor|room)/.test(q) && (ROOM_RE.test(q) || ctx.campus.placesFor().some((p) => score(q, p.name) >= 0.5)), (q) => {
    const place = pick(ctx.campus.placesFor(), q, (p) => p.name, 0.5, 1)[0];
    const rm = q.match(ROOM_RE), where = rm ? ctx.campus.where(rm[1].replace(/^room\s*/i, "")) : null;
    if (where?.block) return A(`Room <b>${esc(where.code)}</b> is in ${esc(ctx.campus.placeText(where.code))}.`, [card("map", `Directions to ${where.code}`, "Step by step on the campus map", `#/map?to=${encodeURIComponent(where.code)}`)]);
    if (place) return A(`<b>${esc(place.name)}</b>: ${esc(place.hint)}.`, [], [{ label: "Show on the map", run: () => { ctx.campus.goTo(place.go); return null; } }]);
    return A("I couldn't place that room. Try the number as written on the door, like FUB-603 or 636.", [], [{ label: "Open Campus Map", href: "#/map" }]);
  });

  // CGPA / a course grade
  on((q) => /(cgpa|gpa|result|grade|marks)/.test(q), (q) => {
    const c = q.match(COURSE_RE), code = c ? (c[1] + c[2]).toUpperCase() : "";
    if (code) { const g = S().grades.filter((x) => x.code === code).sort((a, b) => ctx.semesterKey(b.sem) - ctx.semesterKey(a.sem))[0]; return g ? A(`${esc(code)}: <b>${esc(g.g)}</b>${g.sem ? ` (${esc(g.sem)})` : ""}, ${esc(g.cr)} credits.`, [], [{ label: "What-if calculator", href: "#/whatif" }]) : A(`No grade for ${esc(code)} yet.`, [], [{ label: "Open marks estimator", href: `#/marks` }]); }
    const { cgpa, credits, earned } = ctx.cgpaOf(S().grades), shown = cgpa || S().profile?.cgpa;
    if (!shown) return A("I don't have your grades yet. Sync your Grade Report and I'll work it out.", [], [{ label: "Sync portal", href: "#/sync" }]);
    return A(`Your CGPA is <b>${Number(shown).toFixed(2)}</b>${credits ? ` over ${credits} graded credits (${earned} earned)` : ""}.`, [card("bars", "CGPA dashboard", "Trend, semesters and targets", "#/grades", "blue")], [{ label: "What do I need for a higher CGPA?", href: "#/whatif" }]);
  });

  // Deadlines
  on((q) => /(deadline|due|assignment|quiz|presentation|submit|homework|exam)/.test(q), (q) => {
    const list = S().tasks.filter((t) => !t.done && new Date(t.due) > Date.now() - 864e5).sort((a, b) => new Date(a.due) - new Date(b.due));
    const week = /week/.test(q) ? list.filter((t) => new Date(t.due) - Date.now() < 7 * 864e5) : list;
    if (!week.length) return A("Nothing due. Nice!", [], [{ label: "Add a deadline", href: "#/tasks?add=1" }]);
    return A(`${week.length} thing${week.length > 1 ? "s" : ""} coming up:`, week.slice(0, 6).map((t) => card(ctx.TASK_IC[t.type]?.[0] || "clipboard", `${t.course ? t.course + " · " : ""}${t.title}`, new Date(t.due).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }), "#/tasks", ctx.TASK_IC[t.type]?.[1] || "orange")));
  });

  // Fees
  on((q) => /(fee|tuition|payment|pay|installment|waiver)/.test(q), () => {
    const p = ctx.nextPayment();
    if (!p) return A((S().payments.schedule || []).length ? "Your fees for this semester are settled. 👍" : "I don't have your fee schedule. Sync your Advising/Deposit slip.", [], [{ label: "Open Fees", href: "#/fees" }]);
    return A(`Next payment: <b>${ctx.fmtMoney(p.amount)}</b> by <b>${ctx.fmtDate(p.due)}</b> (${ctx.daysUntil(p.due)} days)${p.late ? ", with late fee" : ""}.`, [card("wallet", "Fees & payments", "Mark as paid, see all steps", "#/fees", "orange")]);
  });

  // Attendance
  on((q) => /(attendance|absent|present|miss(ed)? class)/.test(q), () => {
    const att = Object.entries(S().attendance).filter(([, a]) => a.held).map(([c, a]) => ({ c, pct: Math.round((100 * (a.held - a.missed)) / a.held), a }));
    if (!att.length) return A("You haven't tracked attendance yet. Open a course to mark classes.", [], [{ label: "My courses", href: "#/courses" }]);
    return A("Your attendance:", att.sort((x, y) => x.pct - y.pct).map(({ c, pct, a }) => card(pct < 70 ? "alert" : "checkc", `${c}: ${pct}%`, `${a.held - a.missed}/${a.held} classes${pct < 70 ? " · below 70%" : ""}`, `#/course?c=${encodeURIComponent(c)}&tab=attendance`, pct < 70 ? "red" : "green")));
  });

  // Faculty
  const faculty = () => [...ctx.facultyIndex().values()];
  on((q) => /(faculty|teacher|sir|madam|mam|professor|lecturer|chair|dean|advisor|email of|office of|contact|who (is|teaches))/.test(q) || pick(faculty(), q, (f) => `${f.name} ${f.init}`, 0.6, 1).length, (q) => {
    ctx.loadDirectory();
    const c = q.match(COURSE_RE), code = c ? (c[1] + c[2]).toUpperCase() : "";
    if (code && /teach|who/.test(q)) { const r = S().routine.find((x) => x.code === code); if (r?.faculty) { const f = ctx.facBy(r.faculty); return A(`${esc(code)} is taught by <b>${esc(f?.name || r.faculty)}</b>.`, f ? [facCard(f)] : []); } }
    const qq = q.replace(/\b(faculty|teacher|sir|madam|mam|professor|lecturer|email|office|room|contact|of|who|is|find|dr)\b/g, " ");
    const hits = pick(faculty(), qq, (f) => `${f.name} ${f.init.replace("@", "")} ${f.deptName || f.dept || ""} ${f.designation || ""}`, 0.3, 5);
    if (!hits.length) return A(ctx.C.directory ? "I couldn't find that teacher. Try their full name or initials." : "Loading the faculty directory… ask me again in a second.", [], [{ label: "Browse faculty", href: "#/faculty" }]);
    return A(hits.length === 1 ? `Here's <b>${esc(hits[0].name || hits[0].init)}</b>:` : "Faculty I found:", hits.map(facCard));
  });
  const facCard = (f) => card("user", f.name || f.init, [f.designation, f.deptName || f.dept, f.email, f.room].filter(Boolean).join(" · "), `#/prof?i=${encodeURIComponent(f.init)}`, "blue");

  // Notices / news / alumni
  on((q) => /(notice|holiday|closed|closure|admission|convocation|exam schedule|announcement|circular|registrar)/.test(q), (q) => {
    const list = ctx.notices.list(), team = ctx.content.posts("announcement").map((p) => ({ title: p.title, date: p.starts_at?.slice(0, 10), team: true }));
    const qq = q.replace(/\b(notice|notices|latest|new|any|announcement|announcements)\b/g, " ");
    const hits = words(qq).length ? pick(team.concat(list), qq, (n) => `${n.title} ${n.category || ""}`, 0.3, 5) : team.concat(list).slice(0, 5);
    if (!list.length) ctx.notices.refresh();
    return hits.length ? A(words(qq).length ? "Notices that match:" : "Latest notices:", hits.map((n) => card(n.team ? "megaphone" : "file", n.title, [n.team ? "EWUdiots team" : n.category, n.date && ctx.fmtDate(n.date)].filter(Boolean).join(" · "), n.url || "#/notices", "orange")), [{ label: "Notice board", href: "#/notices" }])
      : A("No matching notice right now.", [], [{ label: "Open the Notice Board", href: "#/notices" }]);
  });
  on((q) => /\bnews\b|what'?s (new|happening)|events?\b/.test(q), (q) => {
    const list = ctx.community.newsList(), qq = q.replace(/\b(news|latest|campus|ewu|what|happening|new)\b/g, " ");
    if (!list.length) ctx.community.refreshNews();
    const hits = words(qq).length ? pick(list, qq, (n) => `${n.title} ${n.tag}`, 0.3, 4) : list.slice(0, 4);
    return A(hits.length ? "From EWU news:" : "No news loaded yet.", hits.map((n) => card("globe", n.title, [n.tag, n.date && ctx.fmtDate(n.date)].filter(Boolean).join(" · "), n.url, "blue")), [{ label: "Campus News", href: "#/news" }]);
  });
  on((q) => /(alumni|alumnus|graduate|graduates|ex.?student|working at|works at|abroad|placed|career)/.test(q), async (q) => {
    const rows = await ctx.community.alumniRows();
    const abroad = /abroad|outside|foreign/.test(q), qq = q.replace(/\b(alumni|alumnus|graduates?|working|works|at|in|abroad|who|ewu|career|placed)\b/g, " ");
    let hits = abroad ? rows.filter((r) => r.country && !/bangladesh/i.test(r.country)) : rows;
    if (words(qq).length) hits = pick(hits, qq, (r) => `${r.name} ${r.org} ${r.country} ${r.dept} ${r.role} ${r.sector}`, 0.3, 8);
    return hits.length ? A(`${hits.length > 6 ? "Some" : ""} EWU alumni${abroad ? " abroad" : ""}:`.trim(), hits.slice(0, 6).map((r) => card("cap", r.name, [r.role, r.org, r.country].filter(Boolean).join(" · "), "#/alumni", "green")), [{ label: "Alumni section", href: "#/alumni" }])
      : A("No alumni match that yet.", [], [{ label: "Browse alumni", href: "#/alumni" }]);
  });

  // "open planner", "go to fees"
  on((q) => /^(open|go to|goto|show|take me to|launch)\b/.test(q), (q) => {
    const p = pick(ctx.PAGES_SEARCH, q.replace(/^(open|go to|goto|show|take me to|launch)\s+/, ""), (x) => x[1], 0.4, 1)[0];
    return p ? A(`Opening <b>${esc(p[1])}</b>…`, [], [{ label: p[1], href: "#/" + p[0], auto: true }]) : null;
  });

  // How-to questions → FAQ
  on((q) => /^(how|can i|why|is it|what is|what's|does)/.test(q) && pick(ctx.FAQ, q, (f) => f[0] + " " + f[1], 0.34, 1).length, (q) => {
    const f = pick(ctx.FAQ, q, (x) => x[0] + " " + x[1], 0.34, 1)[0];
    return A(`<b>${esc(f[0])}</b><br>${esc(f[1])}`, [], [{ label: "Help & Support", href: "#/help" }]);
  });

  const noRoutine = () => A("I don't know your routine yet. Sync your Class Schedule (screenshot, paste or the Chrome extension) and I'll know every class.", [], [{ label: "Sync portal", href: "#/sync" }]);

  // Fallback: search everything
  async function everything(q) {
    const out = [];
    pick(ctx.PAGES_SEARCH, q, (p) => p[1], 0.34, 3).forEach((p) => out.push(card(p[2], p[1], "Page", "#/" + p[0])));
    [...new Map(S().routine.map((r) => [r.code, r])).values()].filter((r) => score(q, `${r.code} ${r.title}`) >= 0.5).slice(0, 2).forEach((r) => out.push(card("book", r.code, r.title || "Course", `#/course?c=${encodeURIComponent(r.code)}`)));
    pick(faculty(), q, (f) => `${f.name} ${f.deptName || ""}`, 0.5, 2).forEach((f) => out.push(facCard(f)));
    pick(ctx.notices.list(), q, (n) => n.title, 0.4, 2).forEach((n) => out.push(card("file", n.title, "Notice", n.url || "#/notices", "orange")));
    pick(ctx.community.newsList(), q, (n) => n.title, 0.4, 2).forEach((n) => out.push(card("globe", n.title, "News", n.url, "blue")));
    return out.length ? A("Here's what I found:", out.slice(0, 7)) : A("I'm not sure about that one yet. I can help with classes, rooms, teachers, grades, deadlines, fees, notices, news, alumni and alarms.", [], [{ label: "Search the app", run: () => { ctx.palette(); return null; } }]);
  }

  async function answer(raw) {
    const q = norm(raw);
    if (!q) return A("Ask me anything about your uni life.");
    for (const [test, fn] of H) { try { if (test(q)) { const r = await fn(q); if (r) return r; } } catch (e) { console.warn("assistant", e); } }
    return everything(q);
  }
  return { answer, suggestions };
}
