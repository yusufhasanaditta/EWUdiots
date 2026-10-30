/* EWUdiots Club: every database call for clubs, in one place. Views never call Supabase directly.
   The rules live in the database (supabase/migrations/0016_clubs.sql): row-level security decides what each person
   can read, and the RPCs (join_club, submit_response, cast_vote…) enforce limits, ranks and anonymity. */

/**
 * @typedef {{ id: string, slug: string, name: string, short_name: string, category: string, tagline: string, about: string, mission: string, founded_year: number|null, logo_url: string, cover_url: string, color: string, advisors: string, contact_email: string, socials: Record<string,string>, official_url: string, join_mode: "open"|"apply"|"invite", recruiting: boolean, wings: string[], verified: boolean, status: string }} Club
 * @typedef {{ club_id: string, status: string, rank: number, role_name: string, perms: string[], title: string, wing: string, name: string, slug: string, short_name: string, color: string, logo_url: string, verified: boolean }} Membership
 * @typedef {{ id: string, club_id: string, author_id: string, author_name: string, kind: string, title: string, body: string, images: string[], link: string, visibility: string, wing: string, pinned: boolean, status: string, created_at: string }} Post
 */

const CLUB_COLS = "id, slug, name, short_name, category, tagline, logo_url, cover_url, color, join_mode, recruiting, verified, status, wings";
const PUBLIC_BUCKET = "clubs-public", PRIVATE_BUCKET = "clubs-private";

/** Turn database errors into sentences people can act on. */
export function friendly(message = "") {
  const m = String(message);
  if (/row-level security|permission denied|violates row-level/i.test(m)) return "You don't have permission to do that.";
  if (/duplicate key|already exists/i.test(m)) return "That's already been done.";
  if (/JWT|not authenticated|sign in/i.test(m) && !/^[A-Z]/.test(m.trim())) return "Please sign in again.";
  if (/Failed to fetch|NetworkError|network/i.test(m)) return "You're offline. Try again when you're connected.";
  if (/violates check constraint/i.test(m)) return "Some details aren't in the right format.";
  return m.replace(/^(ERROR:\s*)?(P0001:\s*)?/, "");
}
const ok = ({ data, error }) => { if (error) throw Object.assign(new Error(friendly(error.message)), { raw: error.message, code: error.code }); return data; };
const safeName = (name) => String(name || "file").toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(-60) || "file";

