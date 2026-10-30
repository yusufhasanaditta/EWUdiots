/* EWUdiots Club v2.14: database calls for the club platform (migrations 0018–0022), merged into createClubApi().
   Chat, notifications, meetings, projects, resources, elections, recruitment, events, members, analytics, store,
   orders, sponsors, collaborations, support and the App Admin. As before, the database decides; views only call these. */

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} sb
 * @param {() => ({ id: string } | null)} me
 * @param {(r: { data: any, error: any }) => any} ok
 * @param {(name: string) => string} safeName
 */
export function moreApi(sb, me, ok, safeName) {
  const from = (t) => sb.from(t), rpc = (fn, args) => sb.rpc(fn, args);
  const uid = () => me()?.id;
  const PRIVATE = "clubs-private";
  const upload = async (bucket, path, file) => { ok(await sb.storage.from(bucket).upload(path, file, { contentType: file.type || undefined, upsert: false })); return path; };
  const stamp = (file) => `${Date.now().toString(36)}-${safeName(file.name)}`;

  return {
    /* ── Club profile extras ── */
    setFeatures: async (clubId, features) => ok(await from("clubs").update({ features }).eq("id", clubId).select("features").single()),
    setStoreSettings: async (clubId, store_settings) => ok(await from("clubs").update({ store_settings }).eq("id", clubId).select("store_settings").single()),

    /* ── Members and positions ── */
    memberDetail: async (clubId, userId) => ok(await rpc("club_member_detail", { c: clubId, u: userId })),
    setMemberRole: async (clubId, userId, { role = null, title = null, wing = null, status = null } = {}) => ok(await rpc("set_member_role", { c: clubId, u: userId, rid: role, ttl: title, wng: wing, st: status })),
    inviteRole: async (clubId, who, roleId, title = "", wing = "") => ok(await rpc("invite_member", { c: clubId, who, rnk: 7, ttl: title, wng: wing, rid: roleId })),
    addRole: async (row) => ok(await from("club_roles").insert(row).select().single()),
    deleteRole: async (id) => ok(await from("club_roles").delete().eq("id", id)),
    updateMyProfile: async (clubId, patch) => ok(await rpc("update_my_club_profile", { c: clubId, patch })),
    memberNotes: async (clubId, userId) => ok(await from("club_member_notes").select("*").eq("club_id", clubId).eq("user_id", userId).order("created_at", { ascending: false })),
    addMemberNote: async (clubId, userId, body) => ok(await from("club_member_notes").insert({ club_id: clubId, user_id: userId, body, author: uid() }).select().single()),
    roleTemplate: async () => ok(await from("club_role_template").select("*").order("sort")),
    terms: async (clubId) => ok(await from("club_terms").select("*").eq("club_id", clubId).order("ended_on", { ascending: false })),
    handovers: async (clubId) => ok(await from("club_handover").select("*").eq("club_id", clubId).order("created_at", { ascending: false })),
    saveHandover: async (row) => ok(row.id ? await from("club_handover").update({ ...row, updated_at: new Date().toISOString() }).eq("id", row.id).select().single() : await from("club_handover").insert({ ...row, created_by: uid() }).select().single()),

    /* ── Chat ── */
    channels: async () => ok(await rpc("my_channels")) || [],
    channel: async (id) => ok(await from("club_channels").select("*, clubs(id, name, short_name, slug, color, logo_url)").eq("id", id).maybeSingle()),
    channelMembers: async (id) => ok(await from("club_channel_members").select("user_id").eq("channel_id", id)),
    messages: async (channelId, { before = null, limit = 60 } = {}) => {
      let q = from("club_messages").select("*").eq("channel_id", channelId).order("id", { ascending: false }).limit(limit);
      if (before) q = q.lt("id", before);
      return (ok(await q) || []).reverse();
    },
    send: async (channelId, clubId, body, { attachments = [], mentions = [], replyTo = null } = {}) =>
      ok(await from("club_messages").insert({ channel_id: channelId, club_id: clubId, author_id: uid(), body, attachments, mentions, reply_to: replyTo }).select().single()),
    editMessage: async (id, patch) => ok(await from("club_messages").update(patch).eq("id", id).select().single()),
    reactionsFor: async (channelId, ids) => (ids.length ? ok(await from("club_message_reactions").select("message_id, user_id, emoji").eq("channel_id", channelId).in("message_id", ids)) : []),
    reactMessage: async (channelId, messageId, emoji) => ok(await from("club_message_reactions").insert({ channel_id: channelId, message_id: messageId, emoji, user_id: uid() })),
    unreactMessage: async (messageId, emoji) => ok(await from("club_message_reactions").delete().eq("message_id", messageId).eq("emoji", emoji).eq("user_id", uid())),
    markRead: async (channelId) => ok(await from("club_channel_reads").upsert({ channel_id: channelId, user_id: uid(), read_at: new Date().toISOString() })),
    openDm: async (clubId, userId) => ok(await rpc("open_dm", { c: clubId, other: userId })),
    createChannel: async (clubId, name, kind, wing, members) => ok(await rpc("create_channel", { c: clubId, nm: name, kd: kind, wng: wing, members })),
    updateChannel: async (id, patch) => ok(await from("club_channels").update(patch).eq("id", id)),
    uploadChat: async (clubId, channelId, file) => upload(PRIVATE, `${clubId}/chat/${channelId}/${stamp(file)}`, file),
    /** Live messages for one channel (RLS decides who receives them). Returns an unsubscribe function. */
    subscribe(channelId, onChange) {
      const ch = sb.channel(`club-chat-${channelId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "club_messages", filter: `channel_id=eq.${channelId}` }, (p) => onChange(p))
        .on("postgres_changes", { event: "*", schema: "public", table: "club_message_reactions", filter: `channel_id=eq.${channelId}` }, (p) => onChange(p))
        .subscribe();
      return () => sb.removeChannel(ch);
    },
    /** New notifications for me as they arrive. */
    subscribeNotifications(onNew) {
      if (!uid()) return () => {};
      const ch = sb.channel(`club-notes-${uid()}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "club_notifications", filter: `user_id=eq.${uid()}` }, (p) => onNew(p.new)).subscribe();
      return () => sb.removeChannel(ch);
    },

    /* ── Notifications ── */
    notifications: async () => (uid() ? ok(await from("club_notifications").select("*, clubs(name, short_name, color, logo_url)").order("created_at", { ascending: false }).limit(150)) : []),
    unreadCount: async () => (uid() ? (await from("club_notifications").select("id", { count: "exact", head: true }).is("read_at", null)).count || 0 : 0),
    markNotificationsRead: async (ids = null) => ok(await rpc("mark_club_notifications_read", { ids })),
    deleteNotification: async (id) => ok(await from("club_notifications").delete().eq("id", id)),

    /* ── Meetings ── */
    meetings: async (clubId) => ok(await from("club_meetings").select("*").eq("club_id", clubId).order("starts_at", { ascending: false }).limit(100)),
    myMeetings: async (clubIds) => (clubIds.length ? ok(await from("club_meetings").select("*, clubs(name, short_name, color)").in("club_id", clubIds).gte("starts_at", new Date(Date.now() - 3 * 36e5).toISOString()).neq("status", "cancelled").order("starts_at").limit(20)) : []),
    meeting: async (id) => ok(await from("club_meetings").select("*, clubs(id, name, short_name, slug, color, logo_url)").eq("id", id).maybeSingle()),
    saveMeeting: async (row) => ok(row.id ? await from("club_meetings").update(row).eq("id", row.id).select().single() : await from("club_meetings").insert({ ...row, created_by: uid() }).select().single()),
    deleteMeeting: async (id) => ok(await from("club_meetings").delete().eq("id", id)),
    meetingAttendance: async (id) => ok(await rpc("meeting_attendance", { mt: id })) || [],
    meetingTasks: async (id) => ok(await from("club_tasks").select("*").eq("meeting_id", id).order("created_at")),
    meetingDocs: async (id) => ok(await from("club_docs").select("*").eq("meeting_id", id).order("created_at")),

    /* ── Projects and the task board ── */
    projects: async (clubId) => ok(await from("club_projects").select("*").eq("club_id", clubId).order("updated_at", { ascending: false })),
    project: async (id) => ok(await from("club_projects").select("*, clubs(id, name, short_name, slug, color)").eq("id", id).maybeSingle()),
    saveProject: async (row) => ok(row.id ? await from("club_projects").update({ ...row, updated_at: new Date().toISOString() }).eq("id", row.id).select().single() : await from("club_projects").insert({ ...row, created_by: uid() }).select().single()),
    deleteProject: async (id) => ok(await from("club_projects").delete().eq("id", id)),
    projectTasks: async (id) => ok(await from("club_tasks").select("*").eq("project_id", id).order("position")),
    projectTaskCounts: async (clubId) => (ok(await from("club_tasks").select("project_id, status").eq("club_id", clubId).not("project_id", "is", null)) || [])
      .reduce((m, t) => { const x = (m[t.project_id] ||= { total: 0, done: 0 }); x.total++; if (t.status === "done") x.done++; return m; }, {}),
    myTasks: async () => (uid() ? ok(await from("club_tasks").select("*, clubs(name, short_name, color)").eq("assignee", uid()).neq("status", "done").order("due", { nullsFirst: false }).limit(20)) : []),
    moveTasks: async (updates) => { for (const u of updates) ok(await from("club_tasks").update({ status: u.status, position: u.position }).eq("id", u.id)); },
    projectDocs: async (id) => ok(await from("club_docs").select("*").eq("project_id", id).order("created_at", { ascending: false })),

    /* ── Resources ── */
    folders: async (clubId) => ok(await from("club_folders").select("*").eq("club_id", clubId).order("name")),
    saveFolder: async (row) => ok(row.id ? await from("club_folders").update(row).eq("id", row.id).select().single() : await from("club_folders").insert({ ...row, created_by: uid() }).select().single()),
    deleteFolder: async (id) => ok(await from("club_folders").delete().eq("id", id)),
    resources: async (clubId) => ok(await from("club_docs").select("*").eq("club_id", clubId).is("meeting_id", null).is("project_id", null).order("created_at", { ascending: false }).limit(500)),
    updateDoc: async (id, patch) => ok(await from("club_docs").update(patch).eq("id", id)),
    uploadDoc: async (clubId, file) => upload(PRIVATE, `${clubId}/docs/${stamp(file)}`, file),

    /* ── Polls (extras) and elections ── */
    changeVote: async (pollId, choices) => ok(await rpc("change_vote", { p: pollId, choices })),
    myPollChoice: async (pollId) => ok(await rpc("my_poll_choice", { p: pollId })) || [],
    poll: async (id) => ok(await from("club_polls").select("*, clubs(id, name, short_name, color)").eq("id", id).maybeSingle()),
    pollComments: async (id) => ok(await from("club_poll_comments").select("*").eq("poll_id", id).order("created_at")),
    addPollComment: async (pollId, clubId, body) => ok(await from("club_poll_comments").insert({ poll_id: pollId, club_id: clubId, body, user_id: uid() })),
    clubPollsAll: async (clubIds) => (clubIds.length ? ok(await from("club_polls").select("*, clubs(name, short_name, color)").in("club_id", clubIds).order("created_at", { ascending: false }).limit(80)) : []),
    elections: async (clubIds) => (clubIds.length ? ok(await from("club_elections").select("*, clubs(name, short_name, color)").in("club_id", clubIds).order("voting_start", { ascending: false })) : []),
    election: async (id) => ok(await from("club_elections").select("*, clubs(id, name, short_name, slug, color, logo_url)").eq("id", id).maybeSingle()),
    saveElection: async (row) => ok(row.id ? await from("club_elections").update(row).eq("id", row.id).select().single() : await from("club_elections").insert({ ...row, created_by: uid() }).select().single()),
    positions: async (electionId) => ok(await from("club_election_positions").select("*").eq("election_id", electionId).order("sort")),
    savePosition: async (row) => ok(row.id ? await from("club_election_positions").update(row).eq("id", row.id) : await from("club_election_positions").insert(row)),
    deletePosition: async (id) => ok(await from("club_election_positions").delete().eq("id", id)),
    candidates: async (electionId) => ok(await from("club_candidates").select("*").eq("election_id", electionId).order("created_at")),
    nominate: async (positionId, statement, manifesto, photo = "", year = "") => ok(await rpc("nominate", { pos: positionId, stmt: statement, mani: manifesto, photo, yr: year })),
    withdrawCandidacy: async (id) => ok(await from("club_candidates").update({ status: "withdrawn" }).eq("id", id)),
    reviewCandidate: async (id, approve, note = "") => ok(await rpc("review_candidate", { cand: id, approve, note })),
    voteElection: async (positionId, picks) => ok(await rpc("cast_election_vote", { pos: positionId, picks })),
    myElectionVotes: async (positionIds) => (positionIds.length ? (ok(await from("club_election_voted").select("position_id").in("position_id", positionIds)) || []).map((r) => r.position_id) : []),
    electionResults: async (id) => ok(await rpc("election_results", { el: id })) || [],
    applyElection: async (id) => ok(await rpc("apply_election", { el: id })),

    /* ── Recruitment ── */
    score: async (responseId, score) => ok(await rpc("score_response", { rid: responseId, sc: score })),
    setInterview: async (ids, at, place = "") => ok(await rpc("set_interview", { ids, at, place })),
    response: async (id) => ok(await from("form_responses").select("*, club_forms(id, title, kind, fields, settings, club_id)").eq("id", id).maybeSingle()),
    clubResponses: async (clubId) => ok(await from("form_responses").select("id, form_id, status, score_total, created_at, department, checked_in_at").eq("club_id", clubId).limit(5000)),

    /* ── Events ── */
    event: async (id) => ok(await from("events").select("*, clubs(id, slug, name, short_name, logo_url, color, verified)").eq("id", id).maybeSingle()),
    eventStats: async (id) => ok(await rpc("event_stats", { ev: id })),
    eventCheckin: async (id, q) => ok(await rpc("event_checkin", { ev: id, q })),
    notifyRegistrants: async (id, title, body) => ok(await rpc("notify_registrants", { ev: id, t: title, b: body })),

    /* ── Finance extras: event budgets ── */
    budgets: async (clubId) => ok(await from("club_budgets").select("*, events(title, starts_at, venue, image)").eq("club_id", clubId).order("created_at", { ascending: false })),
    saveBudget: async (row) => ok(row.id ? await from("club_budgets").update(row).eq("id", row.id).select().single() : await from("club_budgets").insert({ ...row, created_by: uid() }).select().single()),
    deleteBudget: async (id) => ok(await from("club_budgets").delete().eq("id", id)),

    /* ── Feedback, analytics ── */
    analytics: async (clubId) => ok(await rpc("club_analytics", { c: clubId })),
    remindInactive: async (clubId, msg = "") => ok(await rpc("remind_inactive", { c: clubId, msg })),
    giveFeedback: async (row) => ok(await from("club_feedback").insert({ ...row, user_id: uid() })),

    /* ── Store ── */
    products: async (clubId = null) => { let q = from("club_products").select("*, clubs!inner(id, slug, name, short_name, color, logo_url, store_settings)").order("created_at", { ascending: false }).limit(200); if (clubId) q = q.eq("club_id", clubId); return ok(await q); },
    product: async (id) => ok(await from("club_products").select("*, clubs(id, slug, name, short_name, color, logo_url, store_settings, status)").eq("id", id).maybeSingle()),
    saveProduct: async (row) => ok(row.id ? await from("club_products").update(row).eq("id", row.id).select().single() : await from("club_products").insert({ ...row, created_by: uid() }).select().single()),
    deleteProduct: async (id) => ok(await from("club_products").delete().eq("id", id)),
    checkCoupon: async (clubId, code, subtotal) => ok(await rpc("check_coupon", { c: clubId, code, subtotal })),
    coupons: async (clubId) => ok(await from("club_coupons").select("*").eq("club_id", clubId).order("created_at", { ascending: false })),
    saveCoupon: async (row) => ok(row.id ? await from("club_coupons").update(row).eq("id", row.id) : await from("club_coupons").insert(row)),
    placeOrder: async (clubId, items, method, ref, pickup, phone, coupon = "", note = "") => ok(await rpc("place_order", { c: clubId, items, method, ref, pickup, phone, coupon, note })),
    myOrders: async () => (uid() ? ok(await rpc("my_orders")) || [] : []),
    order: async (id) => ok(await from("club_orders").select("*, clubs(id, slug, name, short_name, color, logo_url, store_settings)").eq("id", id).maybeSingle()),
    orderEvents: async (id) => ok(await from("club_order_events").select("*").eq("order_id", id).order("at")),
    clubOrders: async (clubId) => ok(await from("club_orders").select("*").eq("club_id", clubId).order("created_at", { ascending: false }).limit(1000)),
    submitPaymentRef: async (id, ref) => ok(await rpc("submit_payment_ref", { oid: id, ref })),
    verifyPayment: async (id, okay, note = "") => ok(await rpc("verify_payment", { oid: id, ok: okay, note })),
    setOrderStatus: async (id, status, note = "", eta = null) => ok(await rpc("set_order_status", { oid: id, st: status, note, eta })),
    bulkOrderStatus: async (ids, status) => ok(await rpc("bulk_order_status", { ids, st: status })),
    cancelMyOrder: async (id, reason = "") => ok(await rpc("cancel_my_order", { oid: id, reason })),
    scanPickup: async (token) => ok(await rpc("scan_pickup", { tok: token })),
    addOrderNote: async (id, note) => ok(await rpc("add_order_note", { oid: id, note })),
    returnsFor: async (orderId) => ok(await from("club_returns").select("*").eq("order_id", orderId).order("created_at", { ascending: false })),
    clubReturns: async (clubId) => ok(await from("club_returns").select("*, club_orders(code, buyer_name)").eq("club_id", clubId).order("created_at", { ascending: false }).limit(200)),
    requestReturn: async (orderId, reason, details, evidence = [], items = null) => ok(await rpc("request_return", { oid: orderId, rsn: reason, det: details, ev: evidence, its: items })),
    reviewReturn: async (id, approve, note = "") => ok(await rpc("review_return", { rid: id, approve, note })),
    recordRefund: async (id, amount, method, ref = "") => ok(await rpc("record_refund", { rid: id, amt: amount, method, ref })),
    uploadEvidence: async (clubId, file) => upload(PRIVATE, `${clubId}/returns/${uid()}/${stamp(file)}`, file),
    storeStats: async (clubId) => ok(await rpc("store_stats", { c: clubId })),

    /* ── Sponsors ── */
    sponsors: async () => ok(await from("sponsors").select("*").order("verified", { ascending: false }).order("name")),
    sponsor: async (id) => ok(await from("sponsors").select("*").eq("id", id).maybeSingle()),
    sponsorProfile: async (id) => ok(await rpc("sponsor_profile", { s: id })),
    addSponsor: async (row) => ok(await from("sponsors").insert({ ...row, added_by: uid() }).select().single()),
    packages: async (clubId) => ok(await from("club_sponsor_packages").select("*").eq("club_id", clubId).order("sort")),
    allPackages: async () => ok(await from("club_sponsor_packages").select("*, clubs(name, short_name, slug)").order("amount")),
    savePackage: async (row) => ok(row.id ? await from("club_sponsor_packages").update(row).eq("id", row.id) : await from("club_sponsor_packages").insert(row)),
    deletePackage: async (id) => ok(await from("club_sponsor_packages").delete().eq("id", id)),
    sponsorships: async (clubId) => ok(await from("club_sponsorships").select("*, sponsors(name, logo_url, industry)").eq("club_id", clubId).order("created_at", { ascending: false })),
    saveSponsorship: async (row) => ok(row.id ? await from("club_sponsorships").update(row).eq("id", row.id).select().single() : await from("club_sponsorships").insert({ ...row, created_by: uid() }).select().single()),
    sponsorOpportunities: async () => ok(await from("events").select("*, clubs(slug, name, short_name, color)").eq("seeking_sponsors", true).gte("starts_at", new Date().toISOString()).order("starts_at").limit(30)),

    /* ── Collaborations ── */
    collabs: async () => ok(await from("club_collabs").select("*, clubs:lead_club(id, slug, name, short_name, color, logo_url, category), club_collab_clubs(club_id, status, clubs(name, short_name, slug, color, logo_url))").order("starts_at", { nullsFirst: false }).limit(100)),
    collab: async (id) => ok(await from("club_collabs").select("*, clubs:lead_club(id, slug, name, short_name, color, logo_url, category), club_collab_clubs(club_id, status, message, created_at, clubs(name, short_name, slug, color, logo_url, category))").eq("id", id).maybeSingle()),
    saveCollab: async (row) => ok(row.id ? await from("club_collabs").update(row).eq("id", row.id).select().single() : await from("club_collabs").insert({ ...row, created_by: uid() }).select().single()),
    collabInterested: async (id) => ok(await rpc("collab_interested", { x: id })) || 0,
    myCollabInterest: async (ids) => (uid() && ids.length ? (ok(await from("club_collab_interest").select("collab_id").in("collab_id", ids)) || []).map((r) => r.collab_id) : []),
    setCollabInterest: async (id, on) => ok(on ? await from("club_collab_interest").insert({ collab_id: id, user_id: uid() }) : await from("club_collab_interest").delete().eq("collab_id", id).eq("user_id", uid())),
    collabInvite: async (id, clubId, msg = "") => ok(await rpc("collab_invite", { x: id, c: clubId, msg })),
    collabRequest: async (id, clubId, msg = "") => ok(await rpc("collab_request", { x: id, c: clubId, msg })),
    collabRespond: async (id, clubId, accept) => ok(await rpc("collab_respond", { x: id, c: clubId, accept })),
    collabChat: async (id) => ok(await rpc("collab_open_chat", { x: id })),

    /* ── Help centre ── */
    tickets: async () => (uid() ? ok(await from("support_tickets").select("*").eq("user_id", uid()).order("updated_at", { ascending: false })) : []),
    ticket: async (id) => ok(await from("support_tickets").select("*").eq("id", id).maybeSingle()),
    ticketMessages: async (id) => ok(await from("support_messages").select("*").eq("ticket_id", id).order("created_at")),
    openTicket: async (row) => ok(await from("support_tickets").insert({ ...row, user_id: uid() }).select().single()),
    replyTicket: async (id, body) => ok(await from("support_messages").insert({ ticket_id: id, body, user_id: uid() })),
    closeTicket: async (id) => ok(await from("support_tickets").update({ status: "closed" }).eq("id", id)),
    uploadTicketFile: async (file) => upload(PRIVATE, `support/${uid()}/${stamp(file)}`, file),

    /* ── Privacy ── */
    exportMyData: async () => ok(await rpc("export_my_club_data")),

    /* ── App Admin (EWUdiots team) ── */
    /** Is the signed-in person on the EWUdiots team with this permission? (only decides what to show) */
    platformCan: async (perm) => (uid() ? !!ok(await rpc("can", { p: perm })) : false),
    platform: {
      stats: async () => ok(await rpc("admin_platform_stats")),
      lockFeature: async (clubId, feature, locked) => ok(await rpc("admin_lock_feature", { c: clubId, f: feature, locked })),
      createClub: async (row) => ok(await from("clubs").insert({ ...row, status: "active", verified: true }).select().single()),
      updateClub: async (id, patch) => ok(await from("clubs").update(patch).eq("id", id)),
      allTickets: async () => ok(await from("support_tickets").select("*").order("updated_at", { ascending: false }).limit(300)),
      setTicket: async (id, patch) => ok(await from("support_tickets").update(patch).eq("id", id)),
      pendingSponsors: async () => ok(await from("sponsors").select("*, clubs:added_club(name)").eq("status", "pending").order("created_at")),
      reviewSponsor: async (id, approve, verify = false) => ok(await rpc("admin_review_sponsor", { s: id, approve, verify })),
      saveTemplateRole: async (row) => ok(await from("club_role_template").update(row).eq("id", row.id)),
      clubCounts: async () => ok(await rpc("club_counts")) || []
    }
  };
}
