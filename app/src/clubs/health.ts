/* Club health score (pure; tested in tests/clubhealth.test.ts): one 0–100 number a club lead can act on, from the
   aggregates public.club_analytics already returns. Five parts, each 0–20:
   - Engagement: active members this month out of all members (60%+ = full marks)
   - Growth: members now vs the previous period (+10% or more = full; shrinking scores low)
   - Events: events this period vs the previous one, and at least two a month on average
   - Turnout: participants this period vs the previous one
   - Voice: posts this period vs the previous one
   Each part also yields a one-line tip when it is weak, so the score always says what to do next. */
export interface ClubStats {
  members: number; members_prev?: number; events?: number; events_prev?: number;
  participants?: number; participants_prev?: number; posts?: number; posts_prev?: number;
  growth?: { active?: number }[];
}
export interface HealthPart { key: string; label: string; score: number; tip: string }
export interface Health { score: number; grade: "Thriving" | "Healthy" | "Needs care" | "At risk"; parts: HealthPart[] }

const clamp = (n: number, lo = 0, hi = 20): number => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo);
// Trend part: 10 points for holding steady, +/- by % change (±50% reaches the ends).
const trend = (now = 0, before = 0): number => (before > 0 ? clamp(10 + (20 * (now - before)) / before) : now > 0 ? 16 : 6);

export function clubHealth(a: ClubStats): Health {
  const members = Math.max(0, Number(a.members) || 0), active = Number(a.growth?.at(-1)?.active) || 0;
  const engaged = members ? active / members : 0;
  const parts: HealthPart[] = [
    { key: "engagement", label: "Engagement", score: clamp((engaged / 0.6) * 20), tip: "Invite quiet members back: run a small hangout or post a poll." },
    { key: "growth", label: "Growth", score: clamp(trend(members, a.members_prev) + (members >= 30 ? 2 : 0)), tip: "Open a recruitment form and share it on the club feed." },
    { key: "events", label: "Events", score: clamp(trend(a.events, a.events_prev) + ((a.events || 0) >= 2 ? 3 : 0)), tip: "Plan at least two events a month, even short ones." },
    { key: "turnout", label: "Turnout", score: clamp(trend(a.participants, a.participants_prev)), tip: "Use QR check-in and send a reminder the day before." },
    { key: "voice", label: "Voice", score: clamp(trend(a.posts, a.posts_prev)), tip: "Post weekly: event photos, results and shout-outs." }
  ].map((p) => ({ ...p, score: Math.round(p.score) }));
  const score = Math.round(parts.reduce((s, p) => s + p.score, 0));
  const grade = score >= 80 ? "Thriving" : score >= 60 ? "Healthy" : score >= 40 ? "Needs care" : "At risk";
  return { score, grade, parts };
}

/** Running balance per month (income − expense, carried over), for the finance "where the money went" chart. */
export function runningBalance(months: { m: string; income: number | string; expense: number | string }[]): { m: string; net: number; balance: number }[] {
  let bal = 0;
  return months.map((x) => { const net = (Number(x.income) || 0) - (Number(x.expense) || 0); bal += net; return { m: x.m, net, balance: bal }; });
}
