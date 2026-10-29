/* Scholarships (#/scholarship): EWU's undergraduate scholarships and aid explained, and a planner that reads your
   CGPA, credits from the past year and retakes from your grades and tells you what you need for the next band. */
import { SOURCE, PROGRAM_CREDITS, assess, neededGpa, creditsAtFour } from "./scholarship.js";
import { nextSem } from "./degreeplan.js";

export function install(ctx) {
  const { pages, icon, esc, $, $$ } = ctx;
  const S = () => ctx.S;
  let plan = { credits: 12, program: "" };
  const programOf = () => { const p = `${S().profile?.program || ""} ${S().profile?.department || ""}`; return Object.keys(PROGRAM_CREDITS).find((k) => new RegExp(`\\b${k.replace(".", "\\.")}\\b`, "i").test(p)) || (/computer/i.test(p) ? "CSE" : /business/i.test(p) ? "BBA" : "CSE"); };
  const ring = (v, max, label) => { const r = 52, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, v / max)); return `<svg class="sch-ring" viewBox="0 0 128 128" role="img" aria-label="${label}"><circle cx="64" cy="64" r="${r}" class="trk"/><circle cx="64" cy="64" r="${r}" class="val" style="stroke-dasharray:${(f * c).toFixed(1)} ${c.toFixed(1)}"/></svg>`; };

  /* Road map to a target CGPA: the term GPA needed in each of the next `n` semesters (same every semester), and the
     CGPA after each one. */
  function roadTo(cgpa, credits, target, n, cr) {
    const need = n * cr ? (target * (credits + n * cr) - cgpa * credits) / (n * cr) : 0;
    let c = cgpa, done = credits, sem = S().routineSem || ctx.currentSemester();
    const steps = [];
    for (let i = 0; i < n; i++) { sem = nextSem(sem); c = (c * done + Math.min(4, Math.max(0, need)) * cr) / (done + cr); done += cr; steps.push({ sem, cgpa: c }); }
    return { need, steps };
  }
  /* Past CGPA (solid) → projected CGPA (dashed) → target line, on one 0–4 axis. */
  function projChart(past, steps, target) {
    const pts = [...past.map((p) => ({ k: p.short, v: p.cgpa })), ...steps.map((s) => ({ k: s.sem.replace(/^(\w{2})\w*-(\d{2})(\d{2})$/, "$1 $3"), v: s.cgpa, f: true }))];
    if (pts.length < 2) return "";
    const w = innerWidth < 600 ? 380 : 640, H = 200, L = 34, R = 46, T = 12, B = 28, lo = Math.max(0, Math.floor(Math.min(target, ...pts.map((p) => p.v)) * 2) / 2 - 0.5);
    const x = (i) => L + (i * (w - L - R)) / (pts.length - 1), y = (v) => T + ((4 - v) * (H - T - B)) / (4 - lo);
    const split = past.length - 1, line = (a) => a.map(([p, i], k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
    const idx = pts.map((p, i) => [p, i]);
    return `<div class="viz" data-viz="bars"><svg viewBox="0 0 ${w} ${H}" role="img" aria-label="CGPA so far and the projected path to your target">
      ${[lo, (lo + 4) / 2, 4].map((v) => `<line class="grid" x1="${L}" x2="${w - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v.toFixed(1)}</text>`).join("")}
      <line class="thr" x1="${L}" x2="${w - R}" y1="${y(target)}" y2="${y(target)}"/><text class="ax" x="${w - R + 4}" y="${y(target) + 4}">${target.toFixed(2)}</text>
      ${split >= 0 ? `<path class="ln s1" d="${line(idx.slice(0, split + 1))}"/>` : ""}<path class="ln s1 proj" d="${line(idx.slice(Math.max(0, split)))}"/>
      ${pts.map((p, i) => `<circle class="dot s1 ${p.f ? "hollow" : ""}" cx="${x(i)}" cy="${y(p.v)}" r="4"/><text class="ax" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(p.k)}</text>
        <rect class="hit" x="${x(i) - 14}" y="0" width="28" height="${H}" data-tip="${esc(`${p.k}: CGPA ${p.v.toFixed(2)}${p.f ? " (projected)" : ""}`)}" data-x="${x(i)}"/>`).join("")}
    </svg><div class="tip" hidden></div></div><div class="legend"><span><i class="sw s1"></i>CGPA so far</span><span><i class="sw s1 dash"></i>Projected</span><span><i class="sw thr"></i>Your target</span></div>`;
  }
  /* Plain advice for where you stand. */
  function tips(a, need, plan, has) {
    const out = [];
    if (!has) return ["Sync your grade report: we read your CGPA and credits and keep this page up to date by itself."];
    if (a.retake) out.push("You have retaken a course. EWU's rules make retakers ineligible for merit awards, so focus on need-based aid or the Medha Lalon fund.");
    if (need > 4) out.push(`A ${plan.target.toFixed(2)} isn't reachable in ${plan.n} semester${plan.n > 1 ? "s" : ""}. Give it more semesters or set a nearer target.`);
    else if (need > 0) { const g = ctx.GRADES.slice().reverse().find((x) => x.p >= need) || ctx.GRADES[0]; out.push(`Average about <b>${esc(g.g)}</b> (${g.p.toFixed(2)}) in every course for the next ${plan.n} semester${plan.n > 1 ? "s" : ""}.`); }
    if (a.yearKnown && a.yearCredits < a.quarter) out.push(`Complete at least ${a.quarter} credits over the last year (you have ${a.yearCredits}). Take a full load next semester.`);
    out.push("Register at least 3 courses (9 credits) every semester, or the award stops.");
    if (a.current && a.current.id !== "aid") out.push(`Keep your CGPA at ${a.current.min.toFixed(2)} or more to keep ${esc(a.current.name)}.`);
    out.push(`Plan ${Math.max(6, Math.round(need * 3))} focused hours a week per course before mid-terms: <a href="#/focus">start a focus session</a>.`);
    return out;
  }
  pages.scholarship = () => {
    const St = S(), g = ctx.cgpaOf(St.grades), program = plan.program || programOf();
    // Your CGPA and credits: from your grades, else what the portal says (profile / degree review).
    const cgpaNow = g.cgpa || Number(St.profile?.cgpa) || 0, credNow = g.credits || Number(St.profile?.creditsDone) || 0;
    const a = { ...assess({ cgpa: cgpaNow, credits: credNow, grades: St.grades, admitted: St.profile?.admitted || "", program }), yearKnown: St.grades.some((x) => x.sem) };
    const has = cgpaNow > 0, f2 = (x) => x.toFixed(2);
    const need = (target) => { const gpa = neededGpa(a.cgpa, a.credits, target, plan.credits); return gpa <= 0 ? "You're already there" : gpa > 4 ? `Not in one semester. About ${creditsAtFour(a.cgpa, a.credits, target)} credits of A+ needed` : `Term GPA ${f2(gpa)} next semester (${plan.credits} credits)`; };
    // Default: the next band, in the fewest semesters (up to 6) where it's reachable with straight A-level terms.
    const target0 = Number(St.settings.cgpaTarget) || (a.next ? a.next.min : Math.min(4, Math.ceil((a.cgpa + 0.1) * 20) / 20));
    const reachIn = [1, 2, 3, 4, 5, 6].find((k) => roadTo(a.cgpa, a.credits, target0, k, plan.credits).need <= 3.9) || 6;
    const tgt = { target: target0, n: Number(St.settings.cgpaTargetN) || reachIn };
    const road = has ? roadTo(a.cgpa, a.credits, tgt.target, tgt.n, plan.credits) : { need: 0, steps: [] };
    const prevBand = a.list.filter((b) => b.id !== "aid" && b.min <= a.cgpa).sort((x, y) => y.min - x.min)[0];
    const prog = a.next ? Math.max(0, Math.min(100, Math.round((100 * (a.cgpa - (prevBand?.min ?? Math.max(0, a.next.min - 0.5)))) / (a.next.min - (prevBand?.min ?? Math.max(0, a.next.min - 0.5)))))) : 100;
    const head = ctx.head("Scholarships", "How EWU scholarships work, what you need, and your road map to the next one.");
    return `${head}
      <section class="sch-hero fx-rise"><i class="sheen" aria-hidden="true"></i>
        <div class="sch-ring-wrap">${ring(a.cgpa, 4, `CGPA ${f2(a.cgpa)} of 4`)}<div class="sch-ring-txt"><b class="num">${has ? f2(a.cgpa) : "—"}</b><span>CGPA</span></div></div>
        <div class="grow min0"><span class="sch-kicker">${icon("trophy", "sm")} Your scholarship check · updates by itself</span>
          <h2>${!has ? "Sync your grades to check" : a.retake ? "Retakes make you ineligible" : a.current ? a.current.name : "Not in a scholarship band yet"}</h2>
          <p>${!has ? "Sign in to the portal (or upload your Grade Report) on Sync and we'll do the maths." : a.retake ? "EWU's rules: retaking any course makes a student ineligible for scholarships." : a.current ? `${esc(a.current.value)}${a.current.id !== "aid" && a.yearKnown && a.yearCredits < a.quarter ? `. You also need ${a.quarter} credits in the past year (you have ${a.yearCredits}).` : "."}` : a.next ? `Next: ${a.next.name} at CGPA ${f2(a.next.min)}.` : ""}</p>
          ${has && a.next && !a.retake ? `<div class="sch-prog"><div class="row between xs"><span>${prevBand ? esc(prevBand.name) : "Now"}</span><span>${esc(a.next.name)} · ${f2(a.next.min)}</span></div><div class="sch-prog-bar"><i style="width:${prog}%"></i></div></div>
            <div class="sch-next"><b>${icon("target", "sm")} To reach ${f2(a.next.min)}:</b> ${need(a.next.min)}</div>` : ""}</div></section>

      ${has ? `<section class="card mt sch-road"><div class="card-h"><h2><span class="itile sm purple">${icon("map")}</span> Your road map</h2><span class="xs">Changes as new grades sync</span></div>
        <div class="grid g3"><label class="field">Target CGPA<input class="input num" id="sc-tgt" type="number" min="2" max="4" step="0.01" value="${f2(tgt.target)}"></label>
          <label class="field">In how many semesters<select class="select" id="sc-n">${[1, 2, 3, 4, 5, 6].map((v) => `<option ${v === tgt.n ? "selected" : ""}>${v}</option>`).join("")}</select></label>
          <label class="field">Credits a semester<input class="input" id="sc-cr2" type="number" min="3" max="21" step="0.5" value="${plan.credits}"></label></div>
        <div class="chips mt-s">${a.list.filter((b) => b.id !== "aid" && b.min > a.cgpa).slice(0, 3).map((b) => `<button class="chip" data-tgt="${b.min}">${esc(b.name)} · ${f2(b.min)}</button>`).join("")}</div>
        <div class="sch-need mt ${road.need > 4 ? "bad" : road.need <= 0 ? "ok" : ""}"><b class="num">${road.need <= 0 ? "✓" : road.need > 4 ? "4.00+" : f2(road.need)}</b><span>${road.need <= 0 ? "You're already at your target. Keep it up." : road.need > 4 ? "Term GPA needed: more than an A+ average. Give it more time." : `term GPA needed in each of the next ${tgt.n} semester${tgt.n > 1 ? "s" : ""}`}</span></div>
        ${projChart(ctx.charts?.series() || [], road.steps, tgt.target)}
        <ol class="road mt">${road.steps.map((s, i) => `<li class="road-step"><span class="road-dot">${i + 1}</span><div class="grow"><div class="row between nowrap"><b>${esc(s.sem)}</b><span class="xs num">CGPA → ${f2(s.cgpa)}</span></div><p class="xs">Term GPA ${road.need > 4 ? "4.00 (max)" : f2(Math.max(0, road.need))} on ${plan.credits} credits</p></div></li>`).join("")}</ol>
        <h3 class="mt">Tips for you</h3><ul class="sch-rules mt-s">${tips(a, road.need, tgt, has).map((t) => `<li>${icon("bulb", "sm")}<span>${t}</span></li>`).join("")}</ul></section>` : ""}

      <div class="grid g2 mt">
        <section class="card"><div class="card-h"><h2><span class="itile sm purple">${icon("calc")}</span> Plan it</h2></div>
          <div class="grid g2"><label class="field">Program<select class="select" id="sc-prog">${Object.keys(PROGRAM_CREDITS).map((k) => `<option ${k === program ? "selected" : ""}>${k}</option>`).join("")}</select></label>
            <label class="field">Credits next semester<input class="input" id="sc-cr" type="number" min="3" max="21" step="0.5" value="${plan.credits}"></label></div>
          <div class="sch-facts mt-s">${[["Credits done", a.credits], ["In the past year", a.yearKnown ? `${a.yearCredits} / ${a.quarter} needed` : "Sync the grade report"], ["Admitted", S().profile?.admitted || "—"], ["Rules", a.newCohort ? "Spring 2026 onward" : "Up to Fall 2025"]].map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join("")}</div>
          <div class="stack mt" style="gap:8px">${a.list.filter((b) => b.id !== "aid").map((b) => `<div class="sch-band ${a.cgpa >= b.min ? "hit" : ""}"><div class="grow min0"><b>${esc(b.name)}</b><span>CGPA ${f2(b.min)}${b.max < 4 ? `–${f2(b.max)}` : "+"} · ${esc(b.value)}</span></div><span class="pill ${a.cgpa >= b.min ? "green" : ""}">${a.cgpa >= b.min ? "Reached" : has ? need(b.min).replace(/^Term GPA (\S+).*/, "need $1") : "—"}</span></div>`).join("")}</div></section>
        <section class="card"><div class="card-h"><h2><span class="itile sm green">${icon("checkc")}</span> To keep it</h2></div>
          <ul class="sch-rules">${["Register at least 3 courses (9 credits) every semester. B.Pharm and LL.B: 4 courses (12 credits).", "Merit: keep CGPA 3.50 or more. Dean's List / Medha Lalon: CGPA 2.75 or more, measured over the last year.",
            "Never retake a course: a retake makes you ineligible.", "Only one scholarship or aid at a time, and it can't be exchanged later.", "No aid beyond 4 years, or after your degree credits are complete.", "Any disciplinary violation ends the award."].map((t) => `<li>${icon("check", "sm")}<span>${t}</span></li>`).join("")}</ul></section>
      </div>

      <h2 class="mt-l">Other scholarships and aid</h2>
      <div class="grid g2 mt-s">${[
        ["school", "blue", "Entry scholarships (new students)", "A+ in every SSC and HSC subject: 100% tuition-free for 4 years. GPA 5.00 in SSC and HSC: 50% for the first year. Top admission test scores (75%+) get a full-year waiver. O/A level equivalents apply."],
        ["map", "green", "District scholarship", "One student per district, merit-cum-need: Tk 8,000 a month for food and lodging plus Tk 2,000 a semester for books. Renewed yearly with CGPA 3.0+."],
        ["users", "orange", "Sibling or spouse", "A second sibling or spouse studying at the same time gets 50% tuition waiver (a third sibling too). One keeps CGPA 2.60, the other a passing CGPA."],
        ["flag", "red", "Freedom fighters' wards", "3% of seats, and up to 100% waiver for wards of wounded, deceased or distressed freedom fighters. Keep CGPA 2.60."],
        ["heart", "pink", "Medha Lalon Fund", "Need-cum-merit help for middle-class students, female students and students from outside Dhaka. Apply with the form; a committee selects."],
        ["globe", "purple", "International students", "50% tuition fee reduction in every program."]
      ].map(([ic, tone, t, d]) => `<article class="card sch-card"><span class="itile ${tone}">${icon(ic)}</span><div><b>${t}</b><p class="small muted">${d}</p></div></article>`).join("")}</div>
      <section class="card mt row nowrap"><span class="itile purple">${icon("info")}</span><div class="grow"><b>How to apply</b><p class="small muted">Merit, Dean's List and Medha Lalon are given automatically each year from your results. For need-based aid, the district scholarship and family concessions, collect the form from the Accounts / Financial Assistance office at the start of the semester. Questions: admissions@ewubd.edu.</p></div></section>
      <p class="xs mt" style="text-align:center">Rules summarised from <a href="${SOURCE}" target="_blank" rel="noopener">ewubd.edu/scholarships-financial-aid</a>. EWU decides every award; confirm with the Accounts Office.</p>`;
  };
  pages.scholarship.mount = (el) => {
    $("#sc-tgt", el)?.addEventListener("change", (e) => { const v = Number(e.target.value); if (v >= 2 && v <= 4) { S().settings.cgpaTarget = v; ctx.save(); ctx.rerender(); } });
    $("#sc-n", el)?.addEventListener("change", (e) => { S().settings.cgpaTargetN = Number(e.target.value); ctx.save(); ctx.rerender(); });
    $("#sc-cr2", el)?.addEventListener("change", (e) => { plan.credits = Math.max(3, Math.min(21, Number(e.target.value) || 12)); ctx.rerender(); });
    $$("[data-tgt]", el).forEach((b) => b.addEventListener("click", () => { S().settings.cgpaTarget = Number(b.dataset.tgt); ctx.save(); ctx.rerender(); }));
    ctx.charts?.bindTips(el);
    $("#sc-prog", el)?.addEventListener("change", (e) => { plan.program = e.target.value; ctx.rerender(); });
    $("#sc-cr", el)?.addEventListener("change", (e) => { plan.credits = Math.max(3, Math.min(21, Number(e.target.value) || 12)); ctx.rerender(); });
  };
}
