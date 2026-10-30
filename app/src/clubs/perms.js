/* EWUdiots Club: permission keys and the default positions. The database is the authority (club_role_template in
   supabase/migrations/0018_club_platform.sql, public.club_can); the app uses this list only to decide what to show.
   tests/clubs.test.js checks that every key here appears in the migrations, so the two can't drift apart. */

/** @typedef {"posts.write"|"posts.publish_public"|"events.manage"|"events.checkin"|"forms.create"|"forms.view_responses"|"forms.export"|"recruitment.evaluate"|"members.invite"|"members.approve"|"members.promote"|"members.remove"|"attendance.take"|"polls.create"|"elections.manage"|"tasks.manage"|"projects.manage"|"meetings.manage"|"docs.manage"|"resources.manage"|"chat.manage"|"finance.view"|"finance.edit"|"certs.issue"|"comments.moderate"|"analytics.view"|"audit.view"|"settings.edit"|"features.edit"|"store.manage"|"orders.manage"|"payments.verify"|"refunds.approve"|"sponsors.manage"|"collab.manage"} ClubPerm */

/** Every club permission, grouped for the roles editor. */
export const PERM_GROUPS = [
  ["Posts & events", [["posts.write", "Write posts and announcements"], ["posts.publish_public", "Publish posts everyone can see"], ["comments.moderate", "Hide comments"], ["events.manage", "Create and edit events"], ["events.checkin", "Check people in at events"]]],
  ["Recruitment & forms", [["forms.create", "Create registration forms"], ["forms.view_responses", "See responses (with phone numbers)"], ["forms.export", "Export responses to CSV"], ["recruitment.evaluate", "Score applicants"]]],
  ["Members", [["members.invite", "Invite members"], ["members.approve", "Accept join requests, see contact details"], ["members.promote", "Give positions, titles and wings"], ["members.remove", "Remove members"]]],
  ["Workspace", [["attendance.take", "Take attendance"], ["meetings.manage", "Plan meetings and minutes"], ["projects.manage", "Run projects"], ["tasks.manage", "Assign tasks"], ["docs.manage", "Manage documents"], ["resources.manage", "Manage the resource library"], ["chat.manage", "Create channels, pin and remove messages"], ["certs.issue", "Issue certificates"]]],
  ["Polls & elections", [["polls.create", "Create polls"], ["elections.manage", "Run elections (with a President-rank officer)"]]],
  ["Money & store", [["finance.view", "See the finance book"], ["finance.edit", "Edit the finance book"], ["store.manage", "Products, stock and store settings"], ["orders.manage", "Process orders and pickups"], ["payments.verify", "Verify payments (TrxID)"], ["refunds.approve", "Send refunds"]]],
  ["Partners", [["sponsors.manage", "Sponsors and packages"], ["collab.manage", "Collaborations with other clubs"]]],
  ["Admin", [["analytics.view", "See club analytics"], ["audit.view", "See the audit log"], ["settings.edit", "Edit the club profile"], ["features.edit", "Switch club features on or off"]]]
];
/** @type {ClubPerm[]} */
export const CLUB_PERMS = PERM_GROUPS.flatMap(([, list]) => list.map(([k]) => k));

/** Default positions (club_role_template). Several positions can share a rank; 1 is the most senior. */
export const DEFAULT_ROLES = [
  { rank: 1, name: "Faculty Advisor", color: "orange" }, { rank: 2, name: "Club Admin", color: "purple" },
  { rank: 3, name: "President", color: "blue" }, { rank: 3, name: "Vice President", color: "blue" }, { rank: 3, name: "General Secretary", color: "pink" }, { rank: 3, name: "Treasurer", color: "green" },
  { rank: 4, name: "Executive Member", color: "teal" }, { rank: 4, name: "Wing Head", color: "teal" },
  { rank: 5, name: "Moderator", color: "pink" }, { rank: 5, name: "Merch Manager", color: "orange" },
  { rank: 6, name: "Senior Member", color: "green" }, { rank: 7, name: "General Member", color: "gray" }
];
/** Rank names for filters ("Executives" etc.). */
export const RANK_GROUPS = { 1: "Advisors", 2: "Admins", 3: "Officers", 4: "Executives", 5: "Moderators", 6: "Senior members", 7: "General members" };
const RANK_TONE = { 1: "orange", 2: "purple", 3: "blue", 4: "teal", 5: "pink", 6: "green", 7: "gray" };
export const rankTone = (rank) => RANK_TONE[rank] || "gray";
/** Ranks 1–3 run the club ("committee"); 1–4 appear on the public profile. */
export const isCommittee = (rank) => rank <= 3;

/**
 * @param {{ perms?: string[], status?: string } | null | undefined} membership a row from my_clubs()
 * @param {ClubPerm} perm
 */
export const has = (membership, perm) => !!membership && membership.status === "active" && (membership.perms?.includes("*") || membership.perms?.includes(perm));
/** Can this membership open the Manage console at all? */
export const canManage = (m) => !!m && m.status === "active" && (m.rank <= 4 || CLUB_PERMS.some((p) => has(m, p)));
/** Roles this person may hand out: below their own rank (Club Admins may add co-admins), only with permissions they hold. */
export function assignableRoles(m, roles) {
  if (!m) return [];
  const mine = m.perms || [], all = mine.includes("*");
  return roles.filter((r) => r.rank >= 2 && (m.rank === 1 || r.rank > m.rank || (m.rank === 2 && r.rank === 2)) && (all || (!r.perms.includes("*") && r.perms.every((p) => mine.includes(p)))))
    .sort((a, b) => a.rank - b.rank || a.sort - b.sort);
}
/** @deprecated rank-only list, kept for the v2.13 tests. */
export const assignableRanks = (myRank) => [...new Map(DEFAULT_ROLES.map((r) => [r.rank, r])).values()].filter((r) => r.rank >= 2 && (r.rank > myRank || (myRank <= 2 && r.rank === myRank)));
export const RANKS = [...new Map(DEFAULT_ROLES.map((r) => [r.rank, { ...r, tone: rankTone(r.rank) }])).values()];

/** Club features (clubs.features), with what each switches on. */
export const FEATURES = {
  events: ["Events", "calendar", "Events, registrations and check-in"], recruitment: ["Recruitment", "userpen", "Applications, interviews and scores"],
  chat: ["Chat", "chat", "Channels and direct messages for members"], meetings: ["Meetings", "clipboard", "Agendas, minutes and action items"],
  projects: ["Projects", "kanban", "Project boards with tasks"], resources: ["Resources", "folder", "Shared files and templates"],
  polls: ["Polls", "bars", "Quick polls for members"], elections: ["Elections", "ballot", "Committee elections with candidates"],
  finance: ["Finance", "wallet", "Budgets, income and expenses"], store: ["Merch store", "bag", "Sell club merchandise"],
  sponsors: ["Sponsors", "handshake", "Sponsor directory and packages"], collab: ["Collaborations", "community", "Joint events with other clubs"]
};
export const featureOn = (m, f) => !!m?.features?.[f];

export const CATEGORIES = { tech: "Tech", business: "Business", arts: "Arts & culture", social: "Social work", debate: "Debate & language", sports: "Sports", science: "Science", other: "Other" };
export const JOIN_MODES = { open: "Anyone can join", apply: "Apply to join", invite: "Invitation only" };
export const AUDIENCES = { public: "Everyone", members: "Members", wing: "One wing", exec: "Executives" };
