/* Help desk (Admin → Help desk): a Chatwoot-style inbox over support_tickets / support_messages (migration 0018).
   Students and club members open conversations from the app (Help → Chat with the team, Club → Help); staff with
   support.manage answer here. The database does the bookkeeping: a staff reply stamps "Support Team", moves the
   ticket to "Waiting on student" and alerts the student; a student reply re-opens it.
   Here: KPIs (open, waiting, resolved this week, median first reply), a pie by topic, conversations per day, filters,
   search, a two-pane conversation view with saved replies, assign-to-me, priority and status. Refreshes every 30s
   while open. */
import { pieHtml } from "../pie.ts";
import { barsHtml } from "../charts.ts";

const STATUS = { open: ["Open", "red"], pending: ["Waiting on student", "amber"], resolved: ["Resolved", "green"], closed: ["Closed", ""] };
const TOPIC = { account: "Account", membership: "Membership", events: "Events", recruitment: "Recruitment", messaging: "Messages", polls: "Polls", resources: "Resources", store: "Store", technical: "Technical", feature: "Feature idea", question: "Question", other: "Other" };
// Saved replies: one tap fills the box; staff edit before sending.
const SAVED = [
  ["Sync again", "Thanks for telling us! Please open Sync Portal and sync your Grade Report again, then check My Courses. If it still looks wrong, send a screenshot of the Completed tab here."],
  ["Password reset", "You can reset your password from Sign in → Forgot password. We just sent a reset code to your EWU email as well."],
  ["Certificate", "Certificates appear in Club → Me → Certificates once the club publishes them. We've reminded the club."],
  ["Thanks, fixed", "Thanks for reporting this. It's fixed in the latest version; update the app and it should work. Reply here if it doesn't."],
  ["Need details", "Thanks! Could you tell us your app version (More → About) and what you tapped just before it happened? A screenshot helps a lot."]
];

