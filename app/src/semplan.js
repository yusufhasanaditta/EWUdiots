/* Semester planning from the EWU academic calendar and the student's routine (pure, no DOM; tested in
   tests/semplan.test.js):
   - which days are off (holidays, breaks, suspended classes) and which run another weekday's routine
     ("Regular Tuesday Classes" on a Sunday),
   - every class session of a course this semester, numbered 1…N, for class-by-class attendance,
   - attendance from per-class marks (present / absent / cancelled) and what missing more would do,
   - "long weekends": class days that, if skipped, join days off into a longer break, and the attendance cost.
   Dates are "YYYY-MM-DD" (Dhaka calendar days). Weekdays: 0 Sunday … 6 Saturday, as Date.getDay(). */
export const LETTER_DAY = { S: 0, M: 1, T: 2, W: 3, R: 4, F: 5, A: 6 };
const WEEKDAY = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const DAY = 864e5;
export const iso = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
export const addDays = (day, n) => iso(new Date(day + "T12:00:00").getTime() + n * DAY);
export const dow = (day) => new Date(day + "T12:00:00").getDay();
const covers = (e, day) => day >= e.start && day <= (e.end || e.start);

/* Calendar events of one semester (from /api/calendar) → helpers for that semester's days. */
export function dayRules(events = []) {
  const off = events.filter((e) => e.kind === "holiday" || e.kind === "break" || /semester break|vacation|suspen/i.test(e.title));
  const swaps = events.map((e) => { const m = e.title.match(/regular\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+classes/i); return m ? { ...e, as: WEEKDAY[m[1].toLowerCase()] } : null; }).filter(Boolean);
  return {
    offReason: (day) => { const e = off.find((x) => covers(x, day)); return e ? e.title.replace(/^Holiday:\s*/i, "") : ""; },
    isOff: (day) => off.some((x) => covers(x, day)),
    // The weekday whose routine runs on this day (a make-up day runs another weekday's classes).
    runs: (day) => { const s = swaps.find((x) => covers(x, day)); return s ? s.as : dow(day); }
  };
}

/* First and last day of classes: the calendar's own dates, else the portal's semester dates, else a guess. */
export function classRange(sem, events = [], semDates = {}) {
  const first = events.find((e) => /^first day of classes$/i.test(e.title.trim()))?.start;
  const last = events.find((e) => /^last day of classes$/i.test(e.title.trim()))?.start;
  const d = semDates[sem] || {};
  const m = String(sem).match(/(Spring|Summer|Fall)-(\d{4})/);
  const guess = m ? { Spring: [`${m[2]}-01-12`, `${m[2]}-04-24`], Summer: [`${m[2]}-05-18`, `${m[2]}-08-21`], Fall: [`${m[2]}-09-13`, `${m[2]}-12-10`] }[m[1]] : ["", ""];
  return { start: first || d.start || guess[0], end: last || (d.end ? addDays(d.end, -10) : "") || guess[1], exact: Boolean(first && last) };
}

/* Every session of one course (all its routine rows: theory and lab) between start and end, numbered 1…N.
   Off days are kept (off: reason) so the list can show "Durga Puja: no class", but they don't get a number. */
export function sessionsOf(rows, range, rules) {
  const out = [];
  if (!range.start || !range.end || !rows.length) return out;
  let n = 0;
  for (let day = range.start; day <= range.end; day = addDays(day, 1)) {
    const wd = rules.runs(day), reason = rules.offReason(day);
    const today = rows.filter((r) => [...String(r.days || "").toUpperCase()].some((c) => LETTER_DAY[c] === wd)).sort((a, b) => String(a.start).localeCompare(String(b.start)));
    for (const r of today) out.push({ key: `${day}|${r.start}`, date: day, start: r.start, end: r.end, room: r.room || "", lab: Boolean(r.lab), off: reason, n: reason ? 0 : ++n });
  }
  return out;
}

/* Attendance from marks { "date|start": "p" | "a" | "c" } over the sessions. Cancelled classes don't count.
   min: the share needed (0.7 = 70%). */
export function attendance(sessions, marks = {}, today = iso(Date.now()), min = 0.7) {
  const real = sessions.filter((s) => !s.off && marks[s.key] !== "c");
  const p = real.filter((s) => marks[s.key] === "p").length, a = real.filter((s) => marks[s.key] === "a").length;
  const cancelled = sessions.filter((s) => !s.off && marks[s.key] === "c").length;
  const past = real.filter((s) => s.date <= today), unmarked = past.filter((s) => !marks[s.key]).length;
  const total = real.length, left = real.filter((s) => s.date > today && !marks[s.key]).length;
  // Absences allowed in the whole semester to finish at `min`, counting unmarked past classes as attended.
  const maxAbsent = Math.floor(total * (1 - min) + 1e-9), canMiss = Math.max(0, maxAbsent - a);
  return { present: p, absent: a, cancelled, unmarked, total, left, held: p + a, pct: p + a ? Math.round((100 * p) / (p + a)) : null,
    finalPct: total ? Math.round((100 * (total - a)) / total) : null, canMiss, maxAbsent, next: real.find((s) => s.date >= today && !marks[s.key]) || null };
}
/* What the final attendance would be after missing `k` more classes (everything else attended). */
export const ifMissed = (st, k) => (st.total ? Math.round((100 * (st.total - st.absent - k)) / st.total) : null);

/* Long breaks: runs of days with no classes for this student (weekends, holidays, days without their classes), and the
   class days that would join two runs into a longer one if skipped. → [{ skip: [days], from, to, days, cost: [{ code, k }] }] */
export function longBreaks(blocksByDay, from, to, rules, { maxSkip = 2, minDays = 4 } = {}) {
  const free = (day) => rules.isOff(day) || !(blocksByDay(rules.runs(day)) || []).length;
  const best = new Map();
  for (let day = from; day <= to; day = addDays(day, 1)) {
    if (free(day)) continue;
    for (let k = 1; k <= maxSkip; k++) {
      const skip = [...Array(k)].map((_, i) => addDays(day, i));
      if (skip.some(free) || skip[k - 1] > to) break;
      const off = (d) => skip.includes(d) || free(d);
      let a = day; while (off(addDays(a, -1)) && a > addDays(from, -14)) a = addDays(a, -1);
      let b = skip[k - 1]; while (off(addDays(b, 1)) && b < addDays(to, 14)) b = addDays(b, 1);
      const len = Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / DAY) + 1;
      if (len < minDays || len - k < 2) continue;
      const key = a + b, old = best.get(key);
      if (old && old.skip.length <= k) continue;
      const cost = new Map();
      for (const s of skip) for (const bl of blocksByDay(rules.runs(s)) || []) cost.set(bl.code, (cost.get(bl.code) || 0) + 1);
      const why = [...new Set([...Array(len)].map((_, i) => rules.offReason(addDays(a, i))).filter(Boolean))];
      best.set(key, { skip, from: a, to: b, days: len, why, cost: [...cost].map(([code, n]) => ({ code, k: n })) });
    }
  }
  // Best first: most days off per skipped day, then soonest.
  return [...best.values()].sort((x, y) => y.days / y.skip.length - x.days / x.skip.length || x.from.localeCompare(y.from));
}
