/* Club analytics (#/club/analytics?c=…&tab=…), from the "Club Analytics", "Detailed Analytics" and "Member Engagement"
   boards. One call (public.club_analytics) returns every aggregate; this file only shapes it into charts.
   analytics.view (President, VP, Secretary, Treasurer, Club Admin by default). */

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store, charts } = kit;
  const TABS = [["overview", "Overview"], ["members", "Members"], ["events", "Events"], ["engagement", "Engagement"], ["recruitment", "Recruitment"], ["attendance", "Attendance"], ["finance", "Finance"]];

  pages["club/analytics"] = () => {
    const c = kit.param("c") || kit.clubsWith("analytics.view")[0]?.club_id || "", t = kit.param("tab") || "overview";
    const g = kit.memberGate(c, "club analytics"); if (g) return g;
    if (!kit.can(c, "analytics.view")) return ui.emptyBox("lock", "For the club's leaders", "Analytics need the analytics permission.");
    const ae = store.use(`club:analytics:${c}`, () => api.analytics(c), { ttl: 120e3 });
    const clubs = kit.clubsWith("analytics.view");
    return `${kit.back(`#/club/space?c=${c}`, kit.membership(c)?.short_name || "Club")}
      ${ui.ph("Club Analytics", "Track your club's growth, engagement, and performance with detailed insights.", clubs.length > 1 ? ui.select("c", clubs.map((m) => [m.club_id, m.short_name || m.name]), c, 'id="an-club" style="width:auto" aria-label="Club"') : "")}
      ${ui.seg(TABS, t, (v) => `#/club/analytics?c=${c}&tab=${v}`)}
      ${ui.view(ae, (a) => (SECTION[t] || SECTION.overview)(a, c), { n: 4, h: 160 })}`;
  };
  pages["club/analytics"].mount = (el) => {
    kit.bindRetry(el);
    kit.$("#an-club", el)?.addEventListener("change", (e) => kit.go(`#/club/analytics?c=${e.target.value}&tab=${kit.param("tab") || "overview"}`));
    kit.$("#an-remind", el)?.addEventListener("click", () => {
      const c = kit.param("c");
      ui.sheet("Invite inactive members back", `<form id="rm" class="stack">${ui.field("Message", ui.area("m", "Come along to our next event or say hello in the members' chat — we'd love to see you!", 'rows="3" maxlength="600"'))}<p class="xs">Sent in the app to members with no attendance or messages for 30 days. Once a week.</p><button class="btn primary block">${icon("send")} Send Reminder</button></form>`, (s) =>
        kit.$("#rm", s).addEventListener("submit", async (e) => { e.preventDefault(); try { const n = await api.remindInactive(c, String(new FormData(e.target).get("m") || "")); kit.ctx.closeModal(); kit.toast(`Reminder sent to ${n} members`, "success"); } catch (err) { kit.toast(err.message, "error"); } }));
    });
  };

  const months = (a) => a.growth.map((x) => charts.monthLabel(x.m));
  const card = (title, body, extra = "") => `<section class="card cl-chart"><h3>${title}${extra}</h3>${body}</section>`;
  const pctOf = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const engagement = (a) => pctOf(a.growth.at(-1)?.active || 0, a.members);

  const SECTION = {
    overview(a) {
      const g = a.growth, total = g.map((x) => x.total);
      return `<div class="cl-stats">${ui.stat("users", "purple", a.members, "Total members", { d: charts.delta(a.members, a.members_prev), spark: charts.spark(total.slice(-6)) })}
          ${ui.stat("calendar", "blue", a.events, "Total events", { d: charts.delta(a.events, a.events_prev) })}${ui.stat("file", "red", a.posts, "Total posts", { d: charts.delta(a.posts, a.posts_prev) })}
          ${ui.stat("star", "amber", a.feedback.avg ?? "–", "Event rating", { sub: `${a.feedback.count} reviews` })}</div>
        ${card("Membership Growth", charts.line({ title: "Members per month", labels: months(a), series: [{ name: "Total members", values: total, area: true }, { name: "Active members", values: g.map((x) => x.active) }] }), ' <span class="xs">Last 12 months</span>')}
        <div class="cl-row2 mt">${card("Member Distribution", charts.donut({ title: "Members by department", items: Object.entries(a.by_department).map(([label, value]) => ({ label, value })), center: String(a.members), sub: "Members" }))}
          ${card("Members by Batch", charts.bars({ title: "Members by batch", labels: Object.keys(a.by_batch).sort(), series: [{ name: "Members", values: Object.keys(a.by_batch).sort().map((k) => a.by_batch[k]) }] }))}</div>
        <div class="cl-row2 mt">${card("Event Participation", charts.bars({ title: "Registrations and attendance per month", labels: a.events_monthly.slice(-6).map((x) => charts.monthLabel(x.m)), series: [{ name: "Registrations", values: a.events_monthly.slice(-6).map((x) => x.registrations) }, { name: "Attendance", values: a.events_monthly.slice(-6).map((x) => x.attendance) }] }))}
          ${card("Top Performing Events", topEvents(a))}</div>`;
    },
    members(a) {
      const g = a.growth;
      return `<div class="cl-row2">${card("Members by Department", charts.donut({ title: "Members by department", items: Object.entries(a.by_department).map(([label, value]) => ({ label, value })), center: String(a.members), sub: "Members" }))}
          ${card("Members by Batch", charts.bars({ title: "Members by batch", labels: Object.keys(a.by_batch).sort(), series: [{ name: "Members", values: Object.keys(a.by_batch).sort().map((k) => a.by_batch[k]) }] }))}</div>
        <div class="cl-row2 mt">${card("Member Activity", charts.line({ title: "Active and inactive members per month", labels: months(a).slice(-6), series: [{ name: "Active", values: g.slice(-6).map((x) => x.active), area: true }, { name: "Inactive", values: g.slice(-6).map((x) => Math.max(0, x.total - x.active)) }] }))}
          ${card("Engagement Rate", `<div class="row" style="gap:16px;align-items:center">${charts.ring({ value: engagement(a) / 100, label: `${engagement(a)}%`, sub: "Active engagement", tone: "good" })}<p class="small muted">Members who checked in or wrote in the club chat this month, out of all active members.</p></div>`)}</div>
        ${ui.sec("Top Active Members")}${topMembers(a)}
        ${card("Member Retention", charts.bars({ title: "New and leaving members per month", labels: months(a).slice(-6), series: [{ name: "New members", values: g.slice(-6).map((x) => x.new) }, { name: "Left", values: g.slice(-6).map((x) => x.left) }] }))}`;
    },
    events(a) {
      return `${card("Registrations vs Attendance", charts.line({ title: "Registrations and attendance per month", labels: a.events_monthly.map((x) => charts.monthLabel(x.m)), series: [{ name: "Registrations", values: a.events_monthly.map((x) => x.registrations), area: true }, { name: "Attendance", values: a.events_monthly.map((x) => x.attendance) }] }))}
        <div class="mt">${card("Top Performing Events", topEvents(a))}</div>`;
    },
    engagement(a, c) {
      const likes = Object.entries(a.feedback.likes || {}).sort((x, y) => y[1] - x[1]), maxLike = Math.max(1, a.feedback.count || 1);
      const badge = ["Top Contributor", "Most Active", "Event Champion", "Community Builder", "Rising Star"];
      return `<div class="cl-stats">${ui.stat("users", "purple", a.members, "Total members")}${ui.stat("community", "green", a.growth.at(-1)?.active || 0, "Active members (this month)")}${ui.stat("star", "purple", `${engagement(a)}%`, "Engagement rate")}${ui.stat("user", "red", a.inactive, "Inactive (30+ days)")}</div>
        ${a.inactive ? `<div class="alert purple"><span class="a-ic">${icon("send")}</span><div class="grow"><b>Inactive Member Re-engagement</b><p>${a.inactive} members have been inactive for 30+ days. Send a friendly reminder and invite them to upcoming activities.</p></div><button class="btn sm primary" id="an-remind">Send Reminder</button></div>` : ""}
        ${a.new_30d ? `<div class="alert blue mt-s"><span class="a-ic">${icon("users")}</span><div class="grow"><b>New Member Onboarding</b><p>${a.new_30d} new members joined this month. Send a welcome message in the General chat.</p></div><a class="btn sm outline" href="#/club/messages">Open chat</a></div>` : ""}
        <div class="cl-row3 mt">${card("Overall Satisfaction", `<div style="display:grid;justify-items:center;gap:6px">${charts.ring({ value: (a.feedback.avg || 0) / 5, label: a.feedback.avg ? String(a.feedback.avg) : "–", sub: "out of 5", tone: "good" })}<span class="xs">Based on ${a.feedback.count} responses</span></div>`)}
          ${card("Event Feedback", `<div style="display:grid;justify-items:center;gap:6px">${charts.ring({ value: (a.feedback.positive || 0) / 100, label: a.feedback.positive != null ? `${a.feedback.positive}%` : "–", sub: "Positive", tone: "good" })}<span class="xs">4–5 star ratings</span></div>`)}
          ${card("What members like most", likes.length ? charts.hbars({ title: "What members like most", items: likes.map(([label, value], i) => ({ label: label[0].toUpperCase() + label.slice(1), value, text: `${pctOf(value, maxLike)}%`, max: maxLike, slot: i % 5 })) }) : `<p class="small muted">No feedback yet.</p>`)}</div>
        ${ui.sec("Recent Feedback")}${a.feedback.recent.length ? `<div class="cl-hscroll">${a.feedback.recent.map((f) => `<section class="card" style="width:240px"><div class="row nowrap" style="gap:8px">${ui.ava(f.name, "", "sm")}<b class="ellipsis">${esc(f.name)}</b></div><p aria-label="${f.rating} out of 5" style="color:#f59e0b">${"★".repeat(f.rating)}${"☆".repeat(5 - f.rating)}</p><p class="small">“${esc(f.body)}”</p><span class="xs">${ui.dateShort(f.created_at)}</span></section>`).join("")}</div>` : `<p class="small muted">Feedback from events appears here.</p>`}
        ${ui.sec("Member Recognition")}${a.top_members.length ? `<div class="cl-pcards">${a.top_members.slice(0, 4).map((m, i) => `<a class="cl-pcard" href="#/club/member?c=${c}&u=${m.user_id}"><span class="st amber">${icon(["crown", "zap", "award", "heart"][i])} ${badge[i]}</span>${ui.ava(m.display_name, m.photo_url, "lg")}<b>${esc(m.display_name)}</b><span class="xs">${m.score} activity points</span></a>`).join("")}</div>` : `<p class="small muted">Recognition appears once members are active.</p>`}`;
    },
    recruitment(a) {
      if (!a.recruitment.length) return ui.emptyBox("userpen", "No recruitment yet", "Membership, volunteer and competition forms show here.");
      return a.recruitment.map((f) => { const s = f.statuses || {}, total = Object.values(s).reduce((x, y) => x + y, 0);
        return card(`<a href="#/club/recruit?form=${f.id}">${esc(f.title)}</a>`, charts.hbars({ title: `${f.title} by status`, items: [["Applied", total], ["Shortlisted", s.shortlisted || 0], ["Interview", s.interview || 0], ["Selected", s.accepted || 0], ["Rejected", s.rejected || 0]].map(([label, value], i) => ({ label, value, max: Math.max(1, total), slot: i })) }), ` <span class="xs">${ui.plural(total, "application")}</span>`); }).join('<div class="mt"></div>');
    },
    attendance(a) {
      const s = [...a.sessions].reverse();
      return s.length ? card("Attendance per meeting", charts.bars({ title: "People present per meeting", labels: s.map((x) => ui.dateShort(x.starts_at)), series: [{ name: "Present", values: s.map((x) => x.present) }] }))
        + `<div class="cl-list mt">${a.sessions.map((x) => `<div class="cl-li">${ui.dchip(x.starts_at)}<span class="body"><b>${esc(x.title)}</b><span>${ui.time(x.starts_at)}</span></span><span class="end"><b>${x.present}</b> present · ${pctOf(x.present, a.members)}%</span></div>`).join("")}</div>`
        : ui.emptyBox("checkc", "No attendance yet", "Take attendance at meetings to see trends here.");
    },
    finance(a, c) {
      if (!a.finance_monthly) return ui.emptyBox("lock", "Finance needs finance access", "");
      const f = a.finance_monthly;
      return card("Income vs Expense", charts.line({ title: "Income and expenses per month", labels: f.map((x) => charts.monthLabel(x.m)), series: [{ name: "Income", values: f.map((x) => Number(x.income)), area: true }, { name: "Expense", values: f.map((x) => Number(x.expense)) }], fmt: charts.compact }))
        + `<a class="btn outline mt" href="#/club/finance?c=${c}">${icon("wallet")} Open Finance & Budget</a>`;
    }
  };
  const topEvents = (a) => (a.top_events.length ? `<div class="stack" style="gap:8px">${a.top_events.map((e, i) => `<a class="row nowrap" href="#/club/event?id=${e.id}" style="gap:10px;text-decoration:none;color:inherit"><b class="cl-q-n">${i + 1}</b>${e.image ? `<img src="${esc(e.image)}" alt="" style="width:44px;height:32px;object-fit:cover;border-radius:6px">` : ""}<span class="min0"><b class="ellipsis" style="display:block;font-size:13.5px">${esc(e.title)}</b><span class="xs">${e.participants} participants</span></span></a>`).join("")}</div>` : `<p class="small muted">No events yet.</p>`);
  const topMembers = (a) => (a.top_members.length ? `<div class="cl-hscroll">${a.top_members.map((m, i) => `<div class="cl-pcard" style="width:150px"><span class="st ${i === 0 ? "amber" : "gray"}">${i + 1}</span>${ui.ava(m.display_name, m.photo_url, "lg")}<b>${esc(m.display_name)}</b><span class="xs">${esc(m.role_name)}</span><b style="color:var(--success-t)">${m.score} pts</b></div>`).join("")}</div>` : `<p class="small muted">No activity yet.</p>`);
}