export function createHelpdesk({ api, $, $$, esc, icon, toast, act, ago }) {
  let filter = "open", q = "", sel = null, timer = 0;
  const minutes = (a, b) => (new Date(b) - new Date(a)) / 6e4;
  const human = (m) => (m == null ? "—" : m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} d`);

  function stats(tickets, msgs) {
    const firstReply = tickets.map((t) => { const r = msgs.filter((m) => m.ticket_id === t.id && m.from_staff).sort((a, b) => a.created_at.localeCompare(b.created_at))[0]; return r ? minutes(t.created_at, r.created_at) : null; }).filter((x) => x != null).sort((a, b) => a - b);
    const week = Date.now() - 7 * 864e5;
    const days = [...Array(14)].map((_, i) => { const d = new Date(Date.now() - (13 - i) * 864e5); const k = d.toDateString(); return { label: i % 2 ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), value: tickets.filter((t) => new Date(t.created_at).toDateString() === k).length, title: `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}: ` }; });
    days.forEach((d) => { d.title += `${d.value} new`; });
    return { open: tickets.filter((t) => t.status === "open").length, pending: tickets.filter((t) => t.status === "pending").length,
      solved: tickets.filter((t) => ["resolved", "closed"].includes(t.status) && new Date(t.updated_at) > week).length,
      median: firstReply.length ? firstReply[Math.floor(firstReply.length / 2)] : null, days };
  }

  const pick = (t) => (filter === "all" || (filter === "mine" ? t.assigned_to === api.uid && !["resolved", "closed"].includes(t.status) : t.status === filter))
    && (!q || `${t.subject} ${t.name} ${t.email} #${t.id}`.toLowerCase().includes(q.toLowerCase()));

  function thread(t, msgs) {
    const st = STATUS[t.status] || ["?", ""];
    const bubbles = [{ from_staff: false, name: t.name || t.email, body: t.body, created_at: t.created_at }, ...msgs.filter((m) => m.ticket_id === t.id).sort((a, b) => a.created_at.localeCompare(b.created_at))];
    return `<div class="hd-conv-h"><div class="min0 grow"><b class="ellipsis" style="display:block">#${t.id} · ${esc(t.subject)}</b><span class="xs">${esc(t.name || "")} · ${esc(t.email || "")} · ${esc(TOPIC[t.category] || t.category)}</span></div>
        <span class="pill ${st[1]}">${st[0]}</span></div>
      <div class="hd-msgs" id="hd-msgs">${bubbles.map((m) => `<div class="hd-b ${m.from_staff ? "staff" : "user"}"><p>${esc(m.body)}</p><span class="xs">${esc(m.from_staff ? "Support Team" : m.name || "Student")} · ${ago(m.created_at)}</span></div>`).join("")}</div>
      <div class="hd-saved" role="group" aria-label="Saved replies">${SAVED.map(([l], i) => `<button class="chip" data-saved="${i}">${esc(l)}</button>`).join("")}</div>
      <form class="hd-reply" id="hd-reply"><label class="sr-only" for="hd-text">Reply</label><textarea class="input" id="hd-text" name="body" rows="3" maxlength="4000" required placeholder="Write a reply… (Ctrl+Enter sends)"></textarea>
        <div class="row between mt-s" style="gap:8px;flex-wrap:wrap"><div class="row" style="gap:6px;flex-wrap:wrap">
          ${t.assigned_to === api.uid ? `<span class="pill purple">${icon("user", "sm")} Yours</span>` : `<button type="button" class="btn sm outline" id="hd-mine">${icon("user", "sm")} Assign to me</button>`}
          <select class="select sm" id="hd-pri" aria-label="Priority">${["low", "medium", "high"].map((p) => `<option value="${p}" ${t.priority === p ? "selected" : ""}>${p[0].toUpperCase() + p.slice(1)} priority</option>`).join("")}</select>
          ${["resolved", "closed"].includes(t.status) ? `<button type="button" class="btn sm outline" data-st="open">${icon("sync", "sm")} Re-open</button>` : `<button type="button" class="btn sm outline" data-st="resolved">${icon("checkc", "sm")} Resolve</button>`}</div>
          <button class="btn primary">${icon("arrow")} Send reply</button></div></form>`;
  }

  async function view(el) {
    clearInterval(timer);
    const [tickets, msgs] = await Promise.all([api.list("support_tickets", { order: "updated_at", limit: 300 }), api.list("support_messages", { limit: 2000, select: "id, ticket_id, from_staff, name, body, created_at" })]);
    const s = stats(tickets, msgs), shown = tickets.filter(pick), count = (f) => tickets.filter((t) => { const o = filter; filter = f; const r = pick(t); filter = o; return r; }).length;
    if (sel && !tickets.some((t) => t.id === sel)) sel = null;
    if (!sel && innerWidth > 960 && shown[0]) sel = shown[0].id;
    const cur = tickets.find((t) => t.id === sel);
    const topics = Object.entries(tickets.reduce((m, t) => ((m[t.category] = (m[t.category] || 0) + 1), m), {})).map(([k, v]) => ({ label: TOPIC[k] || k, value: v }));
    el.innerHTML = `<div class="kpis">${[["alert", "red", s.open, "Open"], ["clock", "orange", s.pending, "Waiting on student"], ["checkc", "green", s.solved, "Resolved this week"], ["zap", "purple", human(s.median), "Median first reply"]]
        .map(([i, t, v, l], k) => `<div class="kpi fx-rise" style="--i:${k}"><span class="itile ${t}">${icon(i)}</span><b>${v}</b><span>${l}</span></div>`).join("")}</div>
      <div class="grid g2 mt"><section class="card fx-rise"><div class="card-h"><h2>Conversations by topic</h2><span class="pill">${tickets.length}</span></div>${pieHtml(topics, { center: String(tickets.length), sub: "total", aria: "Conversations by topic" })}</section>
        <section class="card fx-rise"><div class="card-h"><h2>New conversations, 14 days</h2></div>${barsHtml(s.days, { aria: "New conversations per day, last 14 days" })}</section></div>
      <div class="row mt" style="gap:8px;flex-wrap:wrap"><div class="seg">${[["open", "Open"], ["pending", "Waiting"], ["mine", "Mine"], ["resolved", "Resolved"], ["all", "All"]].map(([v, l]) => `<button data-hf="${v}" aria-selected="${filter === v}">${l} (${count(v)})</button>`).join("")}</div>
        <form class="searchbar grow" id="hd-q">${icon("search")}<input class="input" name="q" type="search" value="${esc(q)}" placeholder="Search subject, name, email or #id" aria-label="Search conversations"></form></div>
      <div class="hd mt"><section class="card tight hd-list">${shown.length ? shown.map((t) => { const st = STATUS[t.status] || ["?", ""], last = msgs.filter((m) => m.ticket_id === t.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
          return `<button class="hd-item${t.id === sel ? " on" : ""}" data-t="${t.id}"><span class="avatar sm">${esc((t.name || t.email || "?").slice(0, 2).toUpperCase())}</span><span class="body min0"><b class="ellipsis">${esc(t.subject)}</b><span class="ellipsis">${esc(last ? `${last.from_staff ? "You: " : ""}${last.body}` : t.body)}</span></span>
            <span class="hd-meta"><span class="xs">${ago(t.updated_at)}</span><span class="dot-st ${st[1]}" title="${st[0]}"></span>${t.priority === "high" ? `<span class="pill red xs">High</span>` : ""}</span></button>`; }).join("")
          : `<p class="small muted" style="padding:16px">No conversations here. ${filter === "open" ? "All caught up!" : ""}</p>`}</section>
        <section class="card hd-conv" id="hd-conv">${cur ? thread(cur, msgs) : `<p class="small muted">Pick a conversation to read and reply.</p>`}</section></div>`;

    $$("[data-hf]", el).forEach((b) => b.addEventListener("click", () => { filter = b.dataset.hf; sel = null; view(el); }));
    $("#hd-q", el).addEventListener("submit", (e) => { e.preventDefault(); q = String(new FormData(e.target).get("q") || ""); view(el); });
    $$("[data-t]", el).forEach((b) => b.addEventListener("click", () => { sel = Number(b.dataset.t); view(el).then(() => { if (innerWidth <= 960) $("#hd-conv", el)?.scrollIntoView({ behavior: "smooth" }); }); }));
    const box = $("#hd-msgs", el); if (box) box.scrollTop = box.scrollHeight;
    if (cur) {
      const text = $("#hd-text", el), form = $("#hd-reply", el);
      $$("[data-saved]", el).forEach((b) => b.addEventListener("click", () => { text.value = SAVED[Number(b.dataset.saved)][1]; text.focus(); }));
      text.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) form.requestSubmit(); });
      const save = async (label, patch) => { try { await act(label, `#${cur.id}`, () => api.update("support_tickets", { id: cur.id }, patch)); view(el); } catch (e) { toast(e.message, "error"); } };
      $("#hd-mine", el)?.addEventListener("click", () => save("Took a conversation", { assigned_to: api.uid }));
      $("#hd-pri", el).addEventListener("change", (e) => save("Changed priority", { priority: e.target.value }));
      $$("[data-st]", el).forEach((b) => b.addEventListener("click", () => save(b.dataset.st === "resolved" ? "Resolved a conversation" : "Re-opened a conversation", { status: b.dataset.st })));
      form.addEventListener("submit", async (e) => {
        e.preventDefault(); const body = text.value.trim(); if (!body) return;
        const btn = form.querySelector("button.primary"); btn.disabled = true;
        try {
          await act("Replied to a conversation", `#${cur.id}`, () => api.insert("support_messages", { ticket_id: cur.id, body, from_staff: true, name: "Support Team" }));
          if (api.kind === "demo") await api.update("support_tickets", { id: cur.id }, { status: "pending", updated_at: new Date().toISOString() }); // the server's trigger does this live
          toast("Reply sent", "success", "The student gets a notification."); view(el);
        } catch (err) { btn.disabled = false; toast(err.message, "error"); }
      });
    }
    timer = setInterval(() => { if (!document.body.contains(el)) return clearInterval(timer); if (!el.contains(document.activeElement) || document.activeElement === document.body) view(el); }, 30000);
  }
  return view;
}
