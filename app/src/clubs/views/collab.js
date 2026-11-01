/* Club marketplace & collaboration (#/club/collab, #/club/collab?id=…, #/club/collab?tab=requests), from the "Club
   Collaboration Marketplace" board. A club with collab.manage proposes a joint initiative, invites clubs or answers
   requests (public.collab_invite / collab_request / collab_respond); accepted clubs' executives share a planning chat
   (public.collab_open_chat). Students can mark themselves interested. */
import { CATEGORIES } from "../perms.js";

const KIND = { co_organized: "Co-organized", event_partner: "Event partners", volunteers: "Volunteers", resource_share: "Resource sharing", other: "Other" };
const STATUS = { open: ["Open", "green"], planning: ["Planning", "blue"], confirmed: ["Confirmed", "purple"], completed: ["Completed", "gray"], cancelled: ["Cancelled", "red"] };
const RES = { confirmed: ["Confirmed", "green"], in_progress: ["In progress", "amber"], needed: ["Needed", "red"] };

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store, ctx } = kit;
  let cat = "all", q = "";
  const allE = () => store.use("collab:all", api.collabs, { ttl: 60e3 });
  const accepted = (x) => (x.club_collab_clubs || []).filter((r) => ["lead", "accepted"].includes(r.status));

  pages["club/collab"] = () => {
    if (!api) return kit.gate("collaborations");
    const id = kit.param("id"); if (id) return detail(id);
    const t = kit.param("tab") || "explore", mine = kit.clubsWith("collab.manage").filter((m) => kit.feature(m.club_id, "collab"));
    const ae = allE(), ce = store.use("clubs:all", api.listClubs, { ttl: 5 * 60e3 }), counts = store.use("clubs:counts", api.counts, { ttl: 60e3 }).value || {};
    return `${ui.ph("Club Marketplace & Collaboration", "Discover clubs, collaborate, organize joint events and grow together.", mine.length ? `<button class="btn primary" id="cb-new">${icon("plus")} Propose a collaboration</button>` : "")}
      ${mine.length ? `<nav class="rp-tabs" role="tablist">${[["explore", "Explore Clubs"], ["requests", "Collaboration Requests"], ["history", "Partnership History"]].map(([v, l]) => `<a role="tab" href="#/club/collab?tab=${v}" aria-selected="${t === v}">${l}</a>`).join("")}</nav>` : ""}
      ${t === "requests" && mine.length ? requests(mine) : t === "history" && mine.length ? history(mine) : `
      <div class="searchbar cl-search">${icon("search")}<input class="input" id="cb-q" type="search" placeholder="Search clubs, events, collaborations…" value="${esc(q)}" autocomplete="off"></div>
      <div class="rv-chips">${[["all", "All Clubs"], ...Object.entries(CATEGORIES)].map(([v, l]) => `<button data-cat="${v}" aria-pressed="${cat === v}">${l}</button>`).join("")}</div>
      ${ui.sec("Featured Clubs", `<a href="#/club/explore">View all</a>`)}
      ${ui.view(ce, (clubs) => `<div class="cb-clubs">${clubs.filter((c) => c.status === "active" && (cat === "all" || c.category === cat) && (!q || c.name.toLowerCase().includes(q.toLowerCase()))).slice(0, 10).map((c, i) => `<a class="cb-club" href="#/club/c?slug=${encodeURIComponent(c.slug)}">${ui.logo(c, "lg")}<span class="cb-tag t${i % 5}">${esc(CATEGORIES[c.category] || "Club")}</span><b>${esc(c.name)}</b><span class="xs">${ui.plural(counts[c.id]?.members || 0, "Member")}</span><span class="btn sm">View Club</span></a>`).join("")}</div>`, { n: 1, h: 180 })}
      ${ui.view(ae, (rows) => {
        const live = rows.filter((x) => x.status !== "cancelled" && (cat === "all" || x.clubs?.category === cat) && (!q || `${x.title} ${x.description}`.toLowerCase().includes(q.toLowerCase())));
        const events = live.filter((x) => x.starts_at && new Date(x.starts_at) > Date.now() - 864e5), opps = live.filter((x) => x.seeking && ["open", "planning"].includes(x.status));
        return `${ui.sec("Upcoming Collaborative Events")}${events.length ? `<div class="cb-evs">${events.map((x) => `<a class="cb-ev" href="#/club/collab?id=${x.id}"><span class="ph">${x.cover_url ? `<img src="${esc(x.cover_url)}" alt="" loading="lazy">` : ""}<span class="cx-dbox"><b>${ui.when(x.starts_at, { day: "2-digit" })}</b>${ui.when(x.starts_at, { month: "short" })}</span></span>
            <span class="in"><span class="tags"><span class="cb-tag t2">${esc(KIND[x.kind])}</span>${x.tags.slice(0, 1).map((t) => `<span class="cb-tag t1">${esc(t)}</span>`).join("")}</span><b>${esc(x.title)}</b><span>${accepted(x).map((r) => esc(r.clubs?.short_name || r.clubs?.name)).join(" × ")}</span>
              <span>${icon("users", "sm")} ${x.capacity ? `${x.capacity} capacity` : "Open to all"}</span><span>${icon("pin", "sm")} ${esc(x.venue || "East West University")}</span><span class="btn sm">View Details</span></span></a>`).join("")}</div>` : `<p class="small muted">No joint events yet.</p>`}
          ${ui.sec("Collaboration Opportunities")}${opps.length ? `<div class="stack" style="gap:10px">${opps.map((x) => `<a class="cb-opp ${x.seeking === "volunteers" ? "v" : ""}" href="#/club/collab?id=${x.id}">${icon(x.seeking === "volunteers" ? "users" : "megaphone", "big")}<span class="min0"><b>${x.seeking === "volunteers" ? "Seeking Volunteers" : x.seeking === "sponsors" ? "Looking for Sponsors" : "Looking for Event Partners"}</b><p>${esc(x.clubs?.name || "")}: ${esc(x.title)}</p></span><span class="pill">${x.seeking === "volunteers" ? "Volunteer" : "Open"}</span>${icon("chevR", "sm")}</a>`).join("")}</div>` : `<p class="small muted">No open calls right now.</p>`}
          <a class="cb-banner" href="${mine.length ? "#/club/collab?tab=requests" : "#/club/explore"}">${icon("handshake", "big")}<span class="grow"><b>Let's Build a Stronger EWU Together</b><span>Collaborate. Share Resources. Create Impact.</span></span>${icon("chevR")}</a>`;
      }, { n: 2, h: 160 })}`}`;
  };
  function requests(mine) {
    const ids = new Set(mine.map((m) => m.club_id));
    return ui.view(allE(), (rows) => {
      const incoming = rows.flatMap((x) => (x.club_collab_clubs || []).filter((r) => (r.status === "invited" && ids.has(r.club_id)) || (r.status === "requested" && ids.has(x.lead_club))).map((r) => ({ x, r })));
      const sent = rows.flatMap((x) => (x.club_collab_clubs || []).filter((r) => (r.status === "requested" && ids.has(r.club_id)) || (r.status === "invited" && ids.has(x.lead_club))).map((r) => ({ x, r })));
      const line = ({ x, r }, actions) => `<div class="cl-li">${ui.logo(r.status === "invited" && ids.has(r.club_id) ? x.clubs : r.clubs, "sm")}<span class="body"><b>${esc(x.title)}</b><span>${r.status === "invited" ? `${esc(x.clubs?.name)} invited ${esc(r.clubs?.name)}` : `${esc(r.clubs?.name)} asked to join`}</span></span>${actions}</div>`;
      return `${ui.sec("Waiting for your answer")}${incoming.length ? `<div class="cl-list">${incoming.map((v) => line(v, `<button class="btn sm primary" data-ans="1" data-x="${v.x.id}" data-c="${v.r.club_id}">Accept</button><button class="btn sm ghost" data-ans="0" data-x="${v.x.id}" data-c="${v.r.club_id}">Decline</button>`)).join("")}</div>` : `<p class="small muted">Nothing to answer.</p>`}
        ${ui.sec("My Requests")}${sent.length ? `<div class="cl-list">${sent.map((v) => line(v, ui.st(["Pending", "amber"]))).join("")}</div>` : `<p class="small muted">No pending requests.</p>`}`;
    });
  }
  function history(mine) {
    const ids = new Set(mine.map((m) => m.club_id));
    return ui.view(allE(), (rows) => { const list = rows.filter((x) => accepted(x).some((r) => ids.has(r.club_id)));
      return list.length ? `<div class="stack">${list.map((x) => `<a class="cl-ccard" href="#/club/collab?id=${x.id}"><span class="art">${ui.art(x.cover_url, x.title)}</span><span class="min0"><b>${esc(x.title)}</b>${ui.st(STATUS[x.status])}<span class="meta"><span>${accepted(x).map((r) => esc(r.clubs?.short_name || r.clubs?.name)).join(" × ")}</span><span>${x.starts_at ? ui.dateLong(x.starts_at) : "Date to be set"}</span></span></span></a>`).join("")}</div>` : ui.emptyBox("handshake", "No partnerships yet", "Propose one or answer a request."); });
  }

  /* ═════════ One collaboration ═════════ */
  function detail(id) {
    const xe = store.use(`collab:${id}`, () => api.collab(id), { ttl: 30e3 });
    return kit.back("#/club/collab", "Collaboration hub") + ui.view(xe, (x) => {
      if (!x) return ui.emptyBox("handshake", "Not found", "");
      const n = store.use(`collab:n:${id}`, () => api.collabInterested(id), { ttl: 60e3 }).value || 0;
      const mineI = kit.me() ? (store.use(`collab:mine:${id}`, () => api.myCollabInterest([id]), { ttl: 60e3 }).value || []).includes(id) : false;
      const lead = kit.can(x.lead_club, "collab.manage"), clubs = accepted(x), mine = kit.clubsWith("collab.manage").filter((m) => kit.feature(m.club_id, "collab"));
      const canAsk = mine.filter((m) => !(x.club_collab_clubs || []).some((r) => r.club_id === m.club_id && ["lead", "accepted", "requested"].includes(r.status)));
      const inside = clubs.some((r) => kit.membership(r.club_id)?.rank <= 4);
      return `${ui.ph("Club Collaboration Hub", "Join forces with other clubs for bigger and better initiatives.")}
        <section class="cb-top"><div class="cb-cover">${x.cover_url ? `<img src="${esc(x.cover_url)}" alt="">` : `<h2>${esc(x.title)}</h2>`}${x.starts_at ? `<span class="cx-dbox"><b>${ui.when(x.starts_at, { day: "2-digit" })}</b>${ui.when(x.starts_at, { month: "short" })}</span>` : ""}</div>
          <div class="cb-info"><div class="row" style="gap:6px"><span class="cb-tag t3">${esc(KIND[x.kind])}</span>${x.tags.map((t, i) => `<span class="cb-tag t${i % 2 ? 2 : 0}">${esc(t)}</span>`).join("")}${ui.st(STATUS[x.status])}</div>
            <h2>${esc(x.title)}</h2><p>${icon("users", "sm")} ${clubs.map((r) => esc(r.clubs?.name)).join(" × ") || esc(x.clubs?.name || "")}</p>
            ${x.starts_at ? `<p>${icon("calendar", "sm")} ${ui.dateLong(x.starts_at)} | ${ui.time(x.starts_at)}${x.ends_at ? ` – ${ui.time(x.ends_at)}` : ""}</p>` : ""}${x.venue ? `<p>${icon("pin", "sm")} ${esc(x.venue)}</p>` : ""}
            <p>${icon("community", "sm")} ${n} Interested${x.capacity ? ` | ${x.capacity} Capacity` : ""}</p>
            ${canAsk.length && x.lead_club && !lead ? `<button class="btn primary" id="cx-req">${icon("send")} Send Collaboration Request</button>` : ""}${kit.me() ? `<button class="btn outline" id="cx-int" aria-pressed="${mineI}">${icon(mineI ? "checkc" : "star")} ${mineI ? "You're interested" : "I'm interested"}</button>` : ""}</div></section>
        <section class="mt"><div class="cp-sh"><h2 style="color:var(--uv)">About This Collaboration</h2></div><p style="color:var(--text-2);margin:0">${ui.rich(x.description || "")}</p>
          <div class="cb-facts">${[["calendar", "Event Type", x.event_type || KIND[x.kind]], ["users", "Target Audience", x.audience], ["handshake", "Collaboration Type", KIND[x.kind]]].map(([ic, l, v]) => `<div class="cb-fact">${icon(ic)}<div><span>${l}</span><b>${esc(v)}</b></div></div>`).join("")}</div></section>
        <div class="cp-sh mt"><h2 style="color:var(--uv)">Involved Clubs</h2></div><div class="cb-inv">${clubs.map((r) => `<a href="#/club/c?slug=${encodeURIComponent(r.clubs?.slug || "")}">${ui.logo(r.clubs, "lg")}<span class="min0"><b>${esc(r.clubs?.name)}</b><span class="cb-tag t2">${esc(CATEGORIES[r.clubs?.category] || "Club")}</span></span><span class="more">View Club ${icon("chevR", "sm")}</span></a>`).join("")}</div>
        ${x.goals.length ? `<div class="cp-sh mt"><h2 style="color:var(--uv)">Goals &amp; Expected Outcomes</h2></div><div class="cb-goals">${x.goals.map((g, i) => `<div class="cb-goal">${icon(["sparkle", "bulb", "handshake", "users"][i % 4])}<span>${esc(g)}</span></div>`).join("")}</div>` : ""}
        <div class="cb-two">${x.timeline.length ? `<section class="card rp-card"><h3>Event Timeline</h3><div class="cb-tl">${x.timeline.map((st) => `<div><span class="dot ${st.done ? "done" : ""}">${st.done ? icon("check") : ""}</span><b style="font-weight:500">${esc(st.title)}</b><span class="xs">${esc([st.from, st.to].filter(Boolean).join(" – "))}</span></div>`).join("")}</div></section>` : ""}
          ${x.resources.length ? `<section class="card rp-card"><h3>Required Resources</h3><div class="cb-res">${x.resources.map((r) => { const v = RES[r.status] || RES.needed; return `<div><span class="itile sm ${v[1] === "green" ? "green" : v[1] === "red" ? "red" : "orange"}">${icon(v[1] === "green" ? "checkc" : v[1] === "red" ? "alert" : "clock")}</span><span>${esc(r.name)} <i>(${v[0]})</i></span></div>`; }).join("")}</div></section>` : ""}</div>
        <div class="cb-actions">${inside ? `<button class="btn" id="cx-chat">${icon("chat")} Discuss with Clubs</button>` : ""}<button class="btn" id="cx-share">${icon("share")} Share Event</button>
          ${lead ? `<button class="btn" id="cx-edit">${icon("edit")} Edit</button><button class="btn" id="cx-inv">${icon("plus")} Invite a club</button>` : ""}</div>`;
    }, { n: 3, h: 140 });
  }

  function edit(x) {
    const mine = kit.clubsWith("collab.manage").filter((m) => kit.feature(m.club_id, "collab"));
    const local = (d) => (d ? new Date(new Date(d).getTime() - new Date(d).getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : "");
    ui.sheet(x.id ? "Edit collaboration" : "Propose a collaboration", `<form id="cx" class="stack">${!x.id ? ui.field("Lead club", ui.select("lead", mine.map((m) => [m.club_id, m.name]))) : ""}
      ${ui.field("Title", ui.input("title", x.title || "", 'required maxlength="120" placeholder="Tech for a Greener Campus"'))}${ui.field("About", ui.area("description", x.description || "", 'rows="3" maxlength="4000"'))}
      <div class="row" style="gap:8px">${ui.field("Type", ui.select("kind", KIND, x.kind || "co_organized"))}${ui.field("Looking for", ui.select("seeking", [["", "Nothing right now"], ["partners", "Partner clubs"], ["volunteers", "Volunteers"], ["sponsors", "Sponsors"]], x.seeking || "partners"))}</div>
      <div class="row" style="gap:8px">${ui.field("Starts", `<input class="input" type="datetime-local" name="starts" value="${local(x.starts_at)}">`)}${ui.field("Ends", `<input class="input" type="datetime-local" name="ends" value="${local(x.ends_at)}">`)}</div>
      <div class="row" style="gap:8px">${ui.field("Venue", ui.input("venue", x.venue || "", 'maxlength="120"'))}${ui.field("Capacity", `<input class="input" type="number" name="capacity" min="1" value="${x.capacity ?? ""}">`)}</div>
      ${ui.field("Goals (one per line)", ui.area("goals", (x.goals || []).join("\n"), 'rows="3"'))}${ui.field("Tags (comma separated)", ui.input("tags", (x.tags || []).join(", "), 'placeholder="Technology, Social Service"'))}
      ${ui.field("Timeline (Step | from | to | done)", ui.area("timeline", (x.timeline || []).map((s) => [s.title, s.from, s.to, s.done ? "done" : ""].join(" | ")).join("\n"), 'rows="4" placeholder="Collaboration Proposal | Oct 10 | | done"'))}
      ${ui.field("Resources (Name | confirmed / in_progress / needed)", ui.area("resources", (x.resources || []).map((r) => `${r.name} | ${r.status}`).join("\n"), 'rows="3" placeholder="Event Space | confirmed\nVolunteers | needed"'))}
      ${x.id ? ui.field("Status", ui.select("status", Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v[0]])), x.status)) : ""}
      <button type="button" class="btn outline" id="cx-cover">${icon("image")} Cover image</button><div id="cl-err"></div><button class="btn primary block">Save</button></form>`, (s) => {
      let cover = x.cover_url || "";
      kit.$("#cx-cover", s).addEventListener("click", async () => { const f = await ui.pickFile("image/*"); if (!f) return; try { cover = await api.uploadPublic(x.lead_club || s.querySelector('[name="lead"]').value, await ui.shrink(f, 1400), "collabs"); kit.toast("Cover added", "success"); } catch (e) { ui.fail(s, e.message); } });
      kit.$("#cx", s).addEventListener("submit", async (e) => {
        e.preventDefault(); const f = ui.values(e.target), btn = e.target.querySelector("button.primary"), lines = (v) => String(v || "").split("\n").map((l) => l.trim()).filter(Boolean);
        ctx.busy(btn, true, "Saving…");
        try {
          const row = await api.saveCollab({ ...(x.id ? { id: x.id, status: f.status } : { lead_club: f.lead }), title: f.title.trim(), description: f.description || "", kind: f.kind, seeking: f.seeking, venue: f.venue || "", capacity: f.capacity ? Number(f.capacity) : null,
            starts_at: f.starts ? new Date(f.starts).toISOString() : null, ends_at: f.ends ? new Date(f.ends).toISOString() : null, cover_url: cover, goals: lines(f.goals).slice(0, 8), tags: String(f.tags || "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 6),
            timeline: lines(f.timeline).slice(0, 12).map((l) => { const [title, from, to, done] = l.split("|").map((p) => (p || "").trim()); return { title, from, to, done: /done|yes|✓/i.test(done) }; }),
            resources: lines(f.resources).slice(0, 12).map((l) => { const [name, status] = l.split("|").map((p) => (p || "").trim()); return { name, status: RES[status] ? status : "needed" }; }) });
          ctx.closeModal(); store.invalidate("collab:"); kit.go(`#/club/collab?id=${row.id}`);
        } catch (err) { ctx.busy(btn, false); ui.fail(s, err.message); }
      });
    });
  }

  pages["club/collab"].mount = (el) => {
    kit.bindRetry(el);
    const id = kit.param("id"), x = id ? store.peek(`collab:${id}`) : null;
    const input = kit.$("#cb-q", el);
    input?.addEventListener("input", () => { q = input.value; const pos = input.selectionStart; ctx.rerender(); const i = kit.$("#cb-q"); if (i) { i.focus(); i.setSelectionRange(pos, pos); } });
    kit.$$("[data-cat]", el).forEach((b) => b.addEventListener("click", () => { cat = b.dataset.cat; ctx.rerender(); }));
    kit.$("#cb-new", el)?.addEventListener("click", () => edit({}));
    kit.$$("[data-ans]", el).forEach((b) => b.addEventListener("click", async () => { try { await api.collabRespond(b.dataset.x, b.dataset.c, b.dataset.ans === "1"); store.invalidate("collab:", "me:channels"); kit.toast(b.dataset.ans === "1" ? "Accepted — a shared chat is open for both committees" : "Declined", "success"); } catch (e) { kit.toast(e.message, "error"); } }));
    if (!x) return;
    kit.$("#cx-int", el)?.addEventListener("click", async (e) => { const on = e.currentTarget.getAttribute("aria-pressed") !== "true"; try { await api.setCollabInterest(id, on); store.invalidate(`collab:n:${id}`, `collab:mine:${id}`); } catch (err) { kit.toast(err.message, "error"); } });
    kit.$("#cx-req", el)?.addEventListener("click", () => { const mine = kit.clubsWith("collab.manage").filter((m) => kit.feature(m.club_id, "collab"));
      ui.sheet("Ask to collaborate", `<form id="rq" class="stack">${ui.field("Your club", ui.select("club", mine.map((m) => [m.club_id, m.name])))}${ui.field("Message", ui.area("msg", "", 'rows="3" maxlength="600" placeholder="How your club can help…"'))}<button class="btn primary block">${icon("send")} Send request</button></form>`, (s) =>
        kit.$("#rq", s).addEventListener("submit", async (e) => { e.preventDefault(); const f = ui.values(e.target); try { await api.collabRequest(id, f.club, f.msg || ""); ctx.closeModal(); store.invalidate("collab:"); kit.toast("Request sent", "success"); } catch (err) { kit.toast(err.message, "error"); } })); });
    kit.$("#cx-inv", el)?.addEventListener("click", () => { const clubs = (store.peek("clubs:all") || []).filter((c) => c.status === "active" && c.id !== x.lead_club);
      ui.sheet("Invite a club", `<form id="iv" class="stack">${ui.field("Club", ui.select("club", clubs.map((c) => [c.id, c.name])))}${ui.field("Message", ui.area("msg", "", 'rows="3" maxlength="600"'))}<button class="btn primary block">Send invite</button></form>`, (s) =>
        kit.$("#iv", s).addEventListener("submit", async (e) => { e.preventDefault(); const f = ui.values(e.target); try { await api.collabInvite(id, f.club, f.msg || ""); ctx.closeModal(); store.invalidate("collab:"); kit.toast("Invite sent", "success"); } catch (err) { kit.toast(err.message, "error"); } })); });
    kit.$("#cx-edit", el)?.addEventListener("click", () => edit(x));
    kit.$("#cx-chat", el)?.addEventListener("click", async () => { try { const ch = await api.collabChat(id); store.invalidate("me:channels"); kit.go(`#/club/chat?id=${ch}`); } catch (e) { kit.toast(e.message, "error"); } });
    kit.$("#cx-share", el)?.addEventListener("click", async () => { const url = `${location.origin}${location.pathname}#/club/collab?id=${id}`; try { if (navigator.share) await navigator.share({ title: x.title, url }); else { await navigator.clipboard.writeText(url); kit.toast("Link copied", "success"); } } catch { /* cancelled */ } });
  };
}