/** @param {import("@supabase/supabase-js").SupabaseClient} sb  @param {() => ({ id: string } | null)} me */
export function createClubApi(sb, me) {
  const from = (t) => sb.from(t), rpc = (fn, args) => sb.rpc(fn, args);
  const uid = () => me()?.id;

  return {
    /* ── Directory and profiles ── */
    /** @returns {Promise<Club[]>} */
    listClubs: async () => ok(await from("clubs").select(CLUB_COLS).in("status", ["unclaimed", "active"]).order("name")),
    counts: async () => Object.fromEntries((ok(await rpc("club_counts")) || []).map((r) => [r.club_id, r])),
    /** @returns {Promise<Club|null>} */
    club: async (slug) => ok(await from("clubs").select("*").eq("slug", slug).maybeSingle()),
    clubById: async (id) => ok(await from("clubs").select("*").eq("id", id).maybeSingle()),
    updateClub: async (id, patch) => ok(await from("clubs").update(patch).eq("id", id).select().single()),
    committee: async (clubId) => ok(await rpc("club_committee", { c: clubId })) || [],
    terms: async (clubId) => ok(await from("club_terms").select("*").eq("club_id", clubId).order("ended_on", { ascending: false })),
    milestones: async (clubId) => ok(await from("club_milestones").select("*").eq("club_id", clubId).order("year", { ascending: false })),
    addMilestone: async (row) => ok(await from("club_milestones").insert(row).select().single()),
    deleteMilestone: async (id) => ok(await from("club_milestones").delete().eq("id", id)),
    media: async (clubId) => ok(await from("club_media").select("*").eq("club_id", clubId).order("created_at", { ascending: false }).limit(200)),
    addMedia: async (row) => ok(await from("club_media").insert(row).select().single()),
    deleteMedia: async (id) => ok(await from("club_media").delete().eq("id", id)),

    /* ── Me ── */
    /** @returns {Promise<Membership[]>} */
    myClubs: async () => (uid() ? ok(await rpc("my_clubs")) || [] : []),
    /** Pending invites for my email become memberships (see claim_club_invites). Returns how many. */
    // Runs from the sign-in event, before the app has stored the user, so it relies on the session alone.
    claimInvites: async () => ok(await rpc("claim_club_invites")) || 0,
    follows: async () => (uid() ? (ok(await from("club_follows").select("club_id")) || []).map((r) => r.club_id) : []),
    follow: async (clubId) => ok(await from("club_follows").insert({ club_id: clubId })),
    unfollow: async (clubId) => ok(await from("club_follows").delete().eq("club_id", clubId).eq("user_id", uid())),
    leave: async (clubId) => ok(await from("club_members").delete().eq("club_id", clubId).eq("user_id", uid())),
    myRequests: async () => (uid() ? ok(await from("club_requests").select("*").eq("user_id", uid())) : []),
    myClaims: async () => (uid() ? ok(await from("club_claims").select("*").eq("user_id", uid())) : []),
    myResponses: async () => (uid() ? ok(await from("form_responses").select("id, form_id, club_id, status, ticket, checked_in_at, interview_at, created_at, club_forms(title, kind, event_id)").eq("user_id", uid()).order("created_at", { ascending: false })) : []),
    myCerts: async () => (uid() ? ok(await from("club_certificates").select("*, clubs(name, color)").eq("user_id", uid()).order("issued_on", { ascending: false })) : []),

    /* ── Joining, claiming ── */
    join: async (clubId, dept = "", note = "") => ok(await rpc("join_club", { c: clubId, dept, nt: note })),
    cancelRequest: async (id) => ok(await from("club_requests").delete().eq("id", id)),
    claim: async (clubId, position, proof) => ok(await rpc("claim_club", { c: clubId, pos: position, prf: proof })),
    requestClub: async (name, category, position, proof) => ok(await rpc("request_club", { nm: name, cat: category, pos: position, prf: proof })),

    /* ── Members, roles, invites, requests ── */
    members: async (clubId) => ok(await rpc("club_member_list", { c: clubId })) || [],
    setMember: async (clubId, userId, { rank = null, title = null, wing = null, status = null } = {}) => ok(await rpc("set_member", { c: clubId, u: userId, rnk: rank, ttl: title, wng: wing, st: status })),
    roles: async (clubId) => ok(await from("club_roles").select("*").eq("club_id", clubId).order("rank")),
    updateRole: async (id, patch) => ok(await from("club_roles").update(patch).eq("id", id).select().single()),
    invite: async (clubId, who, rank = 7, title = "", wing = "") => ok(await rpc("invite_member", { c: clubId, who, rnk: rank, ttl: title, wng: wing })),
    invites: async (clubId) => ok(await from("club_invites").select("*").eq("club_id", clubId).order("created_at", { ascending: false })),
    revokeInvite: async (id) => ok(await from("club_invites").delete().eq("id", id)),
    requests: async (clubId) => ok(await from("club_requests").select("*").eq("club_id", clubId).eq("status", "pending").order("created_at")),
    reviewRequest: async (id, accept) => ok(await rpc("review_request", { req: id, accept })),
    handover: async (clubId, label, assignments) => ok(await rpc("handover_term", { c: clubId, lbl: label, assignments })),

    /* ── Posts ── */
    /** Newest posts I'm allowed to see (the database filters by audience). */
    feed: async ({ clubIds = null, kind = null, limit = 40, before = null } = {}) => {
      let q = from("club_posts").select("*, clubs!inner(slug, name, short_name, logo_url, color, verified)").eq("status", "published").order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
      if (clubIds) q = q.in("club_id", clubIds.length ? clubIds : ["00000000-0000-0000-0000-000000000000"]);
      if (kind) q = q.eq("kind", kind);
      if (before) q = q.lt("created_at", before);
      return ok(await q);
    },
    clubPosts: async (clubId, { drafts = false } = {}) => ok(await from("club_posts").select("*").eq("club_id", clubId).in("status", drafts ? ["published", "draft"] : ["published"]).order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(100)),
    post: async (id) => ok(await from("club_posts").select("*, clubs(slug, name, short_name, logo_url, color, verified)").eq("id", id).maybeSingle()),
    createPost: async (row) => ok(await from("club_posts").insert({ ...row, author_id: uid() }).select().single()),
    updatePost: async (id, patch) => ok(await from("club_posts").update(patch).eq("id", id).select().single()),
    deletePost: async (id) => ok(await from("club_posts").delete().eq("id", id)),
    /** Reaction counts per post and my own reaction. */
    reactions: async (postIds) => {
      if (!postIds.length) return {};
      const rows = ok(await from("club_reactions").select("post_id, user_id, kind").in("post_id", postIds)) || [];
      return rows.reduce((m, r) => { const x = (m[r.post_id] = m[r.post_id] || { n: 0, mine: null }); x.n++; if (r.user_id === uid()) x.mine = r.kind; return m; }, {});
    },
    react: async (postId, kind = "like") => ok(await from("club_reactions").upsert({ post_id: postId, user_id: uid(), kind })),
    unreact: async (postId) => ok(await from("club_reactions").delete().eq("post_id", postId).eq("user_id", uid())),
    comments: async (postId) => ok(await from("club_comments").select("*").eq("post_id", postId).order("created_at")),
    commentCounts: async (postIds) => {
      if (!postIds.length) return {};
      const rows = ok(await from("club_comments").select("post_id").in("post_id", postIds).eq("hidden", false)) || [];
      return rows.reduce((m, r) => ((m[r.post_id] = (m[r.post_id] || 0) + 1), m), {});
    },
    addComment: async (postId, clubId, body) => ok(await from("club_comments").insert({ post_id: postId, club_id: clubId, body, user_id: uid() }).select().single()),
    hideComment: async (id, hidden = true) => ok(await from("club_comments").update({ hidden }).eq("id", id)),
    deleteComment: async (id) => ok(await from("club_comments").delete().eq("id", id)),
    report: async (clubId, targetType, targetId, reason) => ok(await from("club_reports").insert({ club_id: clubId, target_type: targetType, target_id: targetId, reason, user_id: uid() })),

    /* ── Events (rows in the campus events table, tagged with the club) ── */
    clubEvents: async (clubId) => ok(await from("events").select("*").eq("club_id", clubId).order("starts_at", { ascending: false }).limit(100)),
    upcomingClubEvents: async () => ok(await from("events").select("*, clubs(slug, name, short_name, logo_url, color)").not("club_id", "is", null).eq("status", "approved").gte("starts_at", new Date(Date.now() - 864e5).toISOString()).order("starts_at").limit(100)),
    createEvent: async (row) => ok(await from("events").insert({ ...row, source: "club", status: "approved", created_by: uid() }).select().single()),
    updateEvent: async (id, patch) => ok(await from("events").update(patch).eq("id", id).select().single()),
    deleteEvent: async (id) => ok(await from("events").delete().eq("id", id)),

    /* ── Forms ── */
    forms: async (clubId) => ok(await from("club_forms").select("*").eq("club_id", clubId).order("created_at", { ascending: false })),
    openForms: async () => ok(await from("club_forms").select("id, club_id, kind, title, settings, status, clubs!inner(slug, name, short_name, logo_url, color)").eq("status", "open").order("created_at", { ascending: false }).limit(60)),
    form: async (id) => ok(await from("club_forms").select("*, clubs(id, slug, name, short_name, logo_url, color, wings)").eq("id", id).maybeSingle()),
    createForm: async (row) => ok(await from("club_forms").insert({ ...row, created_by: uid() }).select().single()),
    updateForm: async (id, patch) => ok(await from("club_forms").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select().single()),
    deleteForm: async (id) => ok(await from("club_forms").delete().eq("id", id)),
    formCount: async (id) => ok(await rpc("form_count", { f: id })) || 0,
    myResponse: async (formId) => (uid() ? ok(await from("form_responses").select("*").eq("form_id", formId).eq("user_id", uid()).maybeSingle()) : null),
    submit: async (formId, answers, phone = "", payment = "", dept = "") => ok(await rpc("submit_response", { f: formId, ans: answers, ph: phone, pay: payment, dept })),
    withdraw: async (id) => ok(await from("form_responses").delete().eq("id", id)),
    responses: async (formId) => ok(await from("form_responses").select("*").eq("form_id", formId).order("created_at")),
    review: async (ids, { status = null, note = null, paid = null, interview = null } = {}) => ok(await rpc("review_responses", { ids, st: status, nt: note, paid, interview })),
    checkInTicket: async (formId, code) => ok(await rpc("check_in_ticket", { f: formId, code })),
    logExport: async (clubId, what, n) => ok(await rpc("club_log_export", { c: clubId, what, n })),

    /* ── Attendance ── */
    sessions: async (clubId) => ok(await from("club_sessions").select("*").eq("club_id", clubId).order("starts_at", { ascending: false }).limit(60)),
    createSession: async (clubId, title) => ok(await from("club_sessions").insert({ club_id: clubId, title, created_by: uid() }).select().single()),
    setSessionOpen: async (id, open) => ok(await from("club_sessions").update({ open }).eq("id", id)),
    deleteSession: async (id) => ok(await from("club_sessions").delete().eq("id", id)),
    sessionSecret: async (id) => ok(await from("club_session_keys").select("secret").eq("session_id", id).single()).secret,
    checkin: async (sessionId, code) => ok(await rpc("club_checkin", { s: sessionId, code })),
    attendance: async (clubId) => ok(await from("club_attendance").select("session_id, user_id, at, by_hand").eq("club_id", clubId).limit(5000)),
    markPresent: async (sessionId, userId, present = true) => ok(await rpc("club_mark_present", { s: sessionId, u: userId, present })),

    /* ── Polls ── */
    polls: async (clubId) => ok(await from("club_polls").select("*").eq("club_id", clubId).order("created_at", { ascending: false }).limit(50)),
    createPoll: async (row) => ok(await from("club_polls").insert({ ...row, created_by: uid() }).select().single()),
    closePoll: async (id) => ok(await from("club_polls").update({ closed: true }).eq("id", id)),
    deletePoll: async (id) => ok(await from("club_polls").delete().eq("id", id)),
    vote: async (pollId, choices) => ok(await rpc("cast_vote", { p: pollId, choices })),
    results: async (pollId) => ok(await rpc("poll_results", { p: pollId })) || [],
    myVotes: async (pollIds) => (pollIds.length && uid() ? (ok(await from("club_voted").select("poll_id").in("poll_id", pollIds)) || []).map((r) => r.poll_id) : []),

    /* ── Tasks and documents ── */
    tasks: async (clubId) => ok(await from("club_tasks").select("*").eq("club_id", clubId).order("status").order("due", { nullsFirst: false }).limit(300)),
    addTask: async (row) => ok(await from("club_tasks").insert({ ...row, created_by: uid() }).select().single()),
    updateTask: async (id, patch) => ok(await from("club_tasks").update(patch).eq("id", id).select().single()),
    deleteTask: async (id) => ok(await from("club_tasks").delete().eq("id", id)),
    docs: async (clubId) => ok(await from("club_docs").select("*").eq("club_id", clubId).order("created_at", { ascending: false })),
    addDoc: async (row) => ok(await from("club_docs").insert({ ...row, created_by: uid() }).select().single()),
    deleteDoc: async (id) => ok(await from("club_docs").delete().eq("id", id)),

    /* ── Certificates ── */
    certs: async (clubId) => ok(await from("club_certificates").select("*").eq("club_id", clubId).order("issued_on", { ascending: false }).limit(500)),
    issueCerts: async (rows) => ok(await from("club_certificates").insert(rows.map((r) => ({ ...r, issued_by: uid() }))).select()),
    revokeCert: async (id) => ok(await from("club_certificates").delete().eq("id", id)),
    verifyCert: async (code) => (ok(await rpc("verify_certificate", { c: code })) || [])[0] || null,

    /* ── Finance and audit ── */
    finance: async (clubId) => ok(await from("club_finance").select("*").eq("club_id", clubId).order("on_date", { ascending: false }).limit(1000)),
    addFinance: async (row) => ok(await from("club_finance").insert({ ...row, created_by: uid() }).select().single()),
    deleteFinance: async (id) => ok(await from("club_finance").delete().eq("id", id)),
    audit: async (clubId) => ok(await from("club_audit").select("*").eq("club_id", clubId).order("at", { ascending: false }).limit(300)),

    /* ── Files ── */
    /** Public image (logo, cover, post photo, gallery) → its public URL. */
    uploadPublic: async (clubId, file, folder = "media") => {
      const path = `${clubId}/${folder}/${Date.now().toString(36)}-${safeName(file.name)}`;
      ok(await sb.storage.from(PUBLIC_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false }));
      return sb.storage.from(PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl;
    },
    /** Private file (docs, receipts) → its storage path. */
    uploadPrivate: async (clubId, folder, file) => {
      const path = `${clubId}/${folder}/${Date.now().toString(36)}-${safeName(file.name)}`;
      ok(await sb.storage.from(PRIVATE_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false }));
      return path;
    },
    signedUrl: async (path) => ok(await sb.storage.from(PRIVATE_BUCKET).createSignedUrl(path, 300)).signedUrl,

    /* ── Platform admin (EWUdiots team) ── */
    admin: {
      stats: async () => ok(await rpc("admin_club_stats")),
      clubs: async () => ok(await from("clubs").select("*").order("status").order("name")),
      claims: async () => ok(await from("club_claims").select("*, clubs(name, slug, status)").order("created_at", { ascending: false }).limit(200)),
      reviewClaim: async (id, approve, note = "") => ok(await rpc("review_claim", { claim: id, approve, note })),
      setAdmin: async (clubId, who) => ok(await rpc("admin_set_club_admin", { c: clubId, who })),
      setStatus: async (clubId, status) => ok(await from("clubs").update({ status }).eq("id", clubId)),
      setVerified: async (clubId, verified) => ok(await from("clubs").update({ verified }).eq("id", clubId)),
      reports: async () => ok(await from("club_reports").select("*, clubs(name, slug)").eq("status", "open").order("created_at", { ascending: false })),
      resolveReport: async (id) => ok(await from("club_reports").update({ status: "done" }).eq("id", id)),
      hidePost: async (id, hidden = true) => ok(await from("club_posts").update({ status: hidden ? "hidden" : "published" }).eq("id", id))
    }
  };
}
