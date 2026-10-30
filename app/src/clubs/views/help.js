/* Help centre (#/club/help) and a support ticket (#/club/ticket?id=…), from the "Help Centre" board: report a
   problem, suggest a feature, ask a question, guides (written into the app), and ticket conversations with the
   EWUdiots team (support_tickets / support_messages; the team answers from App Admin → Support). */

const TOPICS = [["user", "green", "Account & Login", "account"], ["users", "pink", "Club Membership", "membership"], ["calendar", "blue", "Events & Registration", "events"], ["file", "purple", "Recruitment", "recruitment"],
  ["chat", "blue", "Messaging & Chat", "messaging"], ["bars", "pink", "Polls & Voting", "polls"], ["folder", "amber", "Resources & Files", "resources"], ["bag", "teal", "Merch & Orders", "store"], ["zap", "blue", "Technical Issues", "technical"]];
// Short guides. Kept in the app so they work offline and always match this version.
const GUIDES = [
  ["membership", "How to join a club?", "Open Clubs, choose a club and tap Join (open clubs) or Apply (clubs that review members). If the club invites you, you become a member automatically the next time you sign in — nothing else to do."],
  ["recruitment", "How to apply for club recruitment?", "Recruitment forms appear on the club's page and in your feed. Fill in the form; your name, student ID and email come from your account. You'll get a notification when you're shortlisted, invited to an interview or selected."],
  ["events", "How to register for an event?", "Open the event and tap Register. Your QR ticket appears on the event and in Me → Tickets. Show it at the door; the organisers scan it to check you in."],
  ["account", "How to reset your password?", "On the sign-in screen tap “Forgot password”, enter your email and type the code we send you."],
  ["store", "How do merch payments work?", "EWUdiots never handles money. At checkout you pay the club's bKash / Nagad / Rocket number (or cash at pickup) and type the transaction ID. The club checks it and confirms your order. Collect it with your pickup QR and student ID."],
  ["messaging", "Who can message me?", "Only members of a club you're in can send you direct messages, and only inside that club. Report any message with the Report button."],
  ["polls", "Are elections anonymous?", "Yes. Who voted and what was chosen are stored separately, so nobody — not even the club admin — can see your choice."],
  ["membership", "What can each position do?", "The Club Admin gives positions (President, Secretary, Treasurer, Executive Member, Merch Manager…). Each position comes with permissions, for example only Treasurers and above can send refunds."]
];

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store, ctx } = kit;
  let q = "", topic = "";

  pages["club/help"] = () => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const guides = GUIDES.filter(([t, title, body]) => (!topic || t === topic) && (!words.length || words.every((w) => `${title} ${body}`.toLowerCase().includes(w))));
    const te = kit.me() && api ? store.use("me:tickets", api.tickets, { ttl: 30e3 }) : { value: [] };
    return `${ui.ph("Help Center", "Get support, find answers, and suggest improvements")}
      <div class="searchbar cl-search">${icon("search")}<input class="input" id="hp-q" type="search" placeholder="Search for help articles, guides, or issues…" value="${esc(q)}" autocomplete="off"></div>
      <div class="cl-help mt">${[["problem", "t-purple", "#4f2bff", "chat", "Report a Problem", "Facing an issue? Let us know."], ["feature", "t-green", "#16a34a", "bulb", "Suggest a Feature", "Share your ideas to make EWUdiots better."],
        ["question", "t-blue", "#2563eb", "help", "Ask a Question", "Get help from our support team."], ["guides", "t-pink", "#e11d48", "book", "Browse Guides", "Learn how to use club features."]].map(([k, cl, bg, ic, t, d]) => `<button class="${cl}" data-act="${k}"><span class="big" style="background:${bg}">${icon(ic)}</span><b>${t}</b><span>${d}</span></button>`).join("")}</div>
      ${ui.sec("Common Help Topics")}<div class="cl-folders">${TOPICS.map(([ic, tone, l, k]) => `<button class="cl-folder" data-topic="${k}" aria-pressed="${topic === k}" style="font:inherit;cursor:pointer;${topic === k ? "border-color:var(--primary)" : ""}"><span class="itile sm ${tone}">${icon(ic)}</span><span class="min0"><b class="ellipsis">${l}</b><span>${ui.plural(GUIDES.filter((g) => g[0] === k).length, "article")}</span></span></button>`).join("")}</div>
      ${ui.sec(topic ? "Articles" : "Recent Articles", topic ? `<button class="btn sm ghost" id="hp-all">Show all</button>` : "")}
      <div class="stack">${guides.map(([, title, body]) => `<details class="card"><summary class="row between" style="cursor:pointer"><b>${esc(title)}</b>${icon("chevD", "sm")}</summary><p class="mt-s" style="color:var(--text-2);line-height:1.6">${esc(body)}</p></details>`).join("") || `<p class="small muted">No article matches. Ask us instead.</p>`}</div>
      ${kit.me() ? `${ui.sec("My Tickets")}${ui.view(te, (rows) => (rows.length ? `<div class="cl-list">${rows.map((t) => `<a class="cl-li" href="#/club/ticket?id=${t.id}"><span class="itile sm purple">${icon("ticket")}</span><span class="body"><b>#${t.id} · ${esc(t.subject)}</b><span>Updated ${ui.ago(t.updated_at)}</span></span>${ui.st(t.status === "open" ? ["Open", "blue"] : t.status === "pending" ? ["Answered", "amber"] : t.status === "resolved" ? ["Resolved", "green"] : ["Closed", "gray"])}</a>`).join("")}</div>` : `<p class="small muted">No tickets yet.</p>`))}` : ""}
      <p class="xs mt" style="text-align:center">EWUdiots is run by students. Unofficial · not affiliated with EWU.</p>`;
  };
  pages["club/help"].mount = (el) => {
    kit.bindRetry(el);
    const input = kit.$("#hp-q", el);
    input?.addEventListener("input", () => { q = input.value; const pos = input.selectionStart; ctx.rerender(); const i = kit.$("#hp-q"); if (i) { i.focus(); i.setSelectionRange(pos, pos); } });
    kit.$$("[data-topic]", el).forEach((b) => b.addEventListener("click", () => { topic = topic === b.dataset.topic ? "" : b.dataset.topic; ctx.rerender(); }));
    kit.$("#hp-all", el)?.addEventListener("click", () => { topic = ""; ctx.rerender(); });
    kit.$$("[data-act]", el).forEach((b) => b.addEventListener("click", () => (b.dataset.act === "guides" ? kit.$("details", el)?.scrollIntoView({ behavior: "smooth" }) : newTicket(b.dataset.act))));
    if (kit.param("order")) { const code = kit.param("order"); history.replaceState(null, "", "#/club/help"); newTicket("problem", "store", `Help with order ${code}`); }
  };
  function newTicket(kind, category = "", subject = "") {
    if (!kit.me()) return kit.go("#/login?from=profile");
    const titles = { problem: "Report a problem", feature: "Suggest a feature", question: "Ask a question" };
    ui.sheet(titles[kind], `<form id="tk" class="stack">${ui.field("Topic", ui.select("category", [...TOPICS.map(([, , l, k]) => [k, l]), ["feature", "New feature"], ["question", "General question"], ["other", "Something else"]], category || (kind === "feature" ? "feature" : kind === "question" ? "question" : "technical")))}
      ${ui.field("Subject", ui.input("subject", subject, 'required maxlength="140"'))}${ui.field(kind === "problem" ? "What happened? What did you expect?" : "Details", ui.area("body", "", 'required rows="5" maxlength="4000"'))}
      ${kind === "problem" ? ui.field("How urgent?", ui.select("priority", [["low", "Low"], ["medium", "Medium"], ["high", "High — I'm blocked"]], "medium")) : ""}
      <button type="button" class="btn outline" id="tk-file">${icon("paperclip")} Add a screenshot</button><span class="xs" id="tk-n"></span>
      <p class="xs">We include your app version (${esc(kit.ctx.APP_VERSION)}) and device so we can reproduce it. Nothing else.</p><div id="cl-err"></div><button class="btn primary block">${icon("send")} Send</button></form>`, (s) => {
      const files = [];
      kit.$("#tk-file", s).addEventListener("click", async () => { if (files.length >= 4) return; const f = await ui.pickFile("image/*"); if (f) { files.push(await ui.shrink(f)); kit.$("#tk-n", s).textContent = ui.plural(files.length, "file"); } });
      kit.$("#tk", s).addEventListener("submit", async (e) => {
        e.preventDefault(); const f = ui.values(e.target), btn = e.target.querySelector("button.primary"); ctx.busy(btn, true, "Sending…");
        try {
          const attachments = []; for (const x of files) attachments.push({ path: await api.uploadTicketFile(x), name: x.name, mime: x.type, size: x.size });
          const body = `${f.body}\n\n— EWUdiots ${kit.ctx.APP_VERSION} · ${navigator.userAgent.slice(0, 160)}`;
          const t = await api.openTicket({ kind, category: f.category, priority: f.priority || "medium", subject: f.subject.trim(), body: body.slice(0, 4000), attachments });
          ctx.closeModal(); store.invalidate("me:tickets"); kit.go(`#/club/ticket?id=${t.id}`);
        } catch (err) { ctx.busy(btn, false); ui.fail(s, err.message); }
      });
    });
  }

  pages["club/ticket"] = () => {
    const g = kit.gate("your tickets"); if (g) return g;
    const id = kit.param("id"), te = store.use(`ticket:${id}`, () => api.ticket(id), { ttl: 20e3 }), me = store.use(`ticket:msgs:${id}`, () => api.ticketMessages(id), { ttl: 20e3 });
    return kit.back("#/club/help", "Help Center") + ui.view(te, (t) => {
      if (!t) return ui.emptyBox("ticket", "Ticket not found", "");
      const cat = TOPICS.find((x) => x[3] === t.category);
      return `<div class="row" style="gap:10px"><h1 style="font-size:24px">Ticket #${t.id}</h1>${ui.st(t.status === "open" ? ["Open", "blue"] : t.status === "pending" ? ["Answered", "amber"] : t.status === "resolved" ? ["Resolved", "green"] : ["Closed", "gray"], "checkc")}</div><p class="xs">Created on ${ui.dateTime(t.created_at)}</p>
        <section class="card mt"><div class="row nowrap" style="gap:12px"><span class="itile purple">${icon(cat?.[0] || "ticket")}</span><div class="min0"><b style="font-size:17px">${esc(t.subject)}</b></div></div>
          <div class="cl-facts">${[["file", "Category", cat?.[2] || t.category], ["flag", "Priority", t.priority[0].toUpperCase() + t.priority.slice(1)], ["users", "Assigned to", "Support Team"]].map(([ic, l, v]) => `<div class="cl-fact">${icon(ic)}<div><span>${l}</span><b>${esc(v)}</b></div></div>`).join("")}</div></section>
        ${ui.sec("Conversation")}<div class="cl-thread">
          <div class="cl-msg mine"><div><div class="cl-bubble">${ui.rich(t.body)}</div>${(t.attachments || []).map((a) => `<button class="cl-att" data-att="${esc(a.path)}" style="border:0;cursor:pointer;font:inherit">${ui.ftype(a.name, a.mime)}<span>${esc(a.name)}</span></button>`).join("")}<span class="xs">You · ${ui.dateTime(t.created_at)}</span></div></div>
          ${(me.value || []).map((m) => `<div class="cl-msg ${m.from_staff ? "" : "mine"}">${ui.ava(m.name, "", "sm")}<div><span class="who">${esc(m.from_staff ? "Support Team" : "You")}<time>${ui.dateTime(m.created_at)}</time></span><div class="cl-bubble">${ui.rich(m.body)}</div></div></div>`).join("")}</div>
        ${t.status !== "closed" ? `<form class="cl-composer" id="tk-reply"><textarea name="b" rows="1" maxlength="4000" placeholder="Type a reply…" aria-label="Reply"></textarea><button class="round go" aria-label="Send">${icon("send")}</button></form>
          <button class="btn ghost mt-s" id="tk-close">${icon("checkc", "sm")} My problem is solved — close ticket</button>` : ""}`;
    }, { n: 3, h: 100 });
  };
  pages["club/ticket"].mount = (el) => {
    kit.bindRetry(el);
    const id = kit.param("id");
    kit.$("#tk-reply", el)?.addEventListener("submit", async (e) => { e.preventDefault(); const b = String(new FormData(e.target).get("b") || "").trim(); if (!b) return; try { await api.replyTicket(Number(id), b); store.invalidate(`ticket:${id}`, `ticket:msgs:${id}`, "me:tickets"); } catch (err) { kit.toast(err.message, "error"); } });
    kit.$("#tk-close", el)?.addEventListener("click", async () => { try { await api.closeTicket(Number(id)); store.invalidate(`ticket:${id}`, "me:tickets"); } catch (err) { kit.toast(err.message, "error"); } });
    kit.$$("[data-att]", el).forEach((b) => b.addEventListener("click", async () => { try { window.open(await api.signedUrl(b.dataset.att), "_blank", "noopener"); } catch (err) { kit.toast(err.message, "error"); } }));
  };
}
