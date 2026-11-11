/* Dropping a course (pure, no DOM; tested in tests/drop.test.ts). EWU's academic calendar sets the refund steps:
   "Last day to Drop Course(s)/Semester with 100% / 85% / 50% Refund", then "Last day of Withdrawal" (a W grade, no
   refund). From those and the student's own data: what dropping a course today returns and what it changes. */

/** A calendar event as /api/calendar returns it. Dates are "YYYY-MM-DD". */
export interface CalendarEvent { start: string; end?: string; title?: string; kind?: string }
/** One refund step: until this day, dropping returns `refund`% (or gives a W). */
export interface Tier { until: string; refund: number; grade: "" | "W"; title: string }
export interface DropWindow { tier: Tier | null; next: Tier | null; closed: boolean; daysLeft: number }
export interface Course { code: string; cr?: number | string; title?: string; prereq?: string[] }
export interface DropImpact {
  code: string; cr: number; credits: { before: number; after: number }; refund: number; amount: number | null;
  grade: "" | "W"; belowMin: number; delay: number; unlocks: string[];
}

/** Calendar events → refund steps in date order. */
export function dropTiers(events: CalendarEvent[] = []): Tier[] {
  const out: Tier[] = [];
  for (const e of events) {
    const until = e.end || e.start, t = String(e.title || "");
    const r = t.match(/last\s+day\s+to\s+drop\b.*?(\d{1,3})\s*%\s*refund/i);
    if (r) out.push({ until, refund: Number(r[1]), grade: "", title: t });
    else if (/last\s+day\s+(of|for)\s+withdraw/i.test(t)) out.push({ until, refund: 0, grade: "W", title: t });
  }
  return out.sort((a, b) => a.until.localeCompare(b.until) || b.refund - a.refund);
}

/** Where today falls: the step in force (the first one not yet past), the next one and days left. */
export function dropWindow(tiers: Tier[] = [], today: string): DropWindow {
  const i = tiers.findIndex((t) => t.until >= today);
  if (i < 0) return { tier: null, next: null, closed: tiers.length > 0, daysLeft: 0 };
  const days = Math.round((Date.parse(tiers[i].until + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 864e5);
  return { tier: tiers[i], next: tiers[i + 1] || null, closed: false, daysLeft: days };
}

interface ImpactInput {
  code: string; courses?: Course[]; tier?: Pick<Tier, "refund" | "grade"> | null; fees?: { tuition?: number | string };
  rules?: { minCredit?: number | string }; curriculum?: Course[]; creditsLeft?: number; perSem?: number;
}

/** What dropping `code` changes: refund, credit load, minimum load, graduation delay and courses that need it. */
export function dropImpact({ code, courses = [], tier, fees = {}, rules = {}, curriculum = [], creditsLeft = 0, perSem = 15 }: ImpactInput): DropImpact {
  const course = courses.find((c) => c.code === code) || { code, cr: 0 };
  const cr = Number(course.cr) || 0, total = courses.reduce((a, c) => a + (Number(c.cr) || 0), 0), after = total - cr;
  const tuition = Number(fees.tuition) || 0, refund = tier ? tier.refund : 0;
  // Tuition is charged per credit, so a course's share is its credits over the semester's.
  const amount = tuition && total ? Math.round(((tuition * cr) / total) * (refund / 100)) : null;
  const sems = (n: number) => Math.ceil(Math.max(0, n) / Math.max(1, perSem));
  const min = Number(rules.minCredit) || 0;
  return {
    code, cr, credits: { before: total, after }, refund, amount, grade: tier?.grade || "",
    belowMin: min > 0 && after < min ? min : 0,
    delay: sems(creditsLeft + cr) - sems(creditsLeft),
    unlocks: curriculum.filter((c) => (c.prereq || []).includes(code)).map((c) => c.code)
  };
}
