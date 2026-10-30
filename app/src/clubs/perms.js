/* EWUdiots Club: permission keys and default ranks. The database is the authority (supabase/migrations/0016_clubs.sql,
   public.club_can); the app uses this list only to decide what to show. tests/clubs.test.js checks that every key here
   appears in the migration, so the two can't drift apart. */

/** @typedef {"posts.write"|"posts.publish_public"|"events.manage"|"forms.create"|"forms.view_responses"|"forms.export"|"members.invite"|"members.approve"|"members.promote"|"members.remove"|"attendance.take"|"polls.create"|"tasks.manage"|"docs.manage"|"finance.view"|"finance.edit"|"certs.issue"|"comments.moderate"|"settings.edit"|"audit.view"} ClubPerm */

/** Every club permission, grouped for the roles editor. */
export const PERM_GROUPS = [
  ["Posts & events", [["posts.write", "Write posts and announcements"], ["posts.publish_public", "Publish posts everyone can see"], ["events.manage", "Create and edit events"], ["comments.moderate", "Hide comments"]]],
  ["Forms", [["forms.create", "Create registration forms"], ["forms.view_responses", "See responses (with phone numbers)"], ["forms.export", "Export responses to CSV"]]],
  ["Members", [["members.invite", "Invite members"], ["members.approve", "Accept join requests"], ["members.promote", "Change roles, titles and wings"], ["members.remove", "Remove members"]]],
  ["Members' space", [["attendance.take", "Take attendance"], ["polls.create", "Create polls"], ["tasks.manage", "Assign tasks"], ["docs.manage", "Manage documents"], ["certs.issue", "Issue certificates"]]],
  ["Admin", [["finance.view", "See the finance log"], ["finance.edit", "Edit the finance log"], ["audit.view", "See the audit log"], ["settings.edit", "Edit the club profile and settings"]]]
];
/** @type {ClubPerm[]} */
export const CLUB_PERMS = PERM_GROUPS.flatMap(([, list]) => list.map(([k]) => k));

/** Default ranks (1 is the most senior). Names can be changed per club. */
export const RANKS = [
  { rank: 1, name: "Faculty Advisor", tone: "orange" },
  { rank: 2, name: "Club Admin", tone: "purple" },
  { rank: 3, name: "Executive Panel", tone: "blue" },
  { rank: 4, name: "Wing Head", tone: "teal" },
  { rank: 5, name: "Club Moderator", tone: "pink" },
  { rank: 6, name: "Senior General Member", tone: "green" },
  { rank: 7, name: "General Member", tone: "gray" }
];
export const rankTone = (rank) => (RANKS.find((r) => r.rank === rank) || RANKS[6]).tone;
/** Ranks 1–3 run the club ("committee"); 1–4 appear on the public profile. */
export const isCommittee = (rank) => rank <= 3;

/**
 * @param {{ perms?: string[] } | null | undefined} membership a row from my_clubs()
 * @param {ClubPerm} perm
 */
export const has = (membership, perm) => !!membership && membership.status === "active" && (membership.perms?.includes("*") || membership.perms?.includes(perm));
/** Can this membership open the Manage console at all? */
export const canManage = (m) => !!m && m.status === "active" && (m.rank <= 4 || CLUB_PERMS.some((p) => has(m, p)));
/** Ranks this person may hand out (below their own; admins may add co-admins). */
export const assignableRanks = (myRank) => RANKS.filter((r) => r.rank >= 2 && (r.rank > myRank || (myRank <= 2 && r.rank === myRank)));

export const CATEGORIES = { tech: "Tech", business: "Business", arts: "Arts & culture", social: "Social work", debate: "Debate & language", sports: "Sports", science: "Science", other: "Other" };
export const JOIN_MODES = { open: "Anyone can join", apply: "Apply to join", invite: "Invitation only" };
export const AUDIENCES = { public: "Everyone", members: "Members", wing: "One wing", exec: "Executives" };
