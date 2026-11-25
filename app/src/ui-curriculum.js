/* Curriculum views for Degree Progress: EWU's curriculum with the student's completed courses, the updated plan (courses
   still owed, failed, withdrawn or dropped placed again) and the student's edited plan (drag a course, or tap it, to move
   it between future semesters; done and current courses are locked). Also ctx.curPlan() for the advising planner.
   Logic: curplan.ts. EWU's plan: the department flowchart (ui-semesters.js → /api/flowchart). */
import { officialStatus, updatedPlan, editedPlan, checkPlan, moveItem, deriveOfficial, firstSemOf, semAt, altCode } from "./curplan.ts";
import { haptic } from "./gestures.ts";

const ST = { done: ["Done", "green", "checkc"], now: ["Now", "purple", "clock"], retake: ["Retake", "red", "refund"], behind: ["Catch up", "amber", "alert"], later: ["Later", "", "calendar"] };
const semName = (s) => String(s || "").replace("-", " ");

export function install(ctx) {
  const { icon, esc, $, $$ } = ctx;
  const S = () => ctx.S;

  /* Everything the views need, from the flowchart (or the synced curriculum) and the student's record. */
  let memo = { key: "", v: null };
  function curPlan() {
    const St = S(), fc = ctx.flowchart ? ctx.flowchart() : { none: true }, cur = St.curriculum || [];
    const curSem = St.routineSem || ctx.currentSemester(), current = [...new Set(ctx.activeRoutine().map((r) => r.code))];
    // The key holds every input build() reads, so a re-sync or an edit rebuilds the plan.
    const key = JSON.stringify([St.grades.map((g) => [g.sem, g.code, g.g]), current, (St.dropped || []).map((d) => [d.sem, d.code]),
      St.curEdit || {}, fc.name || fc.loading || fc.none || "", (fc.semesters || []).length, cur.map((c) => [c.code, c.cr, c.prereq]), curSem, St.profile?.id, St.rules?.maxCredit, St.rules?.minCredit]);
    if (memo.key === key) return memo.v;
    memo = { key, v: build(St, fc, cur, curSem, current) };
    return memo.v;
  }
  function build(St, fc, cur, curSem, current) {
    const max = Number(St.rules?.maxCredit) || 15, min = Number(St.rules?.minCredit) || 9;
    let official = [], source;
    const preOf = new Map(cur.map((x) => [x.code, x.prereq || []])), pre = (code) => preOf.get(code) || [];
    if (fc.semesters?.length) { official = fc.semesters.map((s) => ({ n: s.n, courses: s.courses.map((c) => ({ ...c, prereq: [...new Set([...(c.prereq || []), ...pre(c.code)])] })) })); source = "ewu"; }
    else if (cur.length) { official = deriveOfficial(cur, max); source = "derived"; }
    else source = fc.loading ? "loading" : "none";
    const firstSem = firstSemOf(St.profile?.id, St.grades.map((g) => g.sem), curSem);
    const input = { official, grades: St.grades, current, dropped: St.dropped || [], firstSem, curSem, maxCredits: max };
    if (!official.length) return { source, fc, firstSem, curSem, min, max, items: [], updated: [], edited: [], byCode: new Map(), check: { items: {}, sems: {} } };
    const items = officialStatus(input), updated = updatedPlan(input, items), edited = editedPlan(updated, St.curEdit || {});
    // Each course code → its curriculum item (the part still owed for a repeated course like CSE400).
    const byCode = new Map();
    for (const i of items) if (i.code && (!byCode.has(i.code) || (byCode.get(i.code).status === "done" && i.status !== "done"))) byCode.set(i.code, i);
    // The planner lists courses by this semester's codes (ENG7101); look them up under the plan's code too.
    for (const [c, i] of [...byCode]) if (!byCode.has(altCode(c))) byCode.set(altCode(c), i);
    return { source, fc, firstSem, curSem, min, max, items, updated, edited, byCode, check: checkPlan(edited, { min, max }), name: fc.name };
  }
  ctx.curPlan = curPlan;

  const label = (it) => it.slot ? (it.filledBy ? `${it.filledBy}` : it.title) : it.code;
  const why = (it, inPlan) => {
    if (it.status === "retake") return it.g === "Dropped" ? `Dropped${it.takenIn ? ` in ${semName(it.takenIn)}` : ""}: take it again` : `Got ${it.g}${it.takenIn ? ` in ${semName(it.takenIn)}` : ""}: take it again`;
    if (it.status === "behind") return `EWU plans it in semester ${it.n}: catch up`;
    if (it.status === "done") return it.takenIn ? `Passed in ${semName(it.takenIn)}` : "Passed";
    if (it.status === "now") return "Taking it this semester";
    return inPlan ? `EWU plans it in semester ${it.n}` : it.needs.length ? `Needs ${it.needs.join(", ")}` : "";
  };
  const chip = (it, { inPlan = false, movable = false, warn = "" } = {}) => {
    const [l, tone] = ST[it.status], locked = inPlan && !movable && (it.status === "done" || it.status === "now");
    const badge = it.status === "done" && it.g ? it.g : it.status === "retake" ? (it.g === "Dropped" ? "Dropped" : `Retake · ${it.g}`) : it.status === "later" ? "" : l;
    return `<li class="cu-c s-${it.status}${warn ? " warn" : ""}" style="--cc:${ctx.colorFor(it.code || it.title)}" ${movable ? `data-mv="${esc(it.id)}" tabindex="0" role="button" aria-label="Move ${esc(label(it))}"` : ""}>
      ${movable ? `<span class="cu-grip" data-grip aria-hidden="true">${icon("grip", "sm")}</span>` : locked ? `<span class="cu-grip lock" aria-hidden="true">${icon(it.status === "done" ? "check" : "lock", "sm")}</span>` : ""}
      <span class="min0 grow"><b>${esc(label(it))}</b>${it.slot && !it.filledBy ? "" : `<span class="xs ellipsis cu-t">${esc(it.slot ? it.title : it.title !== it.code ? it.title : "")}</span>`}
        <span class="xs cu-why">${esc(warn || why(it, inPlan))}</span></span>
      <span class="cu-r"><span class="xs num">${it.cr} cr</span>${badge ? `<span class="pill ${tone}">${esc(badge)}</span>` : ""}</span></li>`;
  };
  const semCard = (s, { title, sub, items, credits, state, drop = false, warn = "", P }) => `<section class="card cu-sem st-${state}" ${drop ? `data-drop="${esc(s)}"` : ""} aria-label="${esc(title)}">
      <div class="cu-sh"><div class="min0"><b>${esc(title)}</b><span class="xs">${esc(sub)}</span></div><span class="pill ${credits > P.max ? "red" : credits && credits < P.min && state === "next" ? "amber" : ""}">${credits} cr</span></div>
      ${warn ? `<p class="xs cu-warn">${icon("alert", "sm")} ${esc(warn)}</p>` : ""}
      <ul class="cu-list">${items}</ul>${drop && !items ? `<p class="xs cu-empty">Drop a course here</p>` : ""}</section>`;
  const STATE = { done: "Done", now: "This semester", next: "Planned" };

  function sourceNote(P) {
    if (P.source === "ewu") return `<p class="xs">EWU's ${esc(P.name || "course flowchart")}${P.fc.source ? ` · <a class="lnk" href="${esc(P.fc.source)}" target="_blank" rel="noopener">ewubd.edu ${icon("external", "sm")}</a>` : ""}</p>`;
    if (P.source === "derived") return `<div class="alert purple">${icon("info")}<div><b>Order built from your curriculum</b><p class="small">Your department doesn't publish a semester-by-semester flowchart on ewubd.edu, so each course is placed one term after its prerequisites (from your synced curriculum).${P.fc.image ? ` <button class="lnk" data-cu-img>See the department's flowchart picture</button>` : ""}</p></div></div>`;
    return "";
  }
  function empty(P) {
    if (P.source === "loading") return `<div class="card">${ctx.empty("icon:map", "Loading EWU's curriculum…", "Getting your department's semester-by-semester plan from ewubd.edu.")}</div>`;
    return `<div class="card">${ctx.empty("icon:map", "Sync your curriculum first", `${P.fc.image ? "Your department publishes its flowchart only as a picture. " : "EWU's flowchart loads automatically for CSE. "}For other programs, sign in to the portal on the Sync page and we read your curriculum and its prerequisites.`, `<a class="btn primary" href="#/sync">${icon("sync")} Sync portal</a>${P.fc.image ? ` <button class="btn outline" data-cu-img>${icon("image")} Department flowchart</button>` : ""}`)}</div>`;
  }
  const stats = (P, plan) => {
    const n = (k) => P.items.filter((i) => i.status === k).length, last = [...plan].reverse().find((s) => s.items.length);
    return `<div class="cu-stats">${[["Done", `${n("done")}/${P.items.length}`, "green"], ["This semester", n("now"), "purple"], ["Retake", n("retake"), "red"], ["Catch up", n("behind"), "amber"], ["Graduation", last ? semName(last.sem) : "—", ""]]
      .map(([l, v, t]) => `<div class="${t}"><b class="num">${esc(String(v))}</b><span>${l}</span></div>`).join("")}</div>`;
  };

  /* EWU's curriculum, semester by semester, with what the student has done. */
  function official() {
    const P = curPlan();
    if (!P.items.length) return empty(P);
    const by = new Map(); P.items.forEach((i) => { if (!by.has(i.n)) by.set(i.n, []); by.get(i.n).push(i); });
    return `${sourceNote(P)}${stats(P, P.updated)}<div class="cu-legend xs">${Object.entries(ST).map(([k, [l, t]]) => `<span><i class="dot ${t || "grey"}"></i>${k === "later" ? "Not yet" : l}</span>`).join("")}</div>
      <div class="cu-grid mt">${[...by.entries()].map(([n, list]) => semCard(n, { P, title: `Semester ${n}`, sub: `Year ${Math.ceil(n / 3)} · yours: ${semName(semAt(P.firstSem, n))}`, credits: list.reduce((a, c) => a + c.cr, 0), state: "ewu", items: list.map((i) => chip(i)).join("") })).join("")}</div>`;
  }

  /* The updated plan, or the student's edited one (drag and drop). */
  function plan(mode) {
    const P = curPlan();
    if (!P.items.length) return empty(P);
    const list = mode === "edited" ? P.edited : P.updated, edits = Object.keys(S().curEdit || {}).length;
    const chk = mode === "edited" ? P.check : checkPlan(P.updated, { min: P.min, max: P.max });
    const intro = mode === "edited"
      ? `<div class="row between wrap cu-bar"><p class="small muted">${icon("grip", "sm")} Drag a course, or tap it, to move it to another semester. Done and current courses are locked.</p>${edits ? `<button class="btn sm ghost" id="cu-reset">${icon("reset", "sm")} Reset to updated plan</button>` : ""}</div>`
      : `<p class="small muted cu-bar">Rebuilt from your record: every course you haven't passed (never taken, failed, withdrawn or dropped) is placed again after its prerequisites, no earlier than EWU plans it, at most ${P.max} credits a semester. <a class="lnk" href="#/degree?tab=edited">Edit it</a></p>`;
    return `${sourceNote(P)}${stats(P, list)}${intro}
      <div class="cu-grid mt" ${mode === "edited" ? 'id="cu-edit"' : ""}>${list.map((s) => semCard(s.sem, { P, title: `Semester ${s.no} · ${semName(s.sem)}`, sub: STATE[s.state], credits: s.credits, state: s.state, drop: mode === "edited" && s.state === "next", warn: chk.sems[s.sem] || "",
        items: s.state === "done" ? `<li class="cu-tags">${s.items.map((i) => `<span class="cu-tag" title="${esc(i.title)}">${esc(label(i))} <b>${esc(i.g || "")}</b></span>`).join("") || '<span class="xs muted">No EWU-plan course passed here</span>'}</li>` : s.items.map((i) => chip(i, { inPlan: true, movable: mode === "edited" && s.state === "next", warn: chk.items[i.id] || "" })).join("") })).join("")}</div>`;
  }

  function save(edit) { S().curEdit = edit; ctx.save(); ctx.rerender(); }
  function moveSheet(id) {
    const P = curPlan(), it = P.edited.flatMap((s) => s.items).find((i) => i.id === id), from = P.edited.find((s) => s.items.includes(it));
    if (!it) return;
    ctx.openModal(ctx.modalHead(`Move ${label(it)}`) + `<p class="small muted">${esc(it.title)} · ${it.cr} credits. Pick the semester:</p>
      <div class="cu-moves">${P.edited.filter((s) => s.state === "next").map((s) => `<button class="btn ${s === from ? "primary" : "outline"}" data-to="${esc(s.sem)}" ${s === from ? 'aria-current="true"' : ""}><span>Semester ${s.no} · ${esc(semName(s.sem))}</span><span class="xs num${s !== from && s.credits + it.cr > P.max ? " over" : ""}">${s.credits}${s === from ? " cr · now" : ` → ${s.credits + it.cr} cr${s.credits + it.cr > P.max ? " · over" : ""}`}</span></button>`).join("")}</div>`, (m) => {
      $$("[data-to]", m).forEach((b) => b.addEventListener("click", () => { ctx.closeModal(); if (b.dataset.to !== from.sem) { save(moveItem(P.edited, id, b.dataset.to)); haptic("success"); ctx.toast(`${label(it)} moved to ${semName(b.dataset.to)}`, "success"); } }));
    });
  }
  const scroller = (el) => { for (let n = el.parentElement; n; n = n.parentElement) { const o = getComputedStyle(n).overflowY; if ((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight) return n; } return document.scrollingElement; };

  /* Pointer drag: mouse anywhere on the card, touch from the grip (so the page still scrolls); a tap opens the sheet. */
  function mount(el) {
    $$("[data-cu-img]", el).forEach((b) => b.addEventListener("click", () => { const fc = ctx.flowchart?.(); if (fc?.image) ctx.openModal(ctx.modalHead("Department flowchart") + `<img class="fc-img" src="${esc(fc.image)}" alt="Course flowchart published by the department on ewubd.edu" loading="lazy">`); }));
    $("#cu-reset", el)?.addEventListener("click", () => ctx.confirmModal("Reset your edited plan?", "Your moves are removed and the plan matches the updated plan again.", "Reset", () => { save({}); ctx.toast("Plan reset", "success"); }, true));
    const box = $("#cu-edit", el);
    if (!box) return;
    let dragged = 0;
    box.addEventListener("click", (e) => { const c = e.target.closest("[data-mv]"); if (c && Date.now() - dragged > 400) moveSheet(c.dataset.mv); });
    box.addEventListener("keydown", (e) => { const c = e.target.closest("[data-mv]"); if (c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); moveSheet(c.dataset.mv); } });
    box.addEventListener("pointerdown", (e) => {
      const c = e.target.closest("[data-mv]");
      if (!c || e.button > 0 || (e.pointerType !== "mouse" && !e.target.closest("[data-grip]"))) return;
      const id = c.dataset.mv, r = c.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top, sx = e.clientX, sy = e.clientY, sc = scroller(box);
      let ghost = null, over = null, y = e.clientY, raf = 0;
      if (e.pointerType !== "mouse") e.preventDefault();
      const tick = () => { const v = y < 90 ? -14 : y > innerHeight - 90 ? 14 : 0; if (v) sc.scrollBy(0, v); raf = requestAnimationFrame(tick); };
      const move = (ev) => {
        y = ev.clientY;
        if (!ghost) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
          ghost = c.cloneNode(true); ghost.classList.add("cu-ghost"); ghost.style.width = `${r.width}px`; ghost.removeAttribute("data-mv");
          document.body.appendChild(ghost); c.classList.add("cu-dragging"); haptic(); raf = requestAnimationFrame(tick);
        }
        ev.preventDefault();
        ghost.style.transform = `translate3d(${ev.clientX - dx}px, ${ev.clientY - dy}px, 0) rotate(-1.5deg) scale(1.03)`;
        const z = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-drop]");
        if (z !== over) { over?.classList.remove("over"); over = z; z?.classList.add("over"); }
      };
      const end = (ev) => {
        removeEventListener("pointermove", move); removeEventListener("pointerup", end); removeEventListener("pointercancel", end);
        cancelAnimationFrame(raf); ghost?.remove(); c.classList.remove("cu-dragging"); over?.classList.remove("over");
        if (!ghost) return; // a tap: the click handler opens the sheet
        dragged = Date.now();
        const P = curPlan(), from = P.edited.find((s) => s.items.some((i) => i.id === id));
        if (over && ev.type === "pointerup" && from && over.dataset.drop !== from.sem) { haptic("success"); save(moveItem(P.edited, id, over.dataset.drop)); }
      };
      addEventListener("pointermove", move, { passive: false }); addEventListener("pointerup", end); addEventListener("pointercancel", end);
    });
  }

  /* Credits and title from EWU's curriculum (the offered list only has an estimate). */
  const infoOf = (code) => { const m = curPlan().byCode; return m.get(code) || m.get(altCode(code)) || null; };

  /* For the advising planner: where EWU puts a course and whether the plan suggests it for `sem`. */
  function plannerInfo(sem) {
    const P = curPlan(), planned = P.edited.filter((s) => s.sem === sem).flatMap((s) => s.items.map((i) => i.code)).filter(Boolean);
    // `suggested` holds both codes of each course so the planner's ENG7101 matches the plan's ENG101.
    return { ok: P.items.length > 0, byCode: P.byCode, planned, suggested: new Set(planned.flatMap((c) => [c, altCode(c)])) };
  }

  return { official, plan, mount, plannerInfo, infoOf };
}
