/* Club Analytics & Insights overview and Club Reports & Performance (#/club/reports?c=…&tab=…), from the two
   "Club Analytics Dashboard" boards. Data: public.club_analytics (a) and public.club_analytics_extra (x); analytics.view
   (executives and up, and the EWUdiots team). Charts come from charts.js; the heatmap and the funnel are plain HTML. */

const PERIODS = [["3", "Last 3 months"], ["6", "Last 6 months"], ["12", "Last 12 months"]];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], PARTS = ["Morning", "Afternoon", "Evening", "Night"];
const KIND = { workshop: "Workshops", seminar: "Seminars", competition: "Competitions", cultural: "Social events", concert: "Social events", club_recruitment: "Recruitment", club_event: "Club events", fair: "Fairs", sports: "Sports", other: "Others" };

/** @param {any} kit */
export function createReports(kit) {
  const { ui, icon, esc, api, store, charts } = kit;
  const period = () => (PERIODS.some(([v]) => v === kit.param("p")) ? Number(kit.param("p")) : 6);
  const extra = (c) => store.use(`club:analytics2:${c}`, () => api.analyticsExtra(c), { ttl: 120e3 });
  const pct = (n, d) => (d ? Math.round((100 * n) / d) : 0);
  const delta = (now, before) => { if (!before) return now ? `<span class="rp-up">${icon("up", "sm")} New</span>` : `<span class="rp-flat">–</span>`; const p = Math.round(((now - before) / before) * 100); return `<span class="${p >= 0 ? "rp-up" : "rp-down"}">${p >= 0 ? "↑" : "↓"} ${Math.abs(p)}%</span>`; };
  const card = (title, body, extra = "", cls = "") => `<section class="card rp-card ${cls}"><div class="rp-ch"><h3>${title}</h3>${extra}</div>${body}</section>`;
  const periodSelect = (c, route, tab) => `<label class="rp-period"><span class="sr-only">Period</span><select class="input" id="rp-p" data-route="${route}" data-tab="${tab}" data-c="${c}">${PERIODS.map(([v, l]) => `<option value="${v}" ${Number(v) === period() ? "selected" : ""}>${l}</option>`).join("")}</select></label>`;

  /* ── Analytics & Insights: Overview ── */
  function overview(a, c) {
    const club = kit.membership(c) || store.peek(`clubid:${c}`) || {}, xe = extra(c), n = period();
    const g = a.growth.slice(-n), em = a.events_monthly.slice(-n), months = g.map((x) => charts.monthLabel(x.m));
    return ui.view(xe, (x) => {
      const eng = x.engagement, active = g.at(-1)?.active || 0, engRate = pct(active, a.members);
      const forms = a.recruitment.filter((f) => f.statuses), f = forms[0], s = f?.statuses || {}, total = Object.values(s).reduce((p, q) => p + q, 0);
      const funnel = [["Applied", total], ["Shortlisted", (s.shortlisted || 0) + (s.interview || 0) + (s.accepted || 0)], ["Interviewed", (s.interview || 0) + (s.accepted || 0)], ["Selected", s.accepted || 0]];
      const depts = Object.entries(a.by_department).sort((p, q) => q[1] - p[1]), top = depts.slice(0, 6), rest = depts.slice(6).reduce((p, [, v]) => p + v, 0);
      return `<section class="rp-club">${ui.logo(club, "lg")}<div class="min0"><b class="rp-club-n">${esc(club.name || "Club")}</b>${club.tagline ? `<p class="xs">${esc(club.tagline)}</p>` : ""}
          <div class="rp-club-s">${[["users", a.members, "Total Members"], ["file", a.events, "Total Events"], ["user", x.executives, "Executive Members"]].map(([ic, v, l]) => `<span>${icon(ic, "sm")}<b>${v}</b><i>${l}</i></span>`).join("")}</div></div></section>
        <div class="rp-kpis">${[["users", "blue", a.members, "Total Members", delta(a.members, x.members_6m)], ["bars", "green", active, "Active Members", delta(active, g[0]?.active || 0)],
          ["calendar", "purple", a.events, "Events Organized", delta(a.events, x.events_6m)], ["community", "orange", x.participants, "Total Event Participants", delta(x.participants, x.participants_prev)]]
          .map(([ic, tone, v, l, d]) => `<div class="rp-kpi"><span class="itile ${tone}">${icon(ic)}</span><div class="min0"><b>${v.toLocaleString()}</b><span>${l}</span></div><p>${d} <i>vs ${n} months ago</i></p></div>`).join("")}</div>
        <div class="rp-grid">
          ${card("Member Growth", charts.line({ title: "Total and active members per month", labels: months, series: [{ name: "Total Members", values: g.map((v) => v.total), area: true }, { name: "Active Members", values: g.map((v) => v.active), area: true }] }))}
          ${card("Department-wise Members", depts.length ? charts.donut({ title: "Members by department", items: [...top.map(([label, value]) => ({ label, value })), ...(rest ? [{ label: "Others", value: rest }] : [])], center: String(a.members), sub: "Members" }) : empty("No members yet"))}
          ${card("Event Participation", charts.bars({ title: "Registrations and attendance per month", labels: em.map((v) => charts.monthLabel(v.m)), series: [{ name: "Registrations", values: em.map((v) => v.registrations) }, { name: "Attendance", values: em.map((v) => v.attendance) }] }))}
          ${card("Engagement Rate", `<div class="rp-eng">${charts.ring({ value: engRate / 100, label: `${engRate}%`, sub: "Active engagement", tone: "good" })}
              <ul>${[["file", "purple", eng.posts, "Posts"], ["heart", "pink", eng.reactions, "Reactions"], ["chat", "green", eng.comments, "Comments"], ["send", "blue", eng.messages, "Chat messages"]].map(([ic, t, v, l]) => `<li><span class="itile sm ${t}">${icon(ic)}</span><span><b>${v}</b><i>${l}</i></span></li>`).join("")}</ul></div><p class="xs">Last 90 days</p>`)}
          ${card(`Recruitment Funnel${f ? ` <span class="xs">(${esc(f.title)})</span>` : ""}`, f && total ? `<div class="rp-funnel">${funnel.map(([l, v], i) => `<div class="rp-step s${i}"><b>${v}</b><span>${l}</span><i>${pct(v, total)}%</i></div>`).join("")}</div>` : empty("No applications yet", "Membership and volunteer forms show here."))}
          ${card("Top Performing Events", a.top_events.length ? `<div class="rp-top">${a.top_events.map((e, i) => `<a href="#/club/event?id=${e.id}">${e.image ? `<img src="${esc(e.image)}" alt="" loading="lazy">` : `<span class="itile sm purple">${icon("calendar")}</span>`}<span class="min0"><b>${esc(e.title)}</b><i>${e.participants} participants</i></span>${i === 0 && e.participants ? `<span class="rp-hot">${icon("flame", "sm")}</span>` : ""}</a>`).join("")}</div>` : empty("No events yet"), `<a class="rp-more" href="#/club/reports?c=${c}&tab=events">View all ${icon("chevR", "sm")}</a>`)}
        </div>`;
    }, { n: 4, h: 180 });
  }
  const empty = (t, d = "") => `<div class="rp-empty">${icon("bars")}<b>${t}</b>${d ? `<span>${d}</span>` : ""}</div>`;

  /* ── Reports & Performance ── */
  const TABS = [["monthly", "Monthly Reports"], ["events", "Event Reports"], ["members", "Member Reports"], ["engagement", "Engagement"], ["export", "Export"]];
  function reportsPage() {
    const c = kit.param("c") || kit.clubsWith("analytics.view")[0]?.club_id || "", t = TABS.some(([v]) => v === kit.param("tab")) ? kit.param("tab") : "monthly";
    const gate = kit.memberGate(c, "club reports"); if (gate) return gate;
    if (!kit.can(c, "analytics.view")) return ui.emptyBox("lock", "For the club's executives", "Reports need the analytics permission (executives and up).");
    const ae = store.use(`club:analytics:${c}`, () => api.analytics(c), { ttl: 120e3 });
    return `${kit.back(`#/club/analytics?c=${c}`, "Analytics")}
      <header class="rp-head"><div class="min0"><h1>Club Reports &amp; Performance</h1><p>Detailed insights, reports and downloadable analytics</p></div>${periodSelect(c, "reports", t)}</header>
      <nav class="rp-tabs" role="tablist">${TABS.map(([v, l]) => `<a role="tab" href="#/club/reports?c=${c}&tab=${v}&p=${period()}" aria-selected="${v === t}">${l}</a>`).join("")}</nav>
      ${ui.view(ae, (a) => ui.view(extra(c), (x) => REPORT[t](a, x, c)), { n: 4, h: 180 })}`;
  }
  const REPORT = {
    monthly(a, x) {
      const n = period(), g = a.growth.slice(-n), mp = x.monthly_participants.slice(-n), labels = g.map((v) => charts.monthLabel(v.m));
      return `<div class="rp-grid">${card("Monthly Performance", charts.line({ title: "New members, active members and event participants per month", labels, series: [{ name: "New Members", values: g.map((v) => v.new) }, { name: "Active Members", values: g.map((v) => v.active), area: true }, { name: "Event Participants", values: mp.map((v) => v.n), area: true }] }), "", "wide")}
        ${card("Key Insights", insights(a, x))}${retention(x)}${categories(x)}${heatmap(x)}</div>`;
    },
    events(a, x) {
      const em = a.events_monthly.slice(-period());
      return `<div class="rp-grid">${card("Registrations vs Attendance", charts.bars({ title: "Registrations and attendance per month", labels: em.map((v) => charts.monthLabel(v.m)), series: [{ name: "Registrations", values: em.map((v) => v.registrations) }, { name: "Attendance", values: em.map((v) => v.attendance) }] }))}
        ${categories(x)}${card("Top Performing Events", a.top_events.length ? `<div class="rp-top">${a.top_events.map((e) => `<a href="#/club/event?id=${e.id}"><span class="itile sm purple">${icon("calendar")}</span><span class="min0"><b>${esc(e.title)}</b><i>${ui.dateShort(e.starts_at)} · ${e.participants} participants</i></span></a>`).join("")}</div>` : empty("No events yet"))}
        ${card("Show-up rate", (() => { const r = em.reduce((p, v) => p + v.registrations, 0), at = em.reduce((p, v) => p + v.attendance, 0); return `<div class="rp-eng">${charts.ring({ value: r ? at / r : 0, label: `${pct(at, r)}%`, sub: "Came after registering", tone: "good" })}<p class="small muted">${at} of ${r} registrations checked in over the last ${period()} months.</p></div>`; })())}</div>`;
    },
    members(a, x, c) {
      const g = a.growth.slice(-period());
      return `<div class="rp-grid">${card("Joins and leaves", charts.bars({ title: "New and leaving members per month", labels: g.map((v) => charts.monthLabel(v.m)), series: [{ name: "Joined", values: g.map((v) => v.new) }, { name: "Left", values: g.map((v) => v.left) }] }))}
        ${retention(x)}${card("Members by Batch", charts.bars({ title: "Members by batch", labels: Object.keys(a.by_batch).sort(), series: [{ name: "Members", values: Object.keys(a.by_batch).sort().map((k) => a.by_batch[k]) }] }))}
        ${card("Most Active Members", a.top_members.length ? `<div class="rp-top">${a.top_members.map((m) => `<a href="#/club/member?c=${c}&u=${m.user_id}">${ui.ava(m.display_name, m.photo_url, "sm")}<span class="min0"><b>${esc(m.display_name)}</b><i>${esc(m.role_name)} · ${m.score} activity points</i></span></a>`).join("")}</div>` : empty("No activity yet"))}</div>`;
    },
    engagement(a, x) {
      const e = x.engagement;
      return `<div class="rp-grid">${card("Engagement (last 90 days)", charts.hbars({ title: "Engagement in the last 90 days", items: [["Chat messages", e.messages], ["Reactions", e.reactions], ["Comments", e.comments], ["Posts", e.posts]].map(([label, value], i) => ({ label, value, slot: i })) }))}
        ${heatmap(x)}${card("Event satisfaction", `<div class="rp-eng">${charts.ring({ value: (a.feedback.avg || 0) / 5, label: a.feedback.avg ? String(a.feedback.avg) : "–", sub: "out of 5", tone: "good" })}<p class="small muted">${a.feedback.count} feedback responses · ${a.feedback.positive ?? 0}% gave 4–5 stars.</p></div>`)}
        ${card("Inactive members", `<p class="rp-big">${a.inactive}</p><p class="small muted">Members quiet for 30+ days. Send them a reminder from Analytics → Engagement.</p>`)}</div>`;
    },
    export(a, x, c) {
      return `<section class="card rp-card"><div class="rp-ch"><h3>Download Reports</h3></div><div class="rp-dl">${DOWNLOADS.map(([id, ic, tone, l, d]) => `<div class="rp-dli"><span class="itile ${tone}">${icon(ic)}</span><span class="min0"><b>${l}</b><i>${d}</i></span><button class="btn sm outline" data-dl="${id}">${icon("download", "sm")} Download</button></div>`).join("")}</div>
        <p class="xs mt">CSV files open in Excel or Google Sheets. "Print" makes a PDF of the report you're viewing.</p><button class="btn outline mt-s" id="rp-print">${icon("print", "sm")} Print or save as PDF</button></section>`;
    }
  };
  const DOWNLOADS = [["monthly", "file", "red", "Monthly Activity Report", "CSV · members, activity, participants"], ["events", "calendar", "purple", "Event Report", "CSV · registrations and attendance"], ["members", "users", "green", "Member Breakdown", "CSV · departments and batches"], ["engagement", "heart", "orange", "Engagement Report", "CSV · posts, reactions, heatmap"]];

  function insights(a, x) {
    const g = a.growth, n = period(), now = g.at(-1) || {}, then = g.at(-n - 1) || g[0] || {}, newN = g.slice(-n).reduce((p, v) => p + v.new, 0);
    const em = a.events_monthly, att = em.slice(-n).reduce((p, v) => p + v.attendance, 0), attPrev = em.slice(-2 * n, -n).reduce((p, v) => p + v.attendance, 0);
    const r = x.retention, keep = pct(r.joined - r.left, r.joined), drop = x.retention_trend.find((v) => v.pct < 80);
    const items = [["trend", "green", "Member Growth", `${newN} new members in the last ${n} months${then.total ? ` (${delta(now.total || 0, then.total)})` : ""}.`],
      ["calendar", "purple", "Event Participation", att ? `${att} check-ins at events in the last ${n} months${attPrev ? `, ${delta(att, attPrev)} vs the ${n} months before` : ""}.` : "No event check-ins yet. Use QR tickets to track who comes."],
      ["chat", "blue", "Engagement", `${x.engagement.messages} chat messages and ${x.engagement.reactions + x.engagement.comments} reactions and comments in 90 days.`],
      drop ? ["alert", "red", "Room for Improvement", `Only ${drop.pct}% of members are still here ${drop.m} month${drop.m === 1 ? "" : "s"} after joining. Plan follow-up activities for new members.`]
        : a.inactive ? ["alert", "red", "Room for Improvement", `${a.inactive} members have been quiet for 30+ days. A reminder or a small event can bring them back.`] : ["checkc", "green", "Healthy club", `${keep}% of this year's new members are still in the club.`]];
    return `<div class="rp-ins">${items.map(([ic, t, h, d]) => `<div><span class="itile sm ${t}">${icon(ic)}</span><span class="min0"><b>${h}</b><p>${d}</p></span></div>`).join("")}</div>`;
  }
  function retention(x) {
    const r = x.retention, still = r.active, left = r.left, inactive = Math.max(0, r.joined - still - left), keep = pct(r.joined - left, r.joined), tr = x.retention_trend;
    return card("Member Retention", r.joined ? `<div class="rp-eng">${charts.donut({ title: "Members who joined in the last 12 months", items: [{ label: "Still active", value: still }, { label: "Inactive", value: inactive }, { label: "Left club", value: left }], center: `${keep}%`, sub: "Retention" })}</div>
        ${tr.length > 1 ? `<h4 class="rp-sub">Retention trend</h4>${charts.line({ title: "Share of members still in the club after N months", labels: tr.map((v) => `${v.m}M`), series: [{ name: "Still in the club", values: tr.map((v) => v.pct) }], fmt: (v) => `${v}%`, height: 140 })}` : ""}` : empty("No new members in 12 months"), `<span class="rp-badge">${icon("sparkle", "sm")} Auto insights</span>`);
  }
  function categories(x) {
    const by = {}; Object.entries(x.event_kinds).forEach(([k, v]) => { const l = KIND[k] || "Others"; by[l] = (by[l] || 0) + v; });
    const list = Object.entries(by).sort((p, q) => q[1] - p[1]), total = list.reduce((p, [, v]) => p + v, 0);
    return card("Popular Activity Categories", list.length ? charts.hbars({ title: "Events by category", items: list.map(([label, value], i) => ({ label, value, text: `${pct(value, total)}%`, max: total, slot: 0 })) }) : empty("No events yet"));
  }
  function heatmap(x) {
    const cell = {}; x.heatmap.forEach((h) => { cell[`${(h.d + 6) % 7}|${h.p}`] = h.n; });
    const max = Math.max(1, ...Object.values(cell)), lvl = (n) => (n ? Math.min(4, Math.ceil((4 * n) / max)) : 0);
    return card("Member Activity Heatmap", `<div class="rp-heat" role="table" aria-label="Activity by day and time, last 90 days"><span></span>${DAYS.map((d) => `<b role="columnheader">${d}</b>`).join("")}
        ${PARTS.map((p, pi) => `<i role="rowheader">${p}</i>${DAYS.map((d, di) => { const n = cell[`${di}|${pi}`] || 0; return `<span class="h${lvl(n)}" role="cell" title="${d} ${p.toLowerCase()}: ${n} activities" aria-label="${d} ${p}: ${n}"></span>`; }).join("")}`).join("")}</div>
      <div class="rp-heat-key"><span>Low</span><span class="h1"></span><span class="h2"></span><span class="h3"></span><span class="h4"></span><span>High activity</span></div>`);
  }

  /* CSV files built in the browser from the same numbers the charts use. */
  function csv(kind, a, x) {
    const rows = kind === "monthly" ? [["Month", "Total members", "Active members", "New", "Left", "Event participants"], ...a.growth.map((g, i) => [g.m, g.total, g.active, g.new, g.left, x.monthly_participants[i]?.n ?? 0])]
      : kind === "events" ? [["Month", "Registrations", "Attendance"], ...a.events_monthly.map((e) => [e.m, e.registrations, e.attendance]), [], ["Top event", "Participants"], ...a.top_events.map((e) => [e.title, e.participants])]
      : kind === "members" ? [["Department", "Members"], ...Object.entries(a.by_department), [], ["Batch", "Members"], ...Object.entries(a.by_batch)]
      : [["Measure (last 90 days)", "Count"], ...Object.entries(x.engagement), [], ["Day", ...PARTS], ...DAYS.map((d, di) => [d, ...PARTS.map((_, pi) => x.heatmap.find((h) => (h.d + 6) % 7 === di && h.p === pi)?.n || 0)])];
    return rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  }
  function mount(el) {
    kit.bindRetry(el);
    kit.$("#rp-p", el)?.addEventListener("change", (e) => { const s = e.target; kit.go(`#/club/${s.dataset.route}?c=${s.dataset.c}&tab=${s.dataset.tab}&p=${s.value}`); });
    kit.$("#rp-print", el)?.addEventListener("click", () => window.print());
    kit.$$("[data-dl]", el).forEach((b) => b.addEventListener("click", () => {
      const c = kit.param("c"), a = store.peek(`club:analytics:${c}`), x = store.peek(`club:analytics2:${c}`); if (!a || !x) return;
      const name = `${(kit.membership(c)?.short_name || "club").replace(/\W+/g, "-")}-${b.dataset.dl}-${new Date().toISOString().slice(0, 10)}.csv`;
      const url = URL.createObjectURL(new Blob(["﻿" + csv(b.dataset.dl, a, x)], { type: "text/csv" }));
      Object.assign(document.createElement("a"), { href: url, download: name }).click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      kit.toast("Report downloaded", "success", name);
    }));
  }
  return { overview, reportsPage, mount, periodSelect };
}
