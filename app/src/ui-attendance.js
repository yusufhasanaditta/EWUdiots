/* Attendance estimator for one course (course page → Attendance, and Marks & attendance): every class of the semester
   from the routine and EWU's calendar (holidays skipped, make-up days added), picked by date or by class number and
   marked Present / Absent / Cancelled; where you will finish, how many more you can miss, and "what if I miss k more"
   bars against your course's minimum. Marks live in S.attendance[code].marks { "date|start": "p"|"a"|"c" }; held and
   missed are kept in step for older screens. Without a routine with dates it falls back to simple counters. */
import { attendance, ifMissed, iso } from "./semplan.js";

export function install(ctx) {
  const { icon, esc, $, $$ } = ctx;
  const S = () => ctx.S;
  const pick = {}; // per course: { mode: "date" | "n", date, n }
  const today = () => iso(Date.now());
  const recOf = (code) => (S().attendance[code] = S().attendance[code] || { held: 0, missed: 0 });
  const minOf = (code) => Number(S().attendance[code]?.min) || 70;
  const sessions = (code, sem) => (ctx.acal?.sessionsFor ? ctx.acal.sessionsFor(code, sem) : []);
  const fmtD = (d, o = { weekday: "short", day: "numeric", month: "short" }) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", o);

  /* Numbers for a course: from per-class marks when the semester's classes are known, else the old counters. */
  function stats(code, sem) {
    const ss = sessions(code, sem), a = S().attendance[code] || {};
    if (ss.length) return { ...attendance(ss, a.marks || {}, today(), minOf(code) / 100), sessions: ss };
    const held = a.held || 0, missed = a.missed || 0, total = a.planned || 26;
    return { present: held - missed, absent: missed, cancelled: 0, held, total, left: Math.max(0, total - held), pct: held ? Math.round((100 * (held - missed)) / held) : null,
      finalPct: Math.round((100 * (total - missed)) / total), canMiss: Math.max(0, Math.floor(total * (1 - minOf(code) / 100)) - missed), sessions: [], legacy: true };
  }
  function syncCounts(code) {
    const a = recOf(code), m = Object.values(a.marks || {});
    a.held = m.filter((v) => v === "p" || v === "a").length; a.missed = m.filter((v) => v === "a").length;
  }
  /* Mark one class; marking the same value again clears it. */
  function mark(code, key, v) {
    const a = recOf(code); a.marks = a.marks || {};
    const was = a.marks[key];
    if (was === v) delete a.marks[key]; else a.marks[key] = v;
    syncCounts(code);
    if (!was && (v === "p" || v === "a")) ctx.study.award(3, "", true);
    ctx.save(); ctx.rerender();
  }
  /* The Present / Absent buttons on Home and the old quick bar: today's class, else the latest unmarked one. */
  function quick(code, kind) {
    const ss = sessions(code).filter((s) => !s.off && s.date <= today()), marks = S().attendance[code]?.marks || {};
    const s = ss.filter((x) => x.date === today() && !marks[x.key])[0] || ss.filter((x) => !marks[x.key]).pop();
    if (!s) return false;
    mark(code, s.key, kind === "absent" ? "a" : "p");
    return true;
  }

  function legacyPanel(code, st) {
    const a = S().attendance[code] || {};
    return `<section class="card"><div class="row nowrap" style="gap:18px">${ring(st.pct, code)}<div class="grow">${strip(st)}</div></div>
      <div class="row mt"><button class="btn primary grow" data-att="present">${icon("check")} Present</button><button class="btn danger-soft grow" data-att="absent">${icon("x")} Absent</button><button class="btn neutral" data-att="undo" aria-label="Undo last">${icon("reset")}</button></div></section>
      <div class="alert purple mt">${icon("info")}<div><b>Sync your class schedule for class-by-class attendance</b><p>With your routine and EWU's calendar we list every class (holidays skipped), so you can mark any date or class number.</p></div></div>
      <section class="card mt stack"><h3>Plan ahead</h3><label class="field">Classes planned this semester<input class="input" type="number" id="a-planned" min="1" max="60" value="${a.planned || 26}"></label>
        <div class="alert ${st.canMiss > 2 ? "green" : st.canMiss > 0 ? "amber" : "red"}"><span class="a-ic">${icon("calendar")}</span><div><b>You can miss ${st.canMiss} more class${st.canMiss === 1 ? "" : "es"}</b><p>…and still finish at ${minOf(code)}%+.</p></div></div></section>`;
  }
  const ring = (pct, code) => `<div class="ring lg ${pct !== null && pct < minOf(code) ? "red" : "green"}" style="--p:${pct ?? 0}"><div><b>${pct ?? "—"}${pct !== null ? "%" : ""}</b><span>Attendance</span></div></div>`;
  const strip = (st) => `<div class="att-stats">${[["Present", st.present, "ok"], ["Absent", st.absent, "bad"], ["Cancelled", st.cancelled, "mut"], ["Left", st.left, ""]].map(([l, v, c]) => `<div class="${c}"><b class="num">${v}</b><span>${l}</span></div>`).join("")}</div>`;

  function panel(code, sem) {
    const st = stats(code, sem);
    if (st.legacy) return legacyPanel(code, st);
    const marks = S().attendance[code]?.marks || {}, min = minOf(code), ss = st.sessions, real = ss.filter((s) => !s.off);
    const p = (pick[code] = pick[code] || { mode: "date", date: real.find((s) => s.date >= today())?.date || real[real.length - 1]?.date || today(), n: null });
    const sel = p.mode === "n" ? real.filter((s) => s.n === Number(p.n || real.find((x) => x.date >= today())?.n || 1)) : ss.filter((s) => s.date === p.date);
    const offDay = p.mode === "date" && !sel.length ? ctx.acal?.offReason?.(p.date) : "";
    const tone = st.finalPct === null ? "" : st.finalPct >= min + 5 ? "green" : st.finalPct >= min ? "amber" : "red";
    const what = [...Array(Math.min(8, Math.max(4, st.canMiss + 3)))].map((_, k) => ({ k, v: ifMissed(st, k) }));
    const H = 120;
    return `<section class="card att-hero"><div class="row nowrap" style="gap:18px">${ring(st.pct, code)}<div class="grow min0">${strip(st)}
        <p class="small mt-s">${st.unmarked ? `${icon("alert", "sm")} ${st.unmarked} past class${st.unmarked === 1 ? "" : "es"} not marked yet. ` : ""}Attend the rest and you finish at <b>${st.finalPct}%</b>.</p></div></div>
      <div class="alert ${tone} mt-s">${icon(tone === "red" ? "alertc" : "calendar")}<div><b>${st.canMiss ? `You can miss ${st.canMiss} more class${st.canMiss === 1 ? "" : "es"}` : st.finalPct >= min ? "No more absences to spare" : `Below ${min}% even if you attend everything`}</b><p>${st.total} classes this semester (holidays and cancelled classes don't count). Your course needs ${min}%.</p></div></div></section>

    <section class="card mt att-card"><div class="card-h"><h2>${icon("checksq")} Mark a class</h2>${ctx.seg([["date", "By date"], ["n", "By class no."]], p.mode, "data-amode")}</div>
      ${p.mode === "date" ? `<label class="field">Date<input class="input" type="date" id="att-date" value="${p.date}" min="${ss[0]?.date || ""}" max="${ss[ss.length - 1]?.date || ""}"></label>`
        : `<label class="field">Class<select class="select" id="att-n">${real.map((s) => `<option value="${s.n}" ${sel[0]?.n === s.n ? "selected" : ""}>Class ${s.n} · ${fmtD(s.date)}${s.lab ? " · Lab" : ""}</option>`).join("")}</select></label>`}
      <div class="stack mt-s">${sel.map((s) => s.off ? `<div class="cg-off-banner"><span class="itile red">${icon("sun")}</span><div><b>${esc(ctx.acal.short(s.off))}</b><p class="small">Holiday: no ${esc(code)} class on ${fmtD(s.date)}.</p></div></div>`
        : `<div class="att-row"><div class="min0"><b>Class ${s.n}${s.lab ? " · Lab" : ""}</b><span class="xs">${fmtD(s.date, { weekday: "long", day: "numeric", month: "short" })} · ${ctx.fmt12(ctx.toMin(s.start))} · ${esc(s.room || "")}${s.date > today() ? " · upcoming" : ""}</span></div>
          <div class="att-pick lg" role="group" aria-label="Class ${s.n}">${[["p", "Present", "check"], ["a", "Absent", "x"], ["c", "Cancelled", "minus"]].map(([k, l, ic]) => `<button class="ap ${k}" data-amark="${esc(s.key)}|${k}" aria-pressed="${marks[s.key] === k}">${icon(ic, "sm")}<span>${l}</span></button>`).join("")}</div></div>`).join("")
        || `<p class="small muted">${offDay ? `${esc(ctx.acal.short(offDay))}: holiday.` : `No ${esc(code)} class on ${fmtD(p.date, { weekday: "long", day: "numeric", month: "short" })}.`}</p>`}</div></section>

    <section class="card mt att-card"><div class="card-h"><h2>${icon("percent")} If I miss more…</h2><label class="row nowrap xs" style="gap:6px">Course needs<select class="select sm" id="att-min">${[60, 70, 75, 80, 85].map((v) => `<option value="${v}" ${v === min ? "selected" : ""}>${v}%</option>`).join("")}</select></label></div>
      <div class="viz att-what" data-viz="bars"><svg viewBox="0 0 ${what.length * 52} ${H + 34}" role="img" aria-label="Final attendance after missing more classes">
        <line class="thr" x1="0" x2="${what.length * 52}" y1="${H - (H * min) / 100 + 8}" y2="${H - (H * min) / 100 + 8}"/><text class="ax" x="2" y="${H - (H * min) / 100 + 2}">${min}% needed</text>
        ${what.map((d, i) => { const h = Math.max(2, (H * Math.max(0, d.v)) / 100); return `<path class="bar ${d.v < min ? "bad" : ""}" d="M${i * 52 + 12},${H + 8} v${-h + 4} q0,-4 4,-4 h20 q4,0 4,4 v${h - 4} z"/><text class="dl" x="${i * 52 + 26}" y="${H + 4 - h}" text-anchor="middle">${d.v}%</text><text class="ax" x="${i * 52 + 26}" y="${H + 26}" text-anchor="middle">${d.k === 0 ? "none" : `+${d.k}`}</text>`; }).join("")}
      </svg></div><p class="xs">Final attendance if you miss that many more classes and attend the rest.</p></section>

    <section class="card mt"><div class="card-h"><h2>${icon("grid")} Class by class</h2><span class="xs">${real.length} classes</span></div>
      <div class="att-chips">${ss.map((s) => s.off ? `<span class="att-chip off" title="${esc(ctx.acal.short(s.off))}, ${fmtD(s.date)}">H</span>`
        : `<button class="att-chip ${marks[s.key] || (s.date <= today() ? "todo" : "")}" data-achip="${s.n}" title="Class ${s.n}, ${fmtD(s.date)}: ${{ p: "present", a: "absent", c: "cancelled" }[marks[s.key]] || (s.date <= today() ? "not marked" : "upcoming")}">${s.n}</button>`).join("")}</div>
      <div class="cg-legend mt-s"><span><i class="att-k p"></i>Present</span><span><i class="att-k a"></i>Absent</span><span><i class="att-k c"></i>Cancelled</span><span><i class="att-k todo"></i>Not marked</span><span><i class="att-k off"></i>Holiday</span></div></section>`;
  }

  function mount(el, code) {
    $$("[data-att]", el).forEach((b) => b.addEventListener("click", () => ctx.markAttendance(code, b.dataset.att)));
    $("#a-planned", el)?.addEventListener("change", (e) => { recOf(code).planned = Number(e.target.value) || 26; ctx.save(); ctx.rerender(); });
    const p = () => (pick[code] = pick[code] || { mode: "date", date: today() });
    $$("[data-amode]", el).forEach((b) => b.addEventListener("click", () => { p().mode = b.dataset.amode; ctx.rerender(); }));
    $("#att-date", el)?.addEventListener("change", (e) => { if (e.target.value) { p().date = e.target.value; ctx.rerender(); } });
    $("#att-n", el)?.addEventListener("change", (e) => { p().n = e.target.value; ctx.rerender(); });
    $("#att-min", el)?.addEventListener("change", (e) => { recOf(code).min = Number(e.target.value); ctx.save(); ctx.rerender(); });
    $$("[data-amark]", el).forEach((b) => b.addEventListener("click", () => { const [date, start, v] = b.dataset.amark.split("|"); mark(code, `${date}|${start}`, v); }));
    $$("[data-achip]", el).forEach((b) => b.addEventListener("click", () => { Object.assign(p(), { mode: "n", n: b.dataset.achip }); ctx.rerender(); }));
  }
  return { stats, mark, quick, panel, mount, minOf };
}
