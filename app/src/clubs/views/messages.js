/* Messages (#/club/messages) and a conversation (#/club/chat?id=…), from the "Messaging App" board.
   Channels per club: Announcements (writers post), General Members, Executive Team, wing/team groups, and direct
   messages between members of the same club (public.open_dm refuses anyone else). New messages arrive live through
   Supabase Realtime; row-level security decides who receives them. The draft survives redraws. */

const FILTERS = [["all", "All"], ["unread", "Unread"], ["groups", "Groups"], ["dm", "Direct Messages"], ["channels", "Channels"]];
const KIND_IC = { announce: "megaphone", all: "users", exec: "briefcase", wing: "layers", team: "community", custom: "chat", collab: "handshake", dm: "user" };
const KIND_TONE = { announce: "pink", all: "green", exec: "purple", wing: "teal", team: "blue", custom: "orange", collab: "amber" };
const EMOJI = ["👍", "❤️", "😂", "🎉", "😮", "🙏", "🔥", "✅"];

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store, ctx } = kit;
  let filter = "all", q = "";

  /* ═════════ Conversation list ═════════ */
  pages["club/messages"] = () => {
    const g = kit.gate("your messages"); if (g) return g;
    const mine = kit.myClubs();
    const head = ui.ph("Messages", "Stay connected with your club members", mine.length ? `<button class="btn primary" id="ms-new" aria-label="New message">${icon("plus")} New</button>` : "");
    if (!mine.length && !kit.memberships().loading) return head + ui.emptyBox("chat", "Join a club to start chatting", "Club chats and direct messages open once you're a member.", `<a class="btn primary" href="#/club/explore">Find clubs</a>`);
    const ce = store.use("me:channels", api.channels, { ttl: 20e3 });
    return `${head}
      <div class="searchbar cl-search">${icon("search")}<input class="input" id="ms-q" type="search" placeholder="Search chats, members, or messages…" value="${esc(q)}" autocomplete="off"></div>
      <nav class="cl-seg mt-s">${FILTERS.map(([v, l]) => `<button data-f="${v}" aria-pressed="${filter === v}">${l}</button>`).join("")}</nav>
      ${ui.view(ce, (rows) => {
        const words = q.toLowerCase().split(/\s+/).filter(Boolean);
        const list = rows.filter((c) => (filter === "all" || (filter === "unread" && c.unread) || (filter === "dm" && c.kind === "dm") || (filter === "groups" && ["exec", "wing", "team", "custom", "collab"].includes(c.kind)) || (filter === "channels" && ["announce", "all"].includes(c.kind)))
          && (!words.length || words.every((w) => `${c.name} ${c.club_name} ${c.last_body || ""}`.toLowerCase().includes(w))));
        if (!list.length) return ui.emptyBox("chat", rows.length ? "Nothing matches" : "No conversations yet", rows.length ? "Try another filter." : "Your club channels appear here.");
        const pinned = list.filter((c) => c.kind === "announce"), rest = list.filter((c) => c.kind !== "announce");
        return `${pinned.length ? `<p class="cl-side-h" style="margin-left:2px">${icon("pin", "sm")} Pinned</p><div class="cl-list cl-chlist">${pinned.map(row).join("")}</div>` : ""}
          ${rest.length ? `<p class="cl-side-h" style="margin-left:2px">Chats</p><div class="cl-list cl-chlist">${rest.map(row).join("")}</div>` : ""}`;
      }, { n: 5, h: 64 })}`;
  };
  const row = (c) => `<a class="cl-li" href="#/club/chat?id=${c.id}">
      ${c.kind === "dm" ? ui.ava(c.other_name) : `<span class="itile ${KIND_TONE[c.kind] || "purple"}">${icon(KIND_IC[c.kind] || "chat")}</span>`}
      <span class="body"><b class="ellipsis">${esc(c.name)}${c.kind === "announce" ? ` ${icon("pin", "sm")}` : ""}</b>
        <span>${c.last_body ? `${c.last_author ? `<b style="display:inline;font-size:inherit">${esc(c.last_author.split(" ")[0])}:</b> ` : ""}${esc(c.last_body)}` : `<i>${esc(c.club_short || c.club_name)}</i>`}</span></span>
      <span class="end">${c.last_body ? ui.ago(c.last_message_at).replace(" ago", "") : ""}${c.unread ? `<span class="badge-n">${c.unread > 99 ? "99+" : c.unread}</span>` : ""}</span></a>`;
  pages["club/messages"].mount = (el) => {
    kit.bindRetry(el);
    const input = kit.$("#ms-q", el);
    input?.addEventListener("input", () => { q = input.value; const pos = input.selectionStart; ctx.rerender(); const i = kit.$("#ms-q"); if (i) { i.focus(); i.setSelectionRange(pos, pos); } });
    kit.$$("[data-f]", el).forEach((b) => b.addEventListener("click", () => { filter = b.dataset.f; ctx.rerender(); }));
    kit.$("#ms-new", el)?.addEventListener("click", newConversation);
  };

  /** Pick a club, then a member to message (or, with chat.manage, create a group). */
  function newConversation() {
    const mine = kit.myClubs().filter((m) => m.features?.chat !== false);
    if (!mine.length) return kit.toast("Chat is switched off in your clubs", "info");
    let club = mine[0].club_id;
    const draw = (m) => {
      const me = store.use(`club:members:${club}`, () => api.members(club), { ttl: 60e3 });
      const canGroup = kit.can(club, "chat.manage");
      m.querySelector("#nc-body").innerHTML = `${ui.field("Club", ui.select("club", mine.map((x) => [x.club_id, x.name]), club, 'id="nc-club"'))}
        ${canGroup ? `<button class="btn outline block" id="nc-group">${icon("community")} New group or team channel</button>` : ""}
        <p class="cl-side-h">Message a member</p>
        ${ui.view(me, (rows) => `<div class="cl-list" style="max-height:50vh;overflow:auto">${rows.filter((r) => r.user_id !== kit.me()?.id && r.status === "active").map((r) => `<button class="cl-li" data-dm="${r.user_id}">${ui.ava(r.display_name, r.photo_url)}<span class="body"><b>${esc(r.display_name || "Member")}</b><span>${esc(r.title || r.role_name)}</span></span>${icon("chat", "sm")}</button>`).join("") || `<p class="small muted" style="padding:12px">No other members yet.</p>`}</div>`, { n: 4, h: 50 })}`;
      m.querySelector("#nc-club").addEventListener("change", (e) => { club = e.target.value; draw(m); });
      m.querySelector("#nc-group")?.addEventListener("click", () => { ctx.closeModal(); newGroup(club); });
      kit.$$("[data-dm]", m).forEach((b) => b.addEventListener("click", async () => {
        try { const id = await api.openDm(club, b.dataset.dm); ctx.closeModal(); store.invalidate("me:channels"); kit.go(`#/club/chat?id=${id}`); } catch (e) { kit.toast(e.message, "error"); }
      }));
      if (me.loading) setTimeout(() => m.isConnected && draw(m), 600);
    };
    ui.sheet("New message", `<div id="nc-body" class="stack"></div>`, draw);
  }
  function newGroup(clubId) {
    const club = kit.membership(clubId);
    ui.sheet("New channel", `<form id="ng" class="stack">${ui.field("Name", ui.input("name", "", 'required maxlength="60" placeholder="Media & Design Team"'))}
      ${ui.field("Who's in it", ui.select("kind", [["team", "People I choose"], ["wing", "Everyone in a wing"]], "team"))}
      ${ui.field("Wing (for wing channels)", ui.input("wing", club?.wing || "", 'maxlength="40" placeholder="Media"'))}
      <div id="ng-people"></div><div id="cl-err"></div><button class="btn primary block">${icon("plus")} Create channel</button></form>`, (m) => {
      const me = store.use(`club:members:${clubId}`, () => api.members(clubId), { ttl: 60e3 });
      kit.$("#ng-people", m).innerHTML = `<p class="cl-side-h">Members</p><div class="cl-options" style="max-height:36vh;overflow:auto">${(me.value || []).filter((r) => r.user_id !== kit.me()?.id).map((r) => `<label class="cl-opt"><input type="checkbox" data-multi name="m" value="${r.user_id}"> ${esc(r.display_name)} <span class="xs push">${esc(r.title || r.role_name)}</span></label>`).join("")}</div>`;
      kit.$("#ng", m).addEventListener("submit", async (e) => {
        e.preventDefault(); const f = new FormData(e.target), btn = e.target.querySelector("button.primary");
        const name = String(f.get("name") || "").trim(); if (name.length < 2) return ui.fail(m, "Give the channel a name.");
        ctx.busy(btn, true, "Creating…");
        try { const id = await api.createChannel(clubId, name, f.get("kind"), String(f.get("wing") || ""), f.getAll("m")); ctx.closeModal(); store.invalidate("me:channels"); kit.go(`#/club/chat?id=${id}`); }
        catch (err) { ctx.busy(btn, false); ui.fail(m, err.message); }
      });
    });
  }

  /* ═════════ A conversation ═════════ */
  let live = { id: null, off: null }, draft = {}, limit = 60, replyTo = null, files = [], tab = "chat", lastSeen = {};
  const stopLive = () => { live.off?.(); live = { id: null, off: null }; };
  addEventListener("hashchange", () => { if (live.id && !location.hash.includes(`chat?id=${live.id}`)) stopLive(); });

  pages["club/chat"] = () => {
    const g = kit.gate("this chat"); if (g) return g;
    const id = kit.param("id"); if (!id) return ui.emptyBox("chat", "Choose a conversation", "", `<a class="btn primary" href="#/club/messages">Messages</a>`);
    const chE = store.use(`chat:ch:${id}`, () => api.channel(id), { ttl: 120e3 });
    return ui.view(chE, (ch) => {
      if (!ch) return ui.emptyBox("lock", "You can't open this chat", "It may be for another team, or it was removed.", `<a class="btn primary" href="#/club/messages">Messages</a>`);
      const list = store.peek("me:channels") || [], meta = list.find((c) => c.id === id) || {};
      const name = ch.kind === "dm" ? meta.other_name || "Direct message" : ch.name;
      const sub = ch.kind === "dm" ? `${esc(ch.clubs?.short_name || ch.clubs?.name)} · Direct message` : `${meta.members ? `${ui.plural(meta.members, "member")} · Private group` : esc(ch.clubs?.name || "")}`;
      const tabs = [["chat", "Chat"], ["files", "Files"], ["members", "Members"]];
      return `<div class="cl-chhead"><a class="icon-btn" href="#/club/messages" aria-label="Back to messages">${icon("chevL")}</a>
          ${ch.kind === "dm" ? ui.ava(name) : `<span class="itile ${KIND_TONE[ch.kind] || "purple"}">${icon(KIND_IC[ch.kind] || "chat")}</span>`}
          <div class="min0 grow"><h1 class="ellipsis">${esc(name)}</h1><span class="xs">${sub}</span></div>
          ${kit.can(ch.club_id, "chat.manage") && ch.kind !== "dm" ? `<button class="icon-btn" id="ch-pin-edit" aria-label="Pinned note">${icon("pin")}</button>` : ""}</div>
        <nav class="cl-seg sm">${tabs.map(([v, l]) => `<button data-tab="${v}" aria-pressed="${tab === v}">${l}</button>`).join("")}</nav>
        ${tab === "chat" ? thread(ch) : tab === "files" ? filesTab(ch) : membersTab(ch)}`;
    }, { n: 4, h: 70 });
  };

  function thread(ch) {
    const mE = store.use(`chat:msgs:${ch.id}:${limit}`, () => api.messages(ch.id, { limit }), { ttl: 120e3 });
    const msgs = mE.value || [];
    const rE = store.use(`chat:reacts:${ch.id}:${msgs.length}:${msgs.at(-1)?.id || 0}`, () => api.reactionsFor(ch.id, msgs.map((x) => x.id)), { ttl: 120e3 });
    const reacts = (rE.value || []).reduce((m, r) => { ((m[r.message_id] ||= {})[r.emoji] ||= []).push(r.user_id); return m; }, {});
    const pinnedMsg = [...msgs].reverse().find((x) => x.pinned && !x.deleted);
    const pinText = ch.pinned_text || pinnedMsg?.body || "";
    const canPost = ch.kind !== "announce" || kit.can(ch.club_id, "posts.write");
    const byId = Object.fromEntries(msgs.map((x) => [x.id, x]));
    let lastDay = "";
    const items = msgs.map((x) => {
      const day = ui.dateLong(x.created_at), dayRow = day !== lastDay ? `<span class="cl-day">${ui.dateShort(x.created_at) === ui.dateShort(new Date()) ? "Today" : esc(day)}</span>` : "";
      lastDay = day;
      return dayRow + message(ch, x, reacts[x.id] || {}, byId);
    }).join("");
    return `${pinText ? `<div class="cl-pin">${icon("pin")}<div class="min0"><b style="display:block;font-size:12.5px">Pinned</b>${esc(pinText).slice(0, 300)}</div></div>` : ""}
      ${msgs.length >= limit ? `<button class="btn sm outline" id="ch-more" style="justify-self:center;display:flex;margin:0 auto 8px">Load earlier messages</button>` : ""}
      <div class="cl-thread" id="ch-thread" aria-live="polite">${mE.loading && !mE.value ? ui.skeleton(4, 54) : items || `<p class="small muted" style="text-align:center">No messages yet. Say hello 👋</p>`}</div>
      ${canPost ? `<div class="cl-composer-wrap">${replyTo && byId[replyTo] ? `<div class="cl-reply" style="margin:0 8px 6px">Replying to ${esc(byId[replyTo].author_name)}: ${esc(byId[replyTo].body.slice(0, 80))} <button class="btn sm ghost" id="ch-noreply">Cancel</button></div>` : ""}
        ${files.length ? `<div class="cl-typing-files">${files.map((f, i) => `<span class="chip">${icon("paperclip", "sm")} ${esc(f.name)} <button class="btn sm ghost" data-unfile="${i}" aria-label="Remove ${esc(f.name)}">${icon("x", "sm")}</button></span>`).join("")}</div>` : ""}
        <form class="cl-composer" id="ch-form"><button type="button" class="round" id="ch-attach" aria-label="Attach a file">${icon("paperclip")}</button>
          <textarea id="ch-text" rows="1" maxlength="4000" placeholder="Type a message…" aria-label="Message">${esc(draft[ch.id] || "")}</textarea>
          <button class="round go" aria-label="Send">${icon("send")}</button></form></div>`
        : `<p class="xs" style="text-align:center">Only people who post for the club can write here.</p>`}`;
  }

  function message(ch, x, rs, byId) {
    const mine = x.author_id === kit.me()?.id, manage = kit.can(ch.club_id, "chat.manage");
    const atts = (x.attachments || []).map((a) => attachment(a)).join("");
    const reply = x.reply_to && byId[x.reply_to] ? `<div class="cl-reply">${esc(byId[x.reply_to].author_name)}: ${esc(byId[x.reply_to].body.slice(0, 80))}</div>` : "";
    return `<div class="cl-msg ${mine ? "mine" : ""} ${x.deleted ? "deleted" : ""}" data-mid="${x.id}">${ui.ava(x.author_name, "", "sm")}
      <div class="min0"><span class="who">${esc(x.author_name || "Member")}<time>${ui.time(x.created_at)}</time></span>
        <div class="cl-bubble">${reply}${x.deleted ? "Message removed" : `${ui.rich(x.body)}${atts}`}</div>
        ${Object.keys(rs).length ? `<div class="cl-reacts">${Object.entries(rs).map(([e, us]) => `<button data-react="${x.id}" data-e="${e}" class="${us.includes(kit.me()?.id) ? "on" : ""}" aria-label="${e} ${us.length}">${e} ${us.length}</button>`).join("")}</div>` : ""}
        ${x.deleted ? "" : `<div class="meta">${mine ? `<span>${x.edited_at ? "edited · " : ""}${ui.time(x.created_at)}</span>` : x.edited_at ? "<span>edited</span>" : ""}
          <button data-emoji="${x.id}" aria-label="React">${icon("smile", "sm")}</button><button data-reply="${x.id}">Reply</button>
          ${mine ? `<button data-edit="${x.id}">Edit</button>` : ""}${mine || manage ? `<button data-del="${x.id}">Delete</button>` : ""}
          ${manage || ch.kind === "dm" ? `<button data-pin="${x.id}">${x.pinned ? "Unpin" : "Pin"}</button>` : ""}
          ${!mine ? `<button data-report="${x.id}">Report</button>` : ""}</div>`}</div></div>`;
  }
  function attachment(a) {
    const url = store.use(`chat:url:${a.path}`, () => api.signedUrl(a.path), { ttl: 240e3 }).value;
    if (/^image\//.test(a.mime || "") && url) return `<a class="cl-att" href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="${esc(a.name)}" loading="lazy"></a>`;
    return `<a class="cl-att" ${url ? `href="${esc(url)}" target="_blank" rel="noopener"` : ""}>${ui.ftype(a.name, a.mime)}<span class="min0"><b class="ellipsis" style="display:block">${esc(a.name)}</b><span class="xs">${ui.size(a.size)}</span></span></a>`;
  }

  function filesTab(ch) {
    const mE = store.use(`chat:files:${ch.id}`, () => api.messages(ch.id, { limit: 300 }), { ttl: 60e3 });
    return ui.view(mE, (msgs) => {
      const all = msgs.filter((x) => !x.deleted).flatMap((x) => (x.attachments || []).map((a) => ({ ...a, by: x.author_name, at: x.created_at }))).reverse();
      return all.length ? `<div class="cl-list">${all.map((a) => `<div class="cl-li">${attachment(a)}<span class="end">${esc(a.by)}<br>${ui.dateShort(a.at)}</span></div>`).join("")}</div>` : ui.emptyBox("paperclip", "No files yet", "Files shared in this chat appear here.");
    });
  }
  function membersTab(ch) {
    const all = store.use(`club:members:${ch.club_id}`, () => api.members(ch.club_id), { ttl: 60e3 });
    const ids = ["dm", "custom", "team", "collab"].includes(ch.kind) ? store.use(`chat:mem:${ch.id}`, () => api.channelMembers(ch.id), { ttl: 60e3 }).value?.map((r) => r.user_id) : null;
    return ui.view(all, (rows) => {
      const list = rows.filter((r) => r.status === "active" && (!ids || ids.includes(r.user_id)) && (ch.kind !== "exec" || r.rank <= 4) && (ch.kind !== "wing" || r.rank <= 3 || r.wing === ch.wing));
      return `<div class="cl-list">${list.map((r) => `<div class="cl-li">${ui.ava(r.display_name, r.photo_url)}<span class="body"><b>${esc(r.display_name)}</b><span>${esc(r.title || r.role_name)}</span></span>
        ${r.user_id !== kit.me()?.id ? `<button class="btn sm outline" data-dmto="${r.user_id}">${icon("chat", "sm")} Message</button>` : ""}</div>`).join("")}</div>`;
    });
  }

  pages["club/chat"].mount = (el) => {
    kit.bindRetry(el);
    const id = kit.param("id"), ch = store.peek(`chat:ch:${id}`); if (!ch) return;
    kit.$$("[data-tab]", el).forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; ctx.rerender(); }));
    kit.$$("[data-dmto]", el).forEach((b) => b.addEventListener("click", async () => { try { const d = await api.openDm(ch.club_id, b.dataset.dmto); tab = "chat"; kit.go(`#/club/chat?id=${d}`); } catch (e) { kit.toast(e.message, "error"); } }));
    kit.$("#ch-pin-edit", el)?.addEventListener("click", () => ui.sheet("Pinned note", `<form id="pn" class="stack">${ui.field("Shown at the top of this channel", ui.area("t", ch.pinned_text, 'maxlength="300" rows="3"'))}<button class="btn primary block">Save</button></form>`, (m) =>
      kit.$("#pn", m).addEventListener("submit", async (e) => { e.preventDefault(); try { await api.updateChannel(id, { pinned_text: String(new FormData(e.target).get("t") || "").trim() }); ctx.closeModal(); store.invalidate(`chat:ch:${id}`); } catch (err) { kit.toast(err.message, "error"); } })));
    if (tab !== "chat") return;
    const reload = () => { store.invalidate(`chat:msgs:${id}`, `chat:reacts:${id}`, "me:channels"); };
    // Live updates for this channel only.
    if (live.id !== id) { stopLive(); live = { id, off: api.subscribe(id, reload) }; }
    // Keep the newest message in view (unless someone scrolled up to read).
    const thread = kit.$("#ch-thread", el), lastId = (store.peek(`chat:msgs:${id}:${limit}`) || []).at(-1)?.id;
    if (thread && lastSeen[id] !== lastId) { requestAnimationFrame(() => thread.lastElementChild?.scrollIntoView({ block: "end" })); lastSeen[id] = lastId; api.markRead(id).then(() => store.invalidate("me:channels", "me:unread")).catch(() => {}); }
    kit.$("#ch-more", el)?.addEventListener("click", () => { limit += 60; ctx.rerender(); });
    // Draft: kept per channel while new messages redraw the page.
    const ta = kit.$("#ch-text", el);
    if (ta) {
      const grow = () => { ta.style.height = "auto"; ta.style.height = `${Math.min(140, ta.scrollHeight)}px`; };
      grow();
      if (document.activeElement?.id !== "ch-text" && draft[id]) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
      ta.addEventListener("input", () => { draft[id] = ta.value; grow(); });
      ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && matchMedia("(pointer: fine)").matches) { e.preventDefault(); kit.$("#ch-form", el).requestSubmit(); } });
    }
    kit.$("#ch-noreply", el)?.addEventListener("click", () => { replyTo = null; ctx.rerender(); });
    kit.$$("[data-unfile]", el).forEach((b) => b.addEventListener("click", () => { files.splice(Number(b.dataset.unfile), 1); ctx.rerender(); }));
    kit.$("#ch-attach", el)?.addEventListener("click", async () => {
      const f = await ui.pickFile("image/*,application/pdf,.docx,.xlsx,.pptx,.zip,.txt,.csv"); if (!f) return;
      if (f.size > 10e6) return kit.toast("Files can be up to 10 MB", "error");
      if (files.length >= 6) return kit.toast("Up to 6 files per message", "error");
      files.push(/^image\//.test(f.type) ? await ui.shrink(f) : f); ctx.rerender();
    });
    kit.$("#ch-form", el)?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = (draft[id] || "").trim(), btn = e.target.querySelector(".go");
      if (!body && !files.length) return;
      btn.disabled = true;
      try {
        const attachments = [];
        for (const f of files) attachments.push({ path: await api.uploadChat(ch.club_id, id, f), name: f.name, mime: f.type, size: f.size });
        // @Name mentions → the people named (they get a notification).
        const people = store.peek(`club:members:${ch.club_id}`) || [];
        const mentions = people.filter((p) => p.display_name && body.includes(`@${p.display_name}`)).map((p) => p.user_id).slice(0, 20);
        await api.send(id, ch.club_id, body, { attachments, mentions, replyTo });
        draft[id] = ""; files = []; replyTo = null; reload();
      } catch (err) { kit.toast(err.message, "error"); btn.disabled = false; }
    });
    const msgs = store.peek(`chat:msgs:${id}:${limit}`) || [], find = (mid) => msgs.find((x) => String(x.id) === String(mid));
    kit.$$("[data-react]", el).forEach((b) => b.addEventListener("click", () => toggleReact(id, b.dataset.react, b.dataset.e, b.classList.contains("on"))));
    kit.$$("[data-emoji]", el).forEach((b) => b.addEventListener("click", () => ui.sheet("React", `<div class="row" style="gap:8px;justify-content:center;flex-wrap:wrap">${EMOJI.map((e) => `<button class="btn" style="font-size:22px;min-width:52px" data-pick="${e}">${e}</button>`).join("")}</div>`, (m) =>
      kit.$$("[data-pick]", m).forEach((p) => p.addEventListener("click", () => { ctx.closeModal(); toggleReact(id, b.dataset.emoji, p.dataset.pick, false); })))));
    kit.$$("[data-reply]", el).forEach((b) => b.addEventListener("click", () => { replyTo = Number(b.dataset.reply); ctx.rerender(); requestAnimationFrame(() => kit.$("#ch-text")?.focus()); }));
    kit.$$("[data-edit]", el).forEach((b) => b.addEventListener("click", () => { const x = find(b.dataset.edit); ui.sheet("Edit message", `<form id="ed" class="stack">${ui.area("b", x.body, 'maxlength="4000" rows="4"')}<button class="btn primary block">Save</button></form>`, (m) =>
      kit.$("#ed", m).addEventListener("submit", async (e) => { e.preventDefault(); try { await api.editMessage(x.id, { body: String(new FormData(e.target).get("b") || "").trim() }); ctx.closeModal(); reload(); } catch (err) { kit.toast(err.message, "error"); } })); }));
    kit.$$("[data-del]", el).forEach((b) => b.addEventListener("click", () => ui.confirm("Delete this message?", "Everyone in the chat will see “Message removed”.", "Delete", async () => { await api.editMessage(Number(b.dataset.del), { deleted: true }); reload(); }, true)));
    kit.$$("[data-pin]", el).forEach((b) => b.addEventListener("click", async () => { const x = find(b.dataset.pin); try { await api.editMessage(x.id, { pinned: !x.pinned }); reload(); } catch (err) { kit.toast(err.message, "error"); } }));
    kit.$$("[data-report]", el).forEach((b) => b.addEventListener("click", () => ui.confirm("Report this message?", "The EWUdiots team will look at it. The sender isn't told who reported.", "Report", async () => { await api.report(ch.club_id, "message", String(b.dataset.report), "Reported from chat"); kit.toast("Thanks, we'll take a look", "success"); })));
  };
  async function toggleReact(channelId, messageId, emoji, on) {
    try { if (on) await api.unreactMessage(Number(messageId), emoji); else await api.reactMessage(channelId, Number(messageId), emoji); store.invalidate(`chat:reacts:${channelId}`); }
    catch (e) { if (!/already/i.test(e.message)) kit.toast(e.message, "error"); }
  }
}
