/* Semesters (My Courses → Semesters): a 3D carousel of the student's 12 semesters next to EWU's official course
   flowchart for their program (/api/flowchart), and the "Drop a course" sheet: refund steps from the academic calendar,
   what the drop changes, and recording it in the student's EWUdiots account (with undo). */
import { programKey } from "./flowchart.js";
import { dropTiers, dropWindow, dropImpact } from "./drop.js";
import { latestGrades, nextSem } from "./degreeplan.js";
import { iso } from "./semplan.js";

const FKEY = "ewudiots.flowchart";
const PASS = (g) => g && !["F", "W", "I", "U", "R"].includes(g);

export function install(ctx) {
  const { icon, esc, uid, $, $$, toast, openModal, closeModal, modalHead } = ctx;
  const S = () => ctx.S;
  const fmt = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const semName = (s) => String(s || "").replace("-", " ");
  const money = (n) => "Tk " + Math.round(n).toLocaleString("en-IN");

  /* ── Official flowchart, kept on the device for a week ─────────────────── */
  let fc = null, fcLoading = "";
  try { fc = JSON.parse(localStorage.getItem(FKEY) || "null"); } catch { fc = null; }
  function flowchart() {
    const St = S(), key = programKey(`${St.profile?.program || ""} ${St.profile?.department || ""}`);
    if (!key) return { none: true };
    if (fc?.key === key && Date.now() - fc.at < 7 * 864e5) return fc.data;
    if (fcLoading !== key) {
      fcLoading = key;
      fetch(`${ctx.native.isNative ? ctx.SITE : ""}/api/flowchart?p=${encodeURIComponent(key)}`).then((r) => r.json()).then((j) => {
        if (!j.semesters?.length && !j.image) return;
        fc = { key, at: Date.now(), data: j };
        try { localStorage.setItem(FKEY, JSON.stringify(fc)); } catch { /* storage full */ }
        if (ctx.route() === "courses") ctx.rerender();
      }).catch(() => {}).finally(() => { fcLoading = ""; });
    }
    return fc?.key === key ? fc.data : { loading: true };
  }

  /* ── Semester view ─────────────────────────────────────────────────────── */
  let sel = null; // index of the centred semester (kept across re-renders)
  let view = null; // the last data rendered: { sems, off, status }

  /* Where an official course stands for this student: done (grade), now, planned (semester), behind or later. */
  function statusOf(code, sems, curIdx, n) {
    if (!code) return { k: "slot", l: "Choose one" };
    const g = latestGrades(S().grades)[code];
    if (g && PASS(g.g)) return { k: "done", l: g.g, sem: g.sem };
    const now = sems[curIdx]?.courses.some((c) => c.code === code);
    if (now) return { k: "now", l: "This semester" };
    const plan = sems.find((s) => s.state === "next" && s.courses.some((c) => c.code === code));
    if (plan) return { k: "plan", l: `Planned · ${semName(plan.sem)}` };
    return n - 1 < curIdx ? { k: "behind", l: "Not taken yet" } : { k: "later", l: "Later" };
  }

  const STATE = { done: ["Done", "checkc"], now: ["Now", "clock"], next: ["Planned", "calendar"] };
  function card(s, i, off) {
    const list = s.courses.length ? s.courses : (off?.courses || []).filter((c) => c.code);
    const cr = list.reduce((a, c) => a + (Number(c.cr) || 0), 0);
    return `<button type="button" class="sem-card ${s.state}" data-si="${i}" aria-label="Semester ${s.n}, ${esc(semName(s.sem))}">
      <span class="sc-top"><span class="sc-n">Semester ${s.n}</span><span class="sc-st">${icon(STATE[s.state][1], "sm")} ${STATE[s.state][0]}</span></span>
      <b class="sc-sem">${esc(semName(s.sem))}</b><span class="sc-yr">Year ${Math.ceil(s.n / 3)} · Term ${((s.n - 1) % 3) + 1}</span>
      <span class="sc-codes">${list.slice(0, 6).map((c) => `<i style="--cc:${ctx.colorFor(c.code)}">${esc(c.code)}</i>`).join("") || `<em>${s.state === "done" ? "No courses added" : "Nothing planned"}</em>`}</span>
      <span class="sc-foot"><span class="num">${cr ? `${cr} credits` : ""}</span>${s.state === "done" ? `<span class="stamp">${icon("check", "sm")}</span>` : ""}</span>
    </button>`;
  }

  function detail(i) {
    const { sems, data } = view, s = sems[i], curIdx = sems.findIndex((x) => x.state === "now");
    const off = data.semesters?.find((x) => x.n === s.n);
    const act = s.state === "done" ? `<button class="btn sm outline" data-sx="add" data-sem="${esc(s.sem)}">${icon(s.courses.length ? "edit" : "plus", "sm")} ${s.courses.length ? "Edit courses" : "Add courses"}</button>`
      : s.state === "next" ? `<button class="btn sm outline" data-sx="plan" data-sem="${esc(s.sem)}">${icon("edit", "sm")} Edit plan</button>`
      : s.courses.length ? `<button class="btn sm danger-soft" data-sx="drop">${icon("minus", "sm")} Drop a course</button>` : "";
    const ewu = data.none ? `<p class="small muted">Your department doesn't publish a semester-by-semester flowchart on ewubd.edu, so this side uses your own road map.</p>`
      : data.loading ? `<p class="small muted">Loading EWU's flowchart…</p>`
      : data.image ? `<p class="small muted">Your department publishes its flowchart as a picture.</p><button class="btn sm outline mt-s" data-sx="img">${icon("image", "sm")} View EWU's flowchart</button>`
      : off ? off.courses.map((c) => { const st = statusOf(c.code, sems, curIdx, s.n);
        return `<div class="sem-row ${st.k}"><span class="sr-ic" aria-hidden="true">${icon({ done: "checkc", now: "clock", plan: "calendar", behind: "alert", later: "lock", slot: "sparkle" }[st.k], "sm")}</span>
          <span class="grow min0"><b>${esc(c.code || c.title)}</b>${c.code ? ` <span class="xs">${esc(c.title)}</span>` : ""}${c.prereq.length ? `<span class="xs sr-pre">Needs ${c.prereq.map(esc).join(", ")}</span>` : ""}</span>
          <span class="sr-st">${esc(st.l)}</span><span class="xs num">${c.cr} cr</span></div>`; }).join("")
      : `<p class="small muted">EWU's flowchart has 12 semesters; this is semester ${s.n}.</p>`;
    const mine = s.courses.length ? s.courses.map((c) => `<div class="sem-row mine" style="--cc:${ctx.colorFor(c.code)}"><span class="sr-strip" aria-hidden="true"></span>
        <span class="grow min0"><b>${esc(c.code)}</b>${c.title ? ` <span class="xs">${esc(c.title)}</span>` : ""}</span>
        ${c.g ? `<span class="grade-chip g-${esc(c.g.replace("+", "p").replace("-", "m"))}">${esc(c.g)}</span>` : c.cr !== "" ? `<span class="xs num">${esc(String(c.cr))} cr</span>` : ""}
        ${s.state === "now" ? `<button class="btn sm danger-soft icon-only" data-sx="drop" data-code="${esc(c.code)}" aria-label="Drop ${esc(c.code)}">${icon("minus", "sm")}</button>` : ""}</div>`).join("")
      : `<p class="small muted">${s.state === "done" ? "No courses for this semester yet. Sync your Grade Report or add them." : "Nothing planned yet."}</p>`;
    return `<div class="row between wrap sem-dh"><h3>Semester ${s.n} · ${esc(semName(s.sem))}</h3>${act}</div>
      <div class="grid g2 mt-s"><section class="card sem-col"><div class="card-h"><h2>${icon("school", "sm")} EWU's plan</h2>${data.source ? `<a class="see" href="${esc(data.source)}" target="_blank" rel="noopener">ewubd.edu ${icon("external", "sm")}</a>` : ""}</div>${ewu}</section>
        <section class="card sem-col"><div class="card-h"><h2>${icon("user", "sm")} ${s.state === "done" ? "What you took" : s.state === "now" ? "What you're taking" : "Your plan"}</h2></div>${mine}</section></div>`;
  }

  /* sems: [{ n, sem, state: done|now|next, courses: [{ code, title, cr, g }] }] (12 of them, from My Courses). */
  function render(sems) {
    const data = flowchart(), curIdx = Math.max(0, sems.findIndex((x) => x.state === "now"));
    view = { sems, data };
    if (sel === null || sel >= sems.length) sel = curIdx;
    // How the finished semesters compare with EWU's plan for them.
    const due = (data.semesters || []).filter((x) => x.n <= curIdx).flatMap((x) => x.courses.filter((c) => c.code));
    const done = due.filter((c) => statusOf(c.code, sems, curIdx, 1).k === "done").length;
    const behind = due.filter((c) => ["behind"].includes(statusOf(c.code, sems, curIdx, 1).k)).length;
    const credits = sems.filter((x) => x.state === "done").flatMap((x) => x.courses).filter((c) => PASS(c.g)).reduce((a, c) => a + (Number(c.cr) || 0), 0);
    return `<section class="sem-hero mt" data-tilt><span class="fluid" aria-hidden="true"><i></i><i></i><i></i></span>
        <div class="sh-l"><span class="sh-eye">Semester ${curIdx + 1} of 12 · ${esc(semName(sems[curIdx]?.sem))}</span><h2>Your degree, semester by semester</h2>
          <p>${data.semesters?.length ? `Side by side with EWU's official ${esc(data.name || "flowchart")}.` : "Done semesters come from your grades; the rest from your plan."}</p>
          <span class="scribble" aria-hidden="true">Plan smart, study happy!</span></div>
        <div class="sh-stats">${data.semesters?.length && due.length ? `<div><b class="num" data-count="${done}">${done}</b><span>of ${due.length} EWU courses so far</span></div><div><b class="num" data-count="${behind}">${behind}</b><span>${behind === 1 ? "course" : "courses"} to catch up</span></div>` : ""}
          <div><b class="num" data-count="${credits}">${credits}</b><span>credits passed</span></div></div></section>
      <div class="sem-car mt" aria-roledescription="carousel" aria-label="Your 12 semesters">
        <button class="sc-nav prev icon-btn" type="button" data-sx="prev" aria-label="Previous semester">${icon("chevL")}</button>
        <div class="sem-track">${sems.map((s, i) => card(s, i, data.semesters?.find((x) => x.n === s.n))).join("")}</div>
        <button class="sc-nav next icon-btn" type="button" data-sx="next" aria-label="Next semester">${icon("chevR")}</button></div>
      <div class="sem-dots" role="tablist" aria-label="Choose a semester">${sems.map((s, i) => `<button type="button" role="tab" data-sd="${i}" aria-label="Semester ${s.n}" aria-selected="${i === sel}"></button>`).join("")}</div>
      <div id="sem-detail" class="mt" aria-live="polite">${detail(sel)}</div>`;
  }

  function mount(el, { addSemester, editPlan12 }) {
    const track = $(".sem-track", el), box = $("#sem-detail", el);
    if (!track) return;
    const show = (i) => { sel = i; box.innerHTML = detail(i); $$("[data-sd]", el).forEach((d) => d.setAttribute("aria-selected", String(Number(d.dataset.sd) === i))); };
    const go = ctx.motion.coverflow(track, show, sel);
    // The page wrapper is new on every render (el itself stays), so listeners never pile up.
    (el.querySelector("[data-page]") || el).addEventListener("click", (e) => {
      const card = e.target.closest("[data-si]"), dot = e.target.closest("[data-sd]"), b = e.target.closest("[data-sx]");
      if (card) return go(Number(card.dataset.si));
      if (dot) return go(Number(dot.dataset.sd));
      if (!b) return;
      const a = b.dataset.sx;
      if (a === "prev" || a === "next") go(sel + (a === "next" ? 1 : -1));
      else if (a === "add") addSemester(b.dataset.sem);
      else if (a === "plan") editPlan12(b.dataset.sem);
      else if (a === "drop") openDrop(b.dataset.code);
      else if (a === "img" && view.data.image) openModal(modalHead("EWU's course flowchart") + `<img class="fc-img" src="${esc(view.data.image)}" alt="Course flowchart published by the department on ewubd.edu" loading="lazy"><p class="xs mt-s">From <a href="${esc(view.data.source)}" target="_blank" rel="noopener">ewubd.edu</a>. Pinch to zoom.</p>`);
    });
    track.addEventListener("keydown", (e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); go(sel + (e.key === "ArrowRight" ? 1 : -1)); } });
  }

  /* ── Drop a course ─────────────────────────────────────────────────────── */
  /* A course's credits: the synced curriculum, else EWU's flowchart, else the usual 3. */
  const crOf = (code) => Number((S().curriculum || []).find((c) => c.code === code)?.cr ?? (fc?.data?.semesters || []).flatMap((x) => x.courses).find((c) => c.code === code)?.cr) || 3;
  function current() {
    const St = S();
    return [...new Map(St.routine.filter((r) => !r.lab).map((r) => [r.code, { code: r.code, title: r.title || "", cr: crOf(r.code) }])).values()];
  }

  function openDrop(code) {
    const St = S(), sem = St.routineSem || ctx.currentSemester(), courses = current();
    if (!courses.length) return toast("No courses this semester", "info", "Sync your class schedule first.");
    const events = (ctx.acal?.allEvents?.() || []).filter((e) => e.sem === sem);
    const tiers = dropTiers(events), today = iso(Date.now()), w = dropWindow(tiers, today);
    let pick = courses.some((c) => c.code === code) ? code : courses[0].code;
    const g = ctx.cgpaOf(St.grades), total = Number(St.profile?.creditsTotal) || 140;
    const curCr = courses.reduce((a, c) => a + c.cr, 0), perSem = Number(St.settings.perSem) || 15;
    const left = Math.max(0, total - Math.max(g.earned || 0, Number(St.profile?.creditsDone) || 0) - curCr);
    const fees = !St.payments?.semester || St.payments.semester === sem ? St.payments?.fees || {} : {};
    const curriculum = St.curriculum?.length ? St.curriculum : (fc?.data?.semesters || []).flatMap((x) => x.courses).filter((c) => c.code);

    const line = () => tiers.length ? `<ol class="drop-line" aria-label="Refund steps for ${esc(semName(sem))}">${tiers.map((t) => { const on = w.tier === t, past = t.until < today;
        return `<li class="${on ? "on" : past ? "past" : ""}"><b>${t.grade ? "W" : t.refund + "%"}</b><span>${t.grade ? "Withdraw" : "refund"}</span><span class="xs">until ${fmt(t.until)}</span></li>`; }).join("")}</ol>` : "";
    const body = () => {
      const c = courses.find((x) => x.code === pick), i = dropImpact({ code: pick, courses, tier: w.tier, fees, rules: St.rules || {}, curriculum, creditsLeft: left, perSem });
      let grad = St.routineSem || ctx.currentSemester(); for (let k = 0; k < Math.ceil((left + c.cr) / perSem); k++) grad = nextSem(grad);
      const now = w.closed ? `<div class="drop-now closed">${icon("lock")}<div><b>The drop and withdrawal deadlines have passed</b><p class="small">For ${esc(semName(sem))} you'll get the grade you earn. Talk to your advisor if something serious happened.</p></div></div>`
        : !w.tier ? `<div class="drop-now">${icon("info")}<div><b>Refund unknown</b><p class="small">EWU's academic calendar for ${esc(semName(sem))} hasn't loaded yet. Check the refund steps on ewubd.edu.</p></div></div>`
        : w.tier.grade ? `<div class="drop-now w"><span class="dn-big">W</span><div><b>Withdrawal: no refund</b><p class="small">You'll get a W. It doesn't count toward your CGPA. Last day ${fmt(w.tier.until)} · ${w.daysLeft} day${w.daysLeft === 1 ? "" : "s"} left.</p></div></div>`
        : `<div class="drop-now"><span class="dn-big num">${w.tier.refund}%</span><div><b>${i.amount !== null ? `About ${money(i.amount)} back` : `${w.tier.refund}% of ${esc(pick)}'s tuition back`}</b><p class="small">At this rate until ${fmt(w.tier.until)} · ${w.daysLeft === 0 ? "today is the last day" : `${w.daysLeft} day${w.daysLeft === 1 ? "" : "s"} left`}${w.next ? `, then ${w.next.grade ? "W only" : w.next.refund + "%"}` : ""}.</p></div></div>`;
      const fx = [
        ["layers", "", `Credits this semester: <b>${i.credits.before} → ${i.credits.after}</b>`],
        i.belowMin ? ["alert", "warn", `That's below the ${i.belowMin}-credit minimum. Ask your advisor before you drop.`] : null,
        ["cap", i.delay ? "warn" : "", i.delay ? `Graduation may move ${i.delay} semester${i.delay > 1 ? "s" : ""} later (around ${esc(semName(grad))}).` : "Your graduation estimate doesn't change."],
        i.unlocks.length ? ["lock", "warn", `${i.unlocks.map(esc).join(", ")} need${i.unlocks.length === 1 ? "s" : ""} ${esc(pick)}, so ${i.unlocks.length === 1 ? "it moves" : "they move"} later too.`] : null,
        ["bars", "", w.tier?.grade ? "A W isn't counted in your CGPA." : "A drop leaves no grade, so your CGPA doesn't change."]
      ].filter(Boolean);
      const adv = St.profile?.advisorEmail, mail = adv ? `mailto:${encodeURIComponent(adv)}?subject=${encodeURIComponent(`Course drop: ${pick} (${semName(sem)})`)}&body=${encodeURIComponent(`Dear ${St.profile?.advisor || "Sir/Madam"},\n\nI would like to drop ${pick}${c.title ? ` (${c.title})` : ""} this ${semName(sem)} semester. Please let me know the next step.\n\n${St.profile?.name || ""}\n${St.profile?.id || ""}`)}` : "";
      return `${now}<ul class="drop-fx">${fx.map(([ic, k, t]) => `<li class="${k}">${icon(ic, "sm")}<span>${t}</span></li>`).join("")}</ul>
        <div class="alert purple mt-s">${icon("info")}<div><b>Recorded in your EWUdiots account</b><p class="small">It leaves your routine, alarms, attendance and plan. EWU doesn't offer drops on the portal, so confirm with your advisor or the Registrar's Office before the deadline.</p>${mail ? `<a class="lnk" href="${mail}">${icon("mail", "sm")} Email your advisor</a>` : ""}</div></div>
        <div class="row mt"><button type="button" class="btn neutral grow" data-close>Keep it</button><button type="button" class="btn danger grow" id="drop-go" ${w.closed ? "disabled" : ""}>${icon("minus", "sm")} Drop ${esc(pick)}</button></div>`;
    };
    openModal(modalHead("Drop a course") + `<p class="small muted">${esc(semName(sem))}: pick the course to see what you get back today and what changes.</p>
      <div class="drop-pick seg" role="radiogroup" aria-label="Course to drop">${courses.map((c) => `<button type="button" role="radio" aria-pressed="${c.code === pick}" aria-checked="${c.code === pick}" data-dp="${esc(c.code)}">${esc(c.code)}</button>`).join("")}</div>
      ${line()}<div id="drop-body">${body()}</div>`, (m) => {
      const pickRow = $(".drop-pick", m);
      ctx.motion.segs(m, "drop");
      const wire = () => $("#drop-go", m)?.addEventListener("click", () => apply(courses.find((x) => x.code === pick), sem, w.tier, dropImpact({ code: pick, courses, tier: w.tier, fees }).amount));
      pickRow.addEventListener("click", (e) => {
        const b = e.target.closest("[data-dp]"); if (!b) return;
        pick = b.dataset.dp;
        $$("[data-dp]", m).forEach((x) => { x.setAttribute("aria-pressed", String(x === b)); x.setAttribute("aria-checked", String(x === b)); });
        ctx.motion.segs(m, "drop"); $("#drop-body", m).innerHTML = body(); wire();
      });
      wire();
    });
  }

  function apply(c, sem, tier, amount) {
    const St = S(), id = uid(), rows = St.routine.filter((r) => r.code === c.code);
    St.routine = St.routine.filter((r) => r.code !== c.code);
    St.dropped = [...(St.dropped || []), { id, sem, code: c.code, title: c.title, cr: c.cr, at: iso(Date.now()), refund: tier?.refund ?? null, amount, grade: tier?.grade || "", rows }];
    if (tier?.grade === "W") St.grades.push({ id: uid(), sem, code: c.code, title: c.title, cr: c.cr, g: "W", manual: true, dropId: id });
    ctx.save(); closeModal(); ctx.rerender();
    toast(`${c.code} dropped`, "success", tier?.grade ? "Marked W for this semester." : amount ? `About ${money(amount)} refund.` : "Removed from your routine and plan.");
  }

  function undo(id) {
    const St = S(), d = (St.dropped || []).find((x) => x.id === id);
    if (!d) return;
    St.routine = [...St.routine.filter((r) => r.code !== d.code), ...(d.rows || [])];
    St.grades = St.grades.filter((g) => g.dropId !== id);
    St.dropped = St.dropped.filter((x) => x.id !== id);
    ctx.save(); ctx.rerender(); toast(`${d.code} is back on your routine`, "success");
  }

  /* "This semester" tab: the drop button and the courses dropped this semester (with undo). */
  function semesterTools() {
    const St = S(), sem = St.routineSem || ctx.currentSemester(), list = (St.dropped || []).filter((d) => d.sem === sem);
    return `${list.length ? `<section class="card mt dropped"><div class="card-h"><h2>Dropped this semester</h2></div>${list.map((d) => `<div class="lrow"><span class="itile sm red">${icon("minus")}</span><div class="body"><b>${esc(d.code)}</b><span>${esc(d.title || "")} · ${d.grade ? "W" : d.refund !== null ? `${d.refund}% refund` : "dropped"} · ${fmt(d.at)}</span></div><button class="btn sm ghost" data-undrop="${esc(d.id)}">${icon("reset", "sm")} Undo</button></div>`).join("")}</section>` : ""}
      ${St.routine.length ? `<button class="btn danger-soft mt" data-sx="drop">${icon("minus", "sm")} Drop a course</button>` : ""}`;
  }
  function mountTools(el) {
    $$("[data-undrop]", el).forEach((b) => b.addEventListener("click", () => undo(b.dataset.undrop)));
    $$('[data-sx="drop"]', el).forEach((b) => { if (!b.closest(".sem-car, #sem-detail")) b.addEventListener("click", () => openDrop()); });
  }

  return { render, mount, semesterTools, mountTools, openDrop, crOf };
}
