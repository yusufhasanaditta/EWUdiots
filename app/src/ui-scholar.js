/* Scholarships (#/scholarship): EWU's undergraduate scholarships and aid explained, and a planner that reads your
   CGPA, credits from the past year and retakes from your grades and tells you what you need for the next band. */
import { SOURCE, PROGRAM_CREDITS, assess, neededGpa, creditsAtFour } from "./scholarship.js";

export function install(ctx) {
  const { pages, icon, esc, $, $$ } = ctx;
  const S = () => ctx.S;
  let plan = { credits: 12, program: "" };
  const programOf = () => { const p = `${S().profile?.program || ""} ${S().profile?.department || ""}`; return Object.keys(PROGRAM_CREDITS).find((k) => new RegExp(`\\b${k.replace(".", "\\.")}\\b`, "i").test(p)) || (/computer/i.test(p) ? "CSE" : /business/i.test(p) ? "BBA" : "CSE"); };
  const ring = (v, max, label) => { const r = 52, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, v / max)); return `<svg class="sch-ring" viewBox="0 0 128 128" role="img" aria-label="${label}"><circle cx="64" cy="64" r="${r}" class="trk"/><circle cx="64" cy="64" r="${r}" class="val" style="stroke-dasharray:${(f * c).toFixed(1)} ${c.toFixed(1)}"/></svg>`; };

  pages.scholarship = () => {
    const St = S(), g = ctx.cgpaOf(St.grades), program = plan.program || programOf();
    const a = assess({ cgpa: g.cgpa, credits: g.credits, grades: St.grades, admitted: St.profile?.admitted || "", program });
    const has = St.grades.length > 0, f2 = (x) => x.toFixed(2);
    const need = (target) => { const gpa = neededGpa(a.cgpa, a.credits, target, plan.credits); return gpa <= 0 ? "You're already there" : gpa > 4 ? `Not in one semester. About ${creditsAtFour(a.cgpa, a.credits, target)} credits of A+ needed` : `Term GPA ${f2(gpa)} next semester (${plan.credits} credits)`; };
    const head = ctx.head("Scholarships", "How EWU scholarships work, and what you need to get one.");
    return `${head}
      <section class="sch-hero fx-rise"><i class="sheen" aria-hidden="true"></i>
        <div class="sch-ring-wrap">${ring(a.cgpa, 4, `CGPA ${f2(a.cgpa)} of 4`)}<div class="sch-ring-txt"><b class="num">${has ? f2(a.cgpa) : "—"}</b><span>CGPA</span></div></div>
        <div class="grow min0"><span class="sch-kicker">${icon("trophy", "sm")} Your scholarship check</span>
          <h2>${!has ? "Sync your grades to check" : a.retake ? "Retakes make you ineligible" : a.current ? a.current.name : "Not in a scholarship band yet"}</h2>
          <p>${!has ? "Upload your Grade Report on Sync and we'll do the maths." : a.retake ? "EWU's rules: retaking any course makes a student ineligible for scholarships." : a.current ? `${esc(a.current.value)}${a.current.id !== "aid" && a.yearCredits < a.quarter ? `. You also need ${a.quarter} credits in the past year (you have ${a.yearCredits}).` : "."}` : a.next ? `Next: ${a.next.name} at CGPA ${f2(a.next.min)}.` : ""}</p>
          ${has && a.next && !a.retake ? `<div class="sch-next"><b>${icon("target", "sm")} To reach ${f2(a.next.min)}:</b> ${need(a.next.min)}</div>` : ""}</div></section>

      <div class="grid g2 mt">
        <section class="card"><div class="card-h"><h2><span class="itile sm purple">${icon("calc")}</span> Plan it</h2></div>
          <div class="grid g2"><label class="field">Program<select class="select" id="sc-prog">${Object.keys(PROGRAM_CREDITS).map((k) => `<option ${k === program ? "selected" : ""}>${k}</option>`).join("")}</select></label>
            <label class="field">Credits next semester<input class="input" id="sc-cr" type="number" min="3" max="21" step="0.5" value="${plan.credits}"></label></div>
          <div class="sch-facts mt-s">${[["Credits done", a.credits], ["In the past year", `${a.yearCredits} / ${a.quarter} needed`], ["Admitted", S().profile?.admitted || "—"], ["Rules", a.newCohort ? "Spring 2026 onward" : "Up to Fall 2025"]].map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join("")}</div>
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
    $("#sc-prog", el)?.addEventListener("change", (e) => { plan.program = e.target.value; ctx.rerender(); });
    $("#sc-cr", el)?.addEventListener("change", (e) => { plan.credits = Math.max(3, Math.min(21, Number(e.target.value) || 12)); ctx.rerender(); });
  };
}
