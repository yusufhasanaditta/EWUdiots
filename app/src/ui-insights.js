/* Academic analytics (#/insights): CGPA and term GPA over time, credits per semester, grade distribution, attendance by
   course against its minimum, credits by degree area, study time this week and an at-a-glance risk check. Works with
   whatever was synced: grades with semesters draw the trend; the portal's CGPA alone still fills the headline.
   Hand-made SVG charts (no library): thin marks, one axis, hover/tap tooltips, legend + direct labels, and a table view
   of every chart. Palette validated for light and dark (see mobile.css: --viz1, --viz2). */
import { semesterKey } from "./parser.js";

export function install(ctx) {
  const { pages, icon, esc, $$ } = ctx;
  const S = () => ctx.S;
  const f2 = (x) => Number(x).toFixed(2);

  /* Per-semester term GPA and running CGPA (latest attempt of each course counts, like EWU's grade report). */
  function series() {
    const sems = [...new Set(S().grades.map((g) => g.sem).filter(Boolean))].sort((a, b) => semesterKey(a) - semesterKey(b));
    return sems.map((sem, i) => {
      const term = ctx.cgpaOf(S().grades.filter((g) => g.sem === sem)), upto = ctx.cgpaOf(S().grades.filter((g) => g.sem && sems.indexOf(g.sem) <= i));
      return { sem, short: sem.replace(/^(\w{2})\w*-(\d{2})(\d{2})$/, "$1 $3"), term: term.credits ? term.cgpa : null, cgpa: upto.cgpa, credits: term.earned };
    }).filter((p) => p.cgpa > 0);
  }
  const W = () => (innerWidth < 600 ? 380 : 640);

  /* Line chart: two series on one 0–4 axis, crosshair tooltip. */
  function lineChart(pts) {
    const w = W(), H = innerWidth < 600 ? 210 : 230, L = 34, R = 46, T = 14, B = 30, lo = Math.max(0, Math.floor(Math.min(...pts.flatMap((p) => [p.cgpa, p.term ?? p.cgpa])) * 2) / 2 - 0.5), hi = 4;
    const x = (i) => L + (pts.length === 1 ? (w - L - R) / 2 : (i * (w - L - R)) / (pts.length - 1)), y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo);
    const path = (k) => pts.map((p, i) => (p[k] == null ? "" : `${i && pts[i - 1][k] != null ? "L" : "M"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`)).join("");
    const ticks = []; for (let v = Math.ceil(lo * 2) / 2; v <= hi + 1e-9; v += 0.5) ticks.push(v);
    const last = pts[pts.length - 1], step = (w - L - R) / Math.max(1, pts.length - 1);
    return `<div class="viz" data-viz="line"><svg viewBox="0 0 ${w} ${H}" role="img" aria-label="CGPA and term GPA by semester">
      ${ticks.map((v) => `<line class="grid" x1="${L}" x2="${w - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v.toFixed(1)}</text>`).join("")}
      ${pts.map((p, i) => `<text class="ax" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(p.short)}</text>`).join("")}
      <path class="ln s2" d="${path("term")}"/><path class="ln s1" d="${path("cgpa")}"/>
      ${pts.map((p, i) => `${p.term != null ? `<circle class="dot s2" cx="${x(i)}" cy="${y(p.term)}" r="4"/>` : ""}<circle class="dot s1" cx="${x(i)}" cy="${y(p.cgpa)}" r="4.5"/>`).join("")}
      <text class="dl s1" x="${x(pts.length - 1) + 9}" y="${y(last.cgpa) + 4}">${f2(last.cgpa)}</text>
      <line class="xhair" x1="0" x2="0" y1="${T}" y2="${H - B}" hidden/>
      ${pts.map((p, i) => `<rect class="hit" x="${x(i) - step / 2}" y="0" width="${step}" height="${H}" data-i="${i}" data-x="${x(i)}"/>`).join("")}
    </svg><div class="tip" hidden></div></div>
    <div class="legend"><span><i class="sw s1"></i>CGPA</span><span><i class="sw s2"></i>Term GPA</span></div>`;
  }
  /* Vertical bars (one series). */
  function bars(items, { label, fmt = (v) => v, aria }) {
    const w = W(), H = 200, L = 10, R = 10, T = 18, B = 28, max = Math.max(1, ...items.map((d) => d.v)), bw = Math.min(46, ((w - L - R) / items.length) * 0.62);
    const x = (i) => L + ((i + 0.5) * (w - L - R)) / items.length, h = (v) => ((H - T - B) * v) / max;
    return `<div class="viz" data-viz="bars"><svg viewBox="0 0 ${w} ${H}" role="img" aria-label="${esc(aria)}">
      <line class="base" x1="${L}" x2="${w - R}" y1="${H - B}" y2="${H - B}"/>
      ${items.map((d, i) => `<path class="bar" d="M${x(i) - bw / 2},${H - B} v${-Math.max(0, h(d.v) - 4)} q0,-4 4,-4 h${bw - 8} q4,0 4,4 v${Math.max(0, h(d.v) - 4)} z"/>
        <text class="ax" x="${x(i)}" y="${H - 9}" text-anchor="middle">${esc(d.k)}</text>
        <rect class="hit" x="${x(i) - (w - L - R) / items.length / 2}" y="0" width="${(w - L - R) / items.length}" height="${H}" data-tip="${esc(`${d.full || d.k}: ${fmt(d.v)} ${label}`)}" data-x="${x(i)}"/>`).join("")}
      ${(() => { const i = items.reduce((m, d, k) => (d.v > items[m].v ? k : m), 0); return items[i].v ? `<text class="dl" x="${x(i)}" y="${H - B - h(items[i].v) - 6}" text-anchor="middle">${fmt(items[i].v)}</text>` : ""; })()}
    </svg><div class="tip" hidden></div></div>`;
  }
  /* Horizontal bars with a goal line (attendance vs the course's minimum). Values under the goal carry a warning label. */
  function hbars(items, { goal, aria, unit = "%" }) {
    const w = W(), rowH = 30, L = 74, R = 46, T = 6, H = T + items.length * rowH + 18, x = (v) => L + ((w - L - R) * Math.max(0, Math.min(100, v))) / 100;
    return `<div class="viz" data-viz="bars"><svg viewBox="0 0 ${w} ${H}" role="img" aria-label="${esc(aria)}">
      ${items.map((d, i) => { const y = T + i * rowH; return `<text class="ax" x="${L - 8}" y="${y + 18}" text-anchor="end">${esc(d.k)}</text>
        <path class="bar h ${d.v < (d.goal ?? goal) ? "bad" : ""}" d="M${L},${y + 6} h${Math.max(0, x(d.v) - L - 4)} q4,0 4,4 v8 q0,4 -4,4 h${-Math.max(0, x(d.v) - L - 4)} z"/>
        <text class="dl" x="${x(d.v) + 6}" y="${y + 18}">${d.v}${unit}${d.v < (d.goal ?? goal) ? " ⚠" : ""}</text>
        <rect class="hit" x="0" y="${y}" width="${w}" height="${rowH}" data-tip="${esc(d.tip || `${d.k}: ${d.v}${unit}`)}" data-x="${x(d.v)}"/>`; }).join("")}
      ${goal != null ? `<line class="thr" x1="${x(goal)}" x2="${x(goal)}" y1="${T}" y2="${H - 16}"/><text class="ax" x="${x(goal)}" y="${H - 2}" text-anchor="middle">${goal}${unit}</text>` : ""}
    </svg><div class="tip" hidden></div></div>`;
  }
  const table = (cols, rows) => `<details class="viz-table"><summary>${icon("list", "sm")} Show as a table</summary><table><thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></details>`;

  pages.insights = () => {
    const St = S(), pts = series(), g = ctx.cgpaOf(St.grades), total = Number(St.profile?.creditsTotal) || 140;
    const cgpa = g.cgpa || Number(St.profile?.cgpa) || 0, earned = Math.max(g.earned || 0, Number(St.profile?.creditsDone) || 0);
    const head = ctx.head("Analytics", "Your CGPA trend, credits, grades, attendance and study time in one place.");
    if (!St.grades.length && !cgpa && !St.routine.length) return `${head}<section class="card">${ctx.empty("icon:bars", "Nothing to chart yet", "Sync your grade report and class schedule, and your charts appear here.", `<a class="btn primary" href="#/sync">${icon("sync")} Sync portal</a>`)}</section>`;
    const prev = pts.length > 1 ? pts[pts.length - 2].cgpa : null, delta = prev != null ? cgpa - prev : null;
    const dist = ctx.GRADES.filter((x) => x.p > 0 || x.g === "F").map((x) => ({ k: x.g, v: St.grades.filter((r) => r.g === x.g).length })).filter((d, i, a) => d.v || a.slice(i).some((e) => e.v));
    const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); const key = d.toDateString(); return { k: d.toLocaleDateString("en-GB", { weekday: "short" }), full: d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" }), v: (St.study?.sessions || []).filter((s) => new Date(s.at).toDateString() === key).reduce((a, s) => a + s.min, 0) }; });
    const weekMin = days.reduce((a, d) => a + d.v, 0);
    const codes = [...new Set(St.routine.map((r) => r.code))];
    const att = codes.map((code) => { const s = ctx.attendance?.stats(code); return s && s.present + s.absent ? { code, pct: s.pct, fin: s.finalPct, min: ctx.attendance.minOf(code), s } : null; }).filter(Boolean);
    const low = att.filter((a) => a.pct < a.min), due = St.tasks.filter((t) => !t.done && ctx.daysUntil(t.due) >= 0 && ctx.daysUntil(t.due) <= 7);
    const ring = (pct, tone) => `<div class="ring sm ${tone}" style="--p:${pct}"><div><b>${pct}%</b></div></div>`;
    const best = Object.values(St.grades.reduce((m, r) => ((m[r.code] = r), m), {})).filter((r) => ctx.gradePoint(r.g) > 0).sort((a, b) => ctx.gradePoint(b.g) - ctx.gradePoint(a.g));
    const noSem = St.grades.length && !pts.length;
    return `${head}
      <section class="kpi-hero fx-rise"><i class="sheen" aria-hidden="true"></i>
        <div class="kpi-main"><span class="kpi-lbl">Current CGPA</span><b class="kpi-big num" data-count="${f2(cgpa)}">${f2(cgpa)}</b><span class="kpi-sub">out of 4.00${delta != null ? ` · <span class="kpi-delta ${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "▲" : "▼"} ${f2(Math.abs(delta))} vs last term</span>` : ""}</span></div>
        <div class="kpi-side">${[["Credits earned", `${earned} / ${total}`, Math.min(100, Math.round((100 * earned) / total))], ["Study this week", `${(weekMin / 60).toFixed(1)} h`, Math.min(100, Math.round((weekMin / (St.study?.goal * 7 || 840)) * 100))]]
          .map(([l, v, p]) => `<div class="kpi-mini"><span>${l}</span><b>${v}</b><div class="kpi-bar"><i style="width:${p}%"></i></div></div>`).join("")}</div></section>

      <div class="grid g2 mt">
        <section class="card"><div class="card-h"><h2>CGPA over time</h2><span class="pill">${pts.length} semester${pts.length === 1 ? "" : "s"}</span></div>
          ${pts.length ? lineChart(pts) + table(["Semester", "Term GPA", "CGPA", "Credits"], pts.map((p) => [p.sem, p.term != null ? f2(p.term) : "—", f2(p.cgpa), p.credits]))
            : `<p class="small muted">${noSem ? "Your grades came without semesters (from Degree Review). Sync the Grade Report and the trend appears here." : "Sync your Grade Report to see your CGPA semester by semester."}</p>`}</section>
        <section class="card"><div class="card-h"><h2>Attendance by course</h2>${att.length ? `<span class="pill ${low.length ? "red" : "green"}">${low.length ? `${low.length} below minimum` : "All on track"}</span>` : ""}</div>
          ${att.length ? hbars(att.map((a) => ({ k: a.code, v: a.pct, goal: a.min, tip: `${a.code}: ${a.pct}% now, ${a.fin}% if you attend the rest (needs ${a.min}%)` })), { goal: 70, aria: "Attendance per course against the minimum" })
            + table(["Course", "Now", "If you attend the rest", "Needs"], att.map((a) => [a.code, `${a.pct}%`, `${a.fin}%`, `${a.min}%`]))
            : `<p class="small muted">Mark classes on each course's Attendance tab (or from the calendar) and they show here.</p>`}</section>
        ${pts.length ? `<section class="card"><div class="card-h"><h2>Credits per semester</h2><span class="pill">${earned} earned</span></div>
          ${bars(pts.map((p) => ({ k: p.short, full: p.sem, v: p.credits })), { label: "credits", aria: "Credits earned per semester" })}${table(["Semester", "Credits"], pts.map((p) => [p.sem, p.credits]))}</section>` : ""}
        ${dist.length ? `<section class="card"><div class="card-h"><h2>Grade distribution</h2><span class="pill">${St.grades.length} courses</span></div>
          ${bars(dist, { label: "courses", aria: "How many courses got each grade" })}${table(["Grade", "Courses"], dist.map((d) => [d.k, d.v]))}</section>` : ""}
        ${St.degree?.length ? `<section class="card"><div class="card-h"><h2>Degree areas</h2><span class="pill">${St.degree.filter((d) => d.total && d.done >= d.total).length} of ${St.degree.filter((d) => d.total).length} complete</span></div>
          ${hbars(St.degree.filter((d) => d.total).map((d) => ({ k: d.category.split(/\s+/).slice(0, 2).join(" ").slice(0, 12) || "Other", v: Math.min(100, Math.round((100 * d.done) / d.total)), tip: `${d.category}: ${d.done} of ${d.total} credits` })), { aria: "Share of credits done in each degree area" })}
          ${table(["Area", "Done", "Needed"], St.degree.map((d) => [d.category, d.done, d.total]))}</section>` : ""}
        <section class="card"><div class="card-h"><h2>Study time, last 7 days</h2><span class="pill">${(weekMin / 60).toFixed(1)} h</span></div>
          ${weekMin ? bars(days, { label: "min", fmt: (v) => `${v}`, aria: "Minutes studied per day this week" }) : `<p class="small muted">No focus sessions this week. <a href="#/focus">Start one</a> and your study time shows here.</p>`}</section>
        ${best.length >= 3 ? `<section class="card"><div class="card-h"><h2>Your strongest and weakest</h2></div><div class="sw-list">${[...best.slice(0, 3).map((r) => [r, "up"]), ...best.slice(-3).reverse().map((r) => [r, "down"])].filter(([r], i, a) => a.findIndex(([x]) => x.code === r.code) === i).map(([r, k]) => `<a class="lrow" href="#/course?c=${encodeURIComponent(r.code)}"><span class="grade-chip">${esc(r.g)}</span><span class="body"><b>${esc(r.code)}</b><span>${esc(r.title || "")}</span></span><span class="kpi-delta ${k}">${k === "up" ? "▲ Best" : "▼ Lowest"}</span></a>`).join("")}</div></section>` : ""}
      </div>
      <h2 class="mt-l">Risk check</h2>
      <div class="grid g3 mt-s risk">
        <section class="card risk-card">${att.length ? ring(Math.round(att.reduce((a, x) => a + x.pct, 0) / att.length), low.length ? "red" : "green") : `<span class="itile purple">${icon("checkc")}</span>`}<div><b>Attendance</b><p class="small muted">${!att.length ? "Mark attendance on each course to track it." : low.length ? `${icon("alert", "sm")} Below the minimum in ${low.map((a) => a.code).join(", ")}` : `${icon("checkc", "sm")} On track in every course`}</p></div></section>
        <section class="card risk-card"><span class="itile ${due.length > 3 ? "red" : due.length ? "orange" : "green"}">${icon("clipboard")}</span><div><b>${due.length} due this week</b><p class="small muted">${due.length ? due.slice(0, 2).map((t) => esc(`${t.course} ${t.title}`)).join(" · ") : "Nothing due in the next 7 days."}</p></div></section>
        <a class="card risk-card" href="#/scholarship"><span class="itile ${cgpa >= 3.5 ? "green" : cgpa >= 2.5 ? "orange" : "red"}">${icon("trophy")}</span><div><b>${cgpa >= 3.5 ? "Scholarship range" : cgpa >= 2.5 ? "Steady" : "Needs attention"}</b><p class="small muted">See your scholarship road map and set a target.</p></div></a>
      </div>`;
  };
  /* Hover/tap tooltips: a crosshair on the line chart, a per-bar label on bar charts (any page). */
  function bindTips(el) {
    const pts = series();
    $$(".viz", el).forEach((v) => {
      const svg = v.querySelector("svg"), tip = v.querySelector(".tip"), xh = v.querySelector(".xhair");
      const show = (hit) => {
        const box = svg.getBoundingClientRect(), k = box.width / svg.viewBox.baseVal.width, px = Number(hit.dataset.x) * k;
        if (v.dataset.viz === "line") { const p = pts[Number(hit.dataset.i)]; tip.innerHTML = `<b>${esc(p.sem)}</b><span><i class="sw s1"></i>CGPA ${f2(p.cgpa)}</span>${p.term != null ? `<span><i class="sw s2"></i>Term GPA ${f2(p.term)}</span>` : ""}<span>${p.credits} credits</span>`; xh.hidden = false; xh.setAttribute("x1", hit.dataset.x); xh.setAttribute("x2", hit.dataset.x); }
        else tip.textContent = hit.dataset.tip;
        tip.hidden = false; tip.style.left = `${Math.min(Math.max(px, 70), box.width - 70)}px`;
      };
      const hide = () => { tip.hidden = true; if (xh) xh.hidden = true; };
      $$(".hit", v).forEach((h) => { h.addEventListener("pointerenter", () => show(h)); h.addEventListener("click", () => show(h)); });
      svg.addEventListener("pointerleave", hide);
    });
  }
  pages.insights.mount = (el) => { bindTips(el); ctx.countUp?.(el); };
  return { series, lineChart, bars, hbars, table, bindTips };
}
