/* Dropping a course (pure, no DOM; tested in tests/drop.test.js). EWU's academic calendar sets the refund steps:
   "Last day to Drop Course(s)/Semester with 100% / 85% / 50% Refund", then "Last day of Withdrawal" (a W grade, no
   refund). From those and the student's own data: what dropping a course today returns and what it changes. */

/* Calendar events → refund steps in date order: [{ until: "YYYY-MM-DD", refund: 0…100, grade: "" | "W", title }]. */
export function dropTiers(events = []) {
  const out = [];
  for (const e of events) {
    const until = e.end || e.start, t = String(e.title || "");
    const r = t.match(/last\s+day\s+to\s+drop\b.*?(\d{1,3})\s*%\s*refund/i);
    if (r) out.push({ until, refund: Number(r[1]), grade: "", title: t });
    else if (/last\s+day\s+(of|for)\s+withdraw/i.test(t)) out.push({ until, refund: 0, grade: "W", title: t });
  }
  return out.sort((a, b) => a.until.localeCompare(b.until) || b.refund - a.refund);
}

/* Where today falls: { tier, next, closed, daysLeft }. `tier` is the step in force (the first one not yet past). */
export function dropWindow(tiers = [], today) {
  const i = tiers.findIndex((t) => t.until >= today);
  if (i < 0) return { tier: null, next: null, closed: tiers.length > 0, daysLeft: 0 };
  const days = Math.round((Date.parse(tiers[i].until + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 864e5);
  return { tier: tiers[i], next: tiers[i + 1] || null, closed: false, daysLeft: days };
}

/* What dropping `code` changes. courses: this semester's [{ code, cr }]; fees: { tuition } for the semester;
   rules: { minCredit }; curriculum: [{ code, title, prereq }]; creditsLeft before the drop; perSem: credits a semester. */
export function dropImpact({ code, courses = [], tier, fees = {}, rules = {}, curriculum = [], creditsLeft = 0, perSem = 15 }) {
  const course = courses.find((c) => c.code === code) || { code, cr: 0 };
  const cr = Number(course.cr) || 0, total = courses.reduce((a, c) => a + (Number(c.cr) || 0), 0), after = total - cr;
  const tuition = Number(fees.tuition) || 0, refund = tier ? tier.refund : 0;
  // Tuition is charged per credit, so a course's share is its credits over the semester's.
  const amount = tuition && total ? Math.round(((tuition * cr) / total) * (refund / 100)) : null;
  const sems = (n) => Math.ceil(Math.max(0, n) / Math.max(1, perSem));
  return {
    code, cr, credits: { before: total, after }, refund, amount, grade: tier?.grade || "",
    belowMin: Number(rules.minCredit) > 0 && after < Number(rules.minCredit) ? Number(rules.minCredit) : 0,
    delay: sems(creditsLeft + cr) - sems(creditsLeft),
    unlocks: curriculum.filter((c) => (c.prereq || []).includes(code)).map((c) => c.code)
  };
}
