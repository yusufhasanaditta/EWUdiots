/* Club event pages, from the "Event Registration / Check-In" and "Event Management" boards:
   #/club/event?id=…       everyone: details, speakers, schedule, FAQs, seats, register (the event's form), add to calendar
   #/club/eventadmin?id=…  organisers (events.manage): stats, quick actions, timeline, speakers & FAQs, announcements
   #/club/checkin?id=…     door team (events.checkin): QR scanner, manual check-in, attendee list, waitlist, live numbers
   Registrations are form_responses of the event's form; tickets are the QR from the registration (ewud:t:<code>). */
import { toICS } from "../ics.js";
import { canScan, startScanner } from "../scan.js";
import { STATUSES } from "../forms.js";
import { KINDS } from "../../events.js";
import { buyTicket } from "./tickets.js";
import { SCAN_RESULTS, normaliseScan, priceLabel, cleanTicketing, METHODS } from "../tickets.js";

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store, ctx, charts } = kit;
  const evE = (id) => store.use(`club:event:${id}`, () => api.event(id), { ttl: 45e3 });
  const formE = (fid) => store.use(`club:form:${fid}`, () => api.form(fid), { ttl: 60e3 });
  let tab = "about";
  // The event's photo, or a poster made from its title (the boards show posters like "TECH TALK 2026").
  const evCover = (e) => `<section class="cl-evcover">${e.image ? `<img src="${esc(e.image)}" alt="">`
    : `<span class="poster" aria-hidden="true"><b>${esc(e.title)}</b><span>${esc(e.clubs?.short_name || e.clubs?.name || "")} · ${esc(KINDS[e.kind] || "Event")}</span></span>`}
    ${ui.dchip(e.starts_at, "on-cover")}<span class="kind">${esc(KINDS[e.kind] || "Event")}</span></section>`;

  /* ═════════ Public event page ═════════ */
  pages["club/event"] = () => {
    if (!api) return kit.gate("events");
    const id = kit.param("id");
    return kit.back("#/club/events", "Events") + ui.view(evE(id), (e) => {
      if (!e) return ui.emptyBox("calendar", "Event not found", "It may be for members only, or it was removed.");
      const form = e.form_id ? formE(e.form_id).value : null;
      const taken = e.form_id ? store.use(`club:fcount:${e.form_id}`, () => api.formCount(e.form_id), { ttl: 30e3 }).value ?? null : null;
      const mine = e.form_id && kit.me() ? store.use(`club:myresp:${e.form_id}`, () => api.myResponse(e.form_id), { ttl: 30e3 }).value : null;
      // Tickets: sold or given out on the event itself (no form), or issued by the registration form.
      const tk = !!e.ticketing?.enabled && !e.form_id, tiers = tk ? e.ticketing.tiers || [] : [];
      const myT = kit.me() ? store.use(`club:myticket:${id}`, () => api.myEventTicket(id), { ttl: 30e3 }).value : null;
      const av = tk ? store.use(`club:tavail:${id}`, () => api.ticketAvailability(id), { ttl: 30e3 }).value : null;
      const tierCap = tiers.length && tiers.every((x) => x.qty) ? tiers.reduce((n, x) => n + Number(x.qty), 0) : null;
      const cheapest = tiers.length ? Math.min(...tiers.map((x) => Number(x.price) || 0)) : 0;
      const cap = e.capacity || form?.settings?.limit || tierCap || null, filled = tk ? av?.issued ?? null : taken, left = cap != null && filled != null ? Math.max(0, cap - filled) : null;
      const deadline = tk ? e.ticketing.sales_end : form?.settings?.deadline;
      const open = tk ? (!deadline || new Date(deadline) > Date.now()) && left !== 0 : form?.status === "open" && (!deadline || new Date(deadline) > Date.now());
      const past = new Date(e.ends_at || e.starts_at) < Date.now();
      const tabs = [["about", "About"], ...(e.speakers?.length ? [["speakers", "Speakers"]] : []), ...(e.agenda?.length ? [["schedule", "Schedule"]] : []), ...(e.faqs?.length ? [["faqs", "FAQs"]] : [])];
      const manage = e.club_id && (kit.can(e.club_id, "events.manage") || kit.can(e.club_id, "events.checkin"));
      return `${evCover(e)}
        <div class="cl-evhead"><div class="min0"><h1>${esc(e.title)}</h1><a href="#/club/c?slug=${encodeURIComponent(e.clubs?.slug || "")}">${icon("users", "sm")} Organized by ${esc(e.clubs?.name || e.organizer)}</a></div>
          ${past ? ui.st(["Event ended", "gray"]) : open ? ui.st([tk ? "Tickets available" : "Open for Registration", "green"], "checkc") : form || tk ? ui.st([left === 0 ? "Sold out" : "Registration closed", "red"]) : ui.st([KINDS[e.kind] || "Event", "purple"])}</div>
        <div class="cl-evfacts"><div>${icon("calendar")}<span><b>${ui.when(e.starts_at, { day: "numeric", month: "short", year: "numeric" })}</b><span>${ui.when(e.starts_at, { weekday: "long" })}</span></span></div>
          <div>${icon("clock")}<span><b>${e.all_day ? "All day" : `${ui.time(e.starts_at)}${e.ends_at ? ` – ${ui.time(e.ends_at)}` : ""}`}</b><span>${e.ends_at ? `(${Math.round((new Date(e.ends_at) - new Date(e.starts_at)) / 36e5 * 10) / 10} hours)` : ""}</span></span></div>
          <div>${icon("pin")}<span><b>${esc(e.venue || "To be announced")}</b><span>East West University</span></span></div></div>
        ${form || tk ? `<div class="cl-evkpis">${cap ? `<div><span class="itile sm purple">${icon("users")}</span><span><b>${filled ?? "–"} / ${cap}</b><span>Spots filled</span><span class="cl-bar"><i style="width:${Math.min(100, Math.round(((filled || 0) / cap) * 100))}%"></i></span></span></div>` : ""}
          <div><span class="itile sm blue">${icon("community")}</span><span><span>Open for</span><b>${e.visibility === "members" ? "Club members" : "All EWU students"}</b></span></div>
          <div><span class="itile sm green">${icon("ticket")}</span><span><b>${tk ? (cheapest > 0 ? `From ${priceLabel(cheapest)}` : tiers.some((x) => Number(x.price) > 0) ? "Free & paid" : "Free") : form?.settings?.fee ? priceLabel(form.settings.fee) : "Free"}</b><span>${tk ? "Tickets" : "Registration"}</span></span></div></div>` : ""}
        ${e.perks?.length ? `<div class="cl-evperks">${e.perks.map((p, i) => `<div>${icon(["users", "handshake", "award"][i % 3])}<span>${esc(p)}</span></div>`).join("")}</div>` : ""}
        ${tabs.length > 1 ? `<nav class="cl-seg fill mt">${tabs.map(([v, l]) => `<button data-tab="${v}" aria-pressed="${tab === v}">${l}</button>`).join("")}</nav>` : ""}
        ${tab === "speakers" ? `<div class="cl-pcards">${(e.speakers || []).map((s) => `<div class="cl-pcard"><span class="photo">${s.photo ? `<img src="${esc(s.photo)}" alt="">` : esc(ui.initials(s.name))}</span><b>${esc(s.name)}</b><span class="xs">${esc(s.role || "")}</span></div>`).join("")}</div>`
          : tab === "schedule" ? `<section class="card"><div class="cl-vtl">${(e.agenda || []).map((a) => `<div><span class="dot now"></span><span><b>${esc(a.title)}</b><span class="xs">${esc(a.at || "")}</span></span><span></span></div>`).join("")}</div></section>`
          : tab === "faqs" ? `<div class="stack">${(e.faqs || []).map((f) => `<details class="card"><summary><b>${esc(f.q)}</b></summary><p class="mt-s" style="color:var(--text-2)">${ui.rich(f.a)}</p></details>`).join("")}</div>`
          : `<section class="card"><h2>Event Description</h2><p style="color:var(--text-2);line-height:1.6">${ui.rich(e.description || "Details coming soon.")}</p></section>`}
        ${form || tk ? `<div class="cl-evstats mt"><div>${icon("users")}<span><span>Total Seats</span><b>${cap ?? "Open"}</b></span></div><div class="t-green">${icon("users")}<span><span>Registered</span><b>${filled ?? "–"}</b></span></div>
          ${left != null ? `<div class="t-amber">${icon("clock")}<span><span>Seats Left</span><b>${left}</b></span></div>` : ""}${deadline ? `<div>${icon("calendar")}<span><span>${tk ? "Sales close" : "Registration Deadline"}</span><b>${ui.dateTime(deadline)}</b></span></div>` : ""}</div>` : ""}
        <div class="stack mt">
          ${myT ? `<div class="alert green"><span class="a-ic">${icon("ticket")}</span><div class="grow"><b>You have a ticket</b><p>${esc(myT.tier_name)} · ${esc(myT.code)}</p></div><a class="btn sm primary" href="#/club/pass?id=${myT.id}">${icon("qr", "sm")} View ticket</a></div>`
            : tk && open && !past ? `<button class="btn primary block lg" id="ev-buy">${icon("ticket")} ${cheapest > 0 ? `Get Ticket · ${priceLabel(cheapest)}${tiers.length > 1 ? "+" : ""}` : tiers.some((x) => Number(x.price) > 0) ? "Get Ticket" : "Get Free Ticket"}</button>`
            : mine ? `<div class="alert green"><span class="a-ic">${icon("ticket")}</span><div class="grow"><b>You're registered</b><p>${esc(STATUSES[mine.status]?.[0] || mine.status)}${mine.ticket ? ` · Ticket ${esc(mine.ticket)}` : ""}</p></div><a class="btn sm outline" href="#/club/form?id=${e.form_id}">View ticket</a></div>`
            : open && !past ? `<a class="btn primary block lg" href="#/club/form?id=${e.form_id}">Register for This Event ${icon("arrow", "sm")}</a>` : ""}
          <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn outline" id="ev-ics">${icon("calendar")} Add to Calendar</button><button class="btn outline" id="ev-share">${icon("share")} Share</button>
            ${manage ? `<a class="btn outline" href="#/club/eventadmin?id=${e.id}">${icon("settings")} Manage event</a>` : ""}
            ${!manage && (store.peek("club:scanevents") || []).some((x) => x.id === e.id) ? `<a class="btn outline" href="#/club/checkin?id=${e.id}">${icon("qr")} Scan tickets</a>` : ""}</div></div>
        ${(form || tk) && !mine && !myT ? `${ui.sec("After Registration")}<div class="cl-evafter">${[["qr", "Get QR Ticket", "in the app"], ["mail", "Receive", "Email Confirmation"], ["bell", "Event Reminders", "& Updates"], ["checksq", "Check-in", "at the venue"]].map(([ic, b, l]) => `<div>${icon(ic)}<b>${b}</b><span>${l}</span></div>`).join("")}</div>` : ""}
        ${past && kit.me() && e.club_id ? `<section class="card mt"><h2>How was it?</h2><p class="small muted">Your feedback helps the club plan better events.</p><button class="btn outline mt-s" id="ev-fb">${icon("star")} Rate this event</button></section>` : ""}`;
    }, { n: 3, h: 140 });
  };
  pages["club/event"].mount = (el) => {
    kit.bindRetry(el);
    const e = store.peek(`club:event:${kit.param("id")}`); if (!e) return;
    kit.$$("[data-tab]", el).forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; ctx.rerender(); }));
    const url = `${location.origin}${location.pathname}#/club/event?id=${e.id}`;
    kit.$("#ev-ics", el)?.addEventListener("click", () => ui.download(`${e.title.replace(/[^\w]+/g, "-").slice(0, 40)}.ics`, toICS({ ...e, url }), "text/calendar"));
    kit.$("#ev-share", el)?.addEventListener("click", async () => { try { if (navigator.share) await navigator.share({ title: e.title, url }); else { await navigator.clipboard.writeText(url); kit.toast("Link copied", "success"); } } catch { /* cancelled */ } });
    kit.$("#ev-fb", el)?.addEventListener("click", () => feedback(e));
    kit.$("#ev-buy", el)?.addEventListener("click", () => buyTicket(kit, e));
    if (kit.me() && e.club_id && kit.membership(e.club_id)) store.use("club:scanevents", api.myScanEvents, { ttl: 60e3 });
  };
  function feedback(e) {
    const LIKES = ["Workshops", "Social events", "Competitions", "Networking", "Community"];
    ui.sheet("Rate this event", `<form id="fb" class="stack"><div class="cl-opts" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-r="${n}" aria-pressed="false">${"★".repeat(n)}</button>`).join("")}</div>
      ${ui.field("Anything to add?", ui.area("body", "", 'rows="3" maxlength="1000"'))}<p class="cl-side-h">What do you like most about the club?</p>
      <div class="cl-options">${LIKES.map((l) => `<label class="cl-opt"><input type="checkbox" data-multi name="likes" value="${l}"> ${l}</label>`).join("")}</div><div id="cl-err"></div><button class="btn primary block">Send feedback</button></form>`, (s) => {
      let rating = 0;
      kit.$$("[data-r]", s).forEach((b) => b.addEventListener("click", () => { rating = Number(b.dataset.r); kit.$$("[data-r]", s).forEach((x) => x.setAttribute("aria-pressed", String(x === b))); }));
      kit.$("#fb", s).addEventListener("submit", async (ev) => {
        ev.preventDefault(); if (!rating) return ui.fail(s, "Choose 1 to 5 stars."); const f = new FormData(ev.target);
        try { await api.giveFeedback({ club_id: e.club_id, event_id: e.id, rating, body: String(f.get("body") || ""), likes: f.getAll("likes").map((x) => String(x).toLowerCase().split(" ")[0]) }); ctx.closeModal(); kit.toast("Thank you!", "success"); }
        catch (err) { ui.fail(s, /duplicate|already/i.test(err.message) ? "You've already rated this event." : err.message); }
      });
    });
  }

  /* ═════════ Organiser's event dashboard ═════════ */
  let atab = "overview", tabFrom = "";
  pages["club/eventadmin"] = () => {
    const g = kit.gate("event management"); if (g) return g;
    const id = kit.param("id");
    if (kit.param("tab") && tabFrom !== location.hash) { atab = kit.param("tab"); tabFrom = location.hash; } // a link to one tab, once
    return ui.view(evE(id), (e) => {
      if (!e?.club_id || !(kit.can(e.club_id, "events.manage") || kit.can(e.club_id, "events.checkin"))) return ui.emptyBox("lock", "For the club's organisers", "");
      const se = store.use(`club:evstats:${id}`, () => api.eventStats(id), { ttl: 30e3 }), s = se.value || {};
      const can = kit.can(e.club_id, "events.manage");
      return `${kit.back(`#/club/event?id=${id}`, "Event page")}
        <section class="cl-cover-lg">${e.image ? `<img src="${esc(e.image)}" alt="">` : ""}${can ? `<div class="tools"><a class="btn sm white" href="#/club/manage?c=${e.club_id}&tab=events">${icon("edit", "sm")} Edit Event</a></div>` : ""}<h1>${esc(e.title)}</h1><p>${ui.st(["Published", "green"], "checkc")} Organized by ${esc(e.clubs?.name || "")}</p></section>
        <div class="cl-facts">${[["calendar", ui.dateLong(e.starts_at), ""], ["clock", `${ui.time(e.starts_at)}${e.ends_at ? ` – ${ui.time(e.ends_at)}` : ""}`, ""], ["pin", e.venue || "Venue TBA", ""]].map(([ic, b]) => `<div class="cl-fact">${icon(ic)}<div><b>${esc(b)}</b></div></div>`).join("")}</div>
        <nav class="cl-seg sm">${[["overview", "Overview"], ["tickets", "Tickets"], ["timeline", "Timeline"], ["speakers", "Speakers & FAQs"]].map(([v, l]) => `<button data-at="${v}" aria-pressed="${atab === v}">${l}</button>`).join("")}</nav>
        ${atab === "tickets" ? ticketsTab(e, can) : atab === "timeline" ? timeline(e, can) : atab === "speakers" ? speakers(e, can)
          : `<section class="card"><h2>Event Description</h2><p style="color:var(--text-2)">${ui.rich(e.description || "")}</p><div class="row mt-s" style="gap:8px;flex-wrap:wrap"><a class="btn sm outline" href="#/club/event?id=${id}">${icon("external", "sm")} View Event Page</a><button class="btn sm outline" id="ea-copy">${icon("link", "sm")} Copy Link</button></div></section>
            <div class="cl-stats mt">${ui.stat("users", "green", `${s.registered ?? "–"}${s.capacity ? ` / ${s.capacity}` : ""}`, "Registered")}${ui.stat("checkc", "green", s.checked_in ?? "–", "Checked in")}${ui.stat("community", "purple", s.volunteers ?? "–", "Volunteers")}${ui.stat("clock", "amber", s.waitlist ?? "–", "Waitlist")}</div>
            ${ui.sec("Quick Actions")}<div class="cl-quick">${[
              e.form_id && kit.can(e.club_id, "forms.view_responses") && [`#/club/recruit?form=${e.form_id}`, "users", "Manage Registrations"],
              [`#/club/checkin?id=${id}`, "qr", "Check-in (QR)"], ["#tickets", "ticket", "Tickets"], can && ["#ann", "megaphone", "Send Announcement"],
              e.volunteer_form_id && [`#/club/recruit?form=${e.volunteer_form_id}`, "community", "Manage Volunteers"], kit.can(e.club_id, "analytics.view") && [`#/club/analytics?c=${e.club_id}&tab=events`, "bars", "View Reports"],
              can && [`#/club/manage?c=${e.club_id}&tab=events`, "edit", "Edit Event"]].filter(Boolean).map(([h, ic, l]) => `<a class="cl-quick-btn" href="${h}" ${h === "#ann" ? 'id="ea-ann"' : h === "#tickets" ? 'data-at="tickets"' : ""}>${icon(ic)}<span>${l}</span></a>`).join("")}</div>
            ${!e.form_id && !e.ticketing?.enabled && can ? `<div class="alert amber mt"><span class="a-ic">${icon("info")}</span><div class="grow"><b>No tickets or registration yet</b><p>Set up free or paid tickets under Tickets, or link a registration form under Edit Event. Both give people a QR ticket.</p></div><button class="btn sm primary" data-at="tickets">Set up tickets</button></div>` : ""}
            ${timeline(e, can)}`}`;
    }, { n: 3, h: 120 });
  };
  const timeline = (e, can) => `${ui.sec("Timeline", can ? `<button class="btn sm outline" id="ea-agenda">${icon("plus", "sm")} Edit</button>` : "")}<section class="card"><div class="cl-vtl">${(e.agenda || []).map((a) => `<div><span class="dot now"></span><span><b>${esc(a.title)}</b><span class="xs">${esc(a.at || "")}</span></span>${ui.st(a.published === false ? ["Draft", "gray"] : ["Published", "green"])}</div>`).join("") || `<p class="small muted">No schedule yet.</p>`}</div></section>`;
  const speakers = (e, can) => `${ui.sec("Speakers", can ? `<button class="btn sm outline" id="ea-speakers">${icon("edit", "sm")} Edit</button>` : "")}<div class="cl-list">${(e.speakers || []).map((s) => `<div class="cl-li">${ui.ava(s.name, s.photo)}<span class="body"><b>${esc(s.name)}</b><span>${esc(s.role || "")}</span></span></div>`).join("") || `<p class="small muted" style="padding:12px">No speakers listed.</p>`}</div>
    ${ui.sec("FAQs", can ? `<button class="btn sm outline" id="ea-faqs">${icon("edit", "sm")} Edit</button>` : "")}<div class="stack">${(e.faqs || []).map((f) => `<details class="card"><summary><b>${esc(f.q)}</b></summary><p class="mt-s">${ui.rich(f.a)}</p></details>`).join("") || `<p class="small muted">No FAQs.</p>`}</div>
    ${ui.sec("Perks", can ? `<button class="btn sm outline" id="ea-perks">${icon("edit", "sm")} Edit</button>` : "")}<div class="chips">${(e.perks || []).map((p) => `<span class="chip">${esc(p)}</span>`).join("") || `<p class="small muted">Like “Certificate for participants”.</p>`}</div>`;
  pages["club/eventadmin"].mount = (el) => {
    kit.bindRetry(el);
    const id = kit.param("id"), e = store.peek(`club:event:${id}`); if (!e) return;
    const save = async (patch) => { try { await api.updateEvent(id, patch); store.invalidate(`club:event:${id}`); } catch (err) { kit.toast(err.message, "error"); } };
    kit.$$("[data-at]", el).forEach((b) => b.addEventListener("click", (ev) => { ev.preventDefault(); atab = b.dataset.at; ctx.rerender(); }));
    if (atab === "tickets") bindTickets(el, e);
    kit.$("#ea-copy", el)?.addEventListener("click", async () => { await navigator.clipboard?.writeText(`${location.origin}${location.pathname}#/club/event?id=${id}`); kit.toast("Link copied", "success"); });
    kit.$("#ea-ann", el)?.addEventListener("click", (ev) => { ev.preventDefault(); ui.sheet("Message everyone registered", `<form id="an" class="stack">${ui.field("Title", ui.input("t", "", 'required maxlength="100" placeholder="Venue changed to CSE Lab 403"'))}${ui.field("Message", ui.area("b", "", 'rows="4" maxlength="1000"'))}<button class="btn primary block">${icon("send")} Send</button></form>`, (s) =>
      kit.$("#an", s).addEventListener("submit", async (x) => { x.preventDefault(); const f = new FormData(x.target); try { const n = await api.notifyRegistrants(id, String(f.get("t")).trim(), String(f.get("b") || "")); ctx.closeModal(); kit.toast(`Sent to ${n} people`, "success"); } catch (err) { kit.toast(err.message, "error"); } })); });
    const lines = (title, help, value, parse) => ui.sheet(title, `<form id="ln" class="stack">${ui.field(help, ui.area("v", value, 'rows="8"'))}<button class="btn primary block">Save</button></form>`, (s) =>
      kit.$("#ln", s).addEventListener("submit", (x) => { x.preventDefault(); ctx.closeModal(); save(parse(String(new FormData(x.target).get("v") || "").split("\n").map((l) => l.trim()).filter(Boolean))); }));
    kit.$("#ea-agenda", el)?.addEventListener("click", () => lines("Event timeline", "One item per line: “3:00 PM – 3:15 PM | Registration & Check-in”", (e.agenda || []).map((a) => `${a.at} | ${a.title}`).join("\n"), (ls) => ({ agenda: ls.slice(0, 40).map((l) => { const [a, ...t] = l.split("|"); return t.length ? { at: a.trim(), title: t.join("|").trim() } : { at: "", title: l }; }) })));
    kit.$("#ea-speakers", el)?.addEventListener("click", () => lines("Speakers", "One per line: “Name | Role”", (e.speakers || []).map((s) => `${s.name} | ${s.role || ""}`).join("\n"), (ls) => ({ speakers: ls.slice(0, 20).map((l) => { const [n, r] = l.split("|"); return { name: n.trim().slice(0, 80), role: (r || "").trim().slice(0, 120) }; }) })));
    kit.$("#ea-faqs", el)?.addEventListener("click", () => lines("FAQs", "One per line: “Question? | Answer”", (e.faqs || []).map((f) => `${f.q} | ${f.a}`).join("\n"), (ls) => ({ faqs: ls.slice(0, 20).map((l) => { const [q, ...a] = l.split("|"); return { q: q.trim().slice(0, 200), a: a.join("|").trim().slice(0, 1000) }; }) })));
    kit.$("#ea-perks", el)?.addEventListener("click", () => lines("Perks", "One per line (up to 6): “Certificate for participants”", (e.perks || []).join("\n"), (ls) => ({ perks: ls.slice(0, 6).map((l) => l.slice(0, 60)) })));
  };

  /* ═════════ Tickets (organisers) ═════════ */
  // Ticket types and prices, payments to check, who may scan at the door.
  function ticketsTab(e, can) {
    const id = e.id, t = e.ticketing || {};
    const ts = store.use(`club:tstats:${id}`, () => api.ticketStats(id), { ttl: 20e3 }), s = ts.value || {};
    const tl = s.can_manage ? store.use(`club:tlist:${id}`, () => api.eventTickets(id), { ttl: 20e3 }) : { value: [] };
    const ck = store.use(`club:tcheckers:${id}`, () => api.ticketCheckers(id), { ttl: 30e3 });
    const toCheck = (tl.value || []).filter((x) => x.status === "active" && x.payment === "submitted");
    const tone = (x) => (x.status === "used" ? ["Checked in", "green"] : x.status === "cancelled" ? ["Cancelled", "red"] : x.status === "waitlisted" ? ["Waitlist", "purple"]
      : x.payment === "submitted" ? ["Payment to check", "amber"] : x.payment === "unpaid" ? ["Pays at door", "amber"] : x.payment === "rejected" ? ["Payment rejected", "red"] : ["Valid", "blue"]);
    return `<div class="cl-stats">${ui.stat("ticket", "purple", s.issued ?? "–", "Tickets issued")}${ui.stat("checkc", "green", s.checked_in ?? "–", "Checked in")}${ui.stat("wallet", "blue", ui.money(s.revenue || 0), "Paid (verified)")}${ui.stat("clock", "amber", s.to_verify ?? "–", "Payments to check")}</div>
      ${e.form_id ? `<div class="alert blue mt"><span class="a-ic">${icon("info")}</span><div class="grow"><b>Tickets come from the registration form</b><p>Everyone who registers gets a QR ticket. Unlink the form under Edit Event to sell ticket types here instead.</p></div></div>`
        : `${ui.sec("Ticket Types", can ? `<button class="btn sm outline" id="tk-edit">${icon("edit", "sm")} ${t.enabled ? "Edit" : "Set up tickets"}</button>` : "")}
          ${t.enabled ? `<div class="cl-list">${(s.tiers || t.tiers || []).map((x) => `<div class="cl-li"><span class="itile sm purple">${icon("ticket")}</span><span class="body"><b>${esc(x.name)}</b><span>${priceLabel(x.price)}${x.qty ? ` · ${x.qty} seats` : " · no limit"}</span></span><span class="end"><b>${x.sold ?? 0}</b><span class="xs">sold</span></span></div>`).join("")}</div>
            <p class="xs muted mt-s">${(t.methods || []).length ? `Payment: ${(t.methods || []).map((m) => METHODS[m]).join(", ")}. ` : ""}${t.sales_end ? `Sales close ${ui.dateTime(t.sales_end)}. ` : ""}${t.scanners === "members" ? "Every club member can scan." : "The door team and the checkers below scan."}</p>`
          : `<div class="card">${ctx.empty("icon:ticket", "No tickets yet", "Give out free tickets or sell paid ones (bKash, Nagad, Rocket or cash at the door). Each ticket has a QR code that works once.")}</div>`}`}
      ${toCheck.length ? `${ui.sec(`Payments to Check <span class="badge-n">${toCheck.length}</span>`)}<div class="cl-list">${toCheck.map((x) => `<div class="cl-li">${ui.ava(x.name)}<span class="body"><b>${esc(x.name)}</b><span>${esc(x.tier)} · ${priceLabel(x.price)} · ${esc(METHODS[x.pay_method] || x.pay_method)} <b>${esc(x.pay_ref)}</b></span></span>
          <span class="row nowrap" style="gap:6px"><button class="btn sm primary" data-pay-ok="${x.id}">${icon("check", "sm")} Paid</button><button class="btn sm outline" data-pay-no="${x.id}" aria-label="Payment not found">${icon("x", "sm")}</button></span></div>`).join("")}</div>` : ""}
      ${ui.sec("Ticket Checkers", can ? `<button class="btn sm outline" id="tk-add">${icon("plus", "sm")} Add member</button>` : "")}
      <p class="small muted">${t.scanners === "members" ? "Every active member of the club can scan tickets for this event." : "Club members you add here can open the scanner for this event, even general members. At the door they see the ticket holder's name, ID and department."}</p>
      ${ui.view(ck, (rows) => (rows.length ? `<div class="cl-list mt-s">${rows.map((r) => `<div class="cl-li">${ui.ava(r.name)}<span class="body"><b>${esc(r.name)}</b><span>${esc(r.role_name)} · ${ui.plural(Number(r.scans), "scan")}</span></span>${can ? `<button class="btn sm ghost" data-rm-checker="${r.user_id}" aria-label="Remove ${esc(r.name)}">${icon("x", "sm")}</button>` : ""}</div>`).join("")}</div>` : ""), { n: 1, h: 56 })}
      ${s.can_manage ? `${ui.sec("All Tickets", `<button class="btn sm outline" id="tk-export">${icon("download", "sm")} Export</button>`)}${ui.view(tl, (rows) => (rows.length ? `<div class="cl-list">${rows.slice(0, 60).map((x) => `<div class="cl-li">${ui.ava(x.name)}<span class="body"><b>${esc(x.name)}</b><span>${esc([x.student_id, x.tier, x.code].filter(Boolean).join(" · "))}</span></span>${ui.st(tone(x))}</div>`).join("")}</div>${rows.length > 60 ? `<p class="xs muted mt-s">Showing 60 of ${rows.length}. Export for the full list.</p>` : ""}` : `<p class="small muted">No tickets yet.</p>`), { n: 2, h: 56 })}` : ""}`;
  }
  function ticketSetup(e) {
    const t = e.ticketing || {}, tiers = (t.tiers || []).length ? t.tiers : [{ id: "general", name: "General", price: 0 }];
    const row = (x, i) => `<div class="cl-tierrow" data-tier="${i}"><input class="input" name="name" value="${esc(x.name || "")}" placeholder="Ticket name" maxlength="40" aria-label="Ticket name">
      <input class="input" name="price" type="number" min="0" max="100000" value="${esc(x.price ?? 0)}" aria-label="Price in taka"><input class="input" name="qty" type="number" min="1" max="20000" value="${esc(x.qty ?? "")}" placeholder="No limit" aria-label="Seats">
      <input type="hidden" name="id" value="${esc(x.id || "")}"><button type="button" class="btn sm ghost" data-rm-tier aria-label="Remove ticket type">${icon("x", "sm")}</button></div>`;
    ui.sheet("Event tickets", `<form id="tk" class="stack">${ui.toggle("enabled", t.enabled ?? true, "Use tickets for this event", "People get a QR ticket to show at the door.")}
      <p class="cl-side-h">Ticket types <span class="xs muted">name · price in ৳ (0 = free) · seats</span></p><div id="tk-tiers" class="stack" style="gap:8px">${tiers.map(row).join("")}</div>
      <button type="button" class="btn sm outline" id="tk-more">${icon("plus", "sm")} Add ticket type</button>
      <p class="cl-side-h">Payment for paid tickets</p><div class="cl-options">${Object.entries(METHODS).map(([k, l]) => `<label class="cl-opt"><input type="checkbox" data-multi name="methods" value="${k}" ${(t.methods || ["bkash", "nagad", "cash"]).includes(k) ? "checked" : ""}> ${l}</label>`).join("")}</div>
      <div class="cl-row3">${["bkash", "nagad", "rocket"].map((k) => ui.field(`${METHODS[k]} number`, ui.input(`num_${k}`, t.numbers?.[k] || "", 'inputmode="tel" maxlength="14" placeholder="Store number"'))).join("")}</div>
      <p class="xs muted">Leave the numbers empty to use the club's merch store numbers.</p>
      ${ui.field("Ticket sales close", ui.input("sales_end", t.sales_end ? new Date(new Date(t.sales_end).getTime() + 6 * 36e5).toISOString().slice(0, 16) : "", 'type="datetime-local"'), "Leave empty to sell until the event ends.")}
      <p class="cl-side-h">Who can scan tickets</p><div class="cl-options"><label class="cl-opt"><input type="radio" name="scanners" value="staff" ${t.scanners !== "members" ? "checked" : ""}> The door team and the members I name</label><label class="cl-opt"><input type="radio" name="scanners" value="members" ${t.scanners === "members" ? "checked" : ""}> Every active club member</label></div>
      ${ui.toggle("door_cash", t.door_cash !== false, "Checkers may take cash at the door", "For “Cash at the door” tickets. It's recorded in the club's finance.")}
      <div id="cl-err"></div><button class="btn primary block">Save tickets</button></form>`, (s) => {
      const box = kit.$("#tk-tiers", s);
      const bindRm = () => ctx.$$("[data-rm-tier]", s).forEach((b) => { b.onclick = () => { if (ctx.$$("[data-tier]", s).length > 1) b.closest("[data-tier]").remove(); }; });
      bindRm();
      kit.$("#tk-more", s).addEventListener("click", () => { if (ctx.$$("[data-tier]", s).length >= 6) return; box.insertAdjacentHTML("beforeend", row({ name: "", price: 0 }, Date.now())); bindRm(); });
      kit.$("#tk", s).addEventListener("submit", async (ev) => {
        ev.preventDefault(); const f = new FormData(ev.target), val = (r, n) => r.querySelector(`[name="${n}"]`).value;
        const draft = { enabled: ev.target.enabled.checked, scanners: String(f.get("scanners")), door_cash: ev.target.door_cash.checked, methods: f.getAll("methods").map(String),
          numbers: { bkash: String(f.get("num_bkash") || ""), nagad: String(f.get("num_nagad") || ""), rocket: String(f.get("num_rocket") || "") },
          sales_end: f.get("sales_end") ? new Date(`${f.get("sales_end")}:00+06:00`).toISOString() : "",
          tiers: ctx.$$("[data-tier]", s).map((r) => ({ id: val(r, "id") || val(r, "name"), name: val(r, "name"), price: val(r, "price"), qty: val(r, "qty") })) };
        const { value, error } = cleanTicketing(draft); if (error) return ui.fail(s, error);
        try { await api.updateEvent(e.id, { ticketing: value }); store.invalidate(`club:event:${e.id}`, `club:tstats:${e.id}`, `club:tavail:${e.id}`); ctx.closeModal(); kit.toast("Tickets saved", "success"); } catch (err) { ui.fail(s, err.message); }
      });
    });
  }
  function addChecker(e) {
    ui.sheet("Add a ticket checker", `<div class="searchbar cl-search">${icon("search")}<input class="input" id="tc-q" type="search" placeholder="Search members" autocomplete="off"></div><div id="tc-list" class="cl-list mt-s"><p class="small muted" style="padding:12px">Loading…</p></div>`, async (s) => {
      const rows = (await store.fetch(`club:memberlist:${e.club_id}`, () => api.members(e.club_id)).catch(() => [])) || [];
      const have = new Set((store.peek(`club:tcheckers:${e.id}`) || []).map((x) => x.user_id));
      const draw = (q = "") => {
        const w = q.toLowerCase();
        kit.$("#tc-list", s).innerHTML = rows.filter((m) => (m.status || "active") === "active" && !have.has(m.user_id) && (!w || `${m.display_name} ${m.student_id} ${m.role_name}`.toLowerCase().includes(w))).slice(0, 40)
          .map((m) => `<button class="cl-li" data-u="${m.user_id}">${ui.ava(m.display_name)}<span class="body"><b>${esc(m.display_name)}</b><span>${esc(m.role_name || "")}</span></span>${icon("plus", "sm")}</button>`).join("") || `<p class="small muted" style="padding:12px">No members found.</p>`;
        ctx.$$("[data-u]", s).forEach((b) => b.addEventListener("click", async () => { try { await api.setTicketChecker(e.id, b.dataset.u, true); store.invalidate(`club:tcheckers:${e.id}`); ctx.closeModal(); kit.toast("Added. They got a notification.", "success"); } catch (err) { kit.toast(err.message, "error"); } }));
      };
      kit.$("#tc-q", s).addEventListener("input", (x) => draw(x.target.value)); draw();
    });
  }
  function bindTickets(el, e) {
    kit.$("#tk-edit", el)?.addEventListener("click", () => ticketSetup(e));
    kit.$("#tk-add", el)?.addEventListener("click", () => addChecker(e));
    const after = () => store.invalidate(`club:tlist:${e.id}`, `club:tstats:${e.id}`);
    kit.$$("[data-pay-ok]", el).forEach((b) => b.addEventListener("click", async () => { b.disabled = true; try { await api.reviewTicketPayment(b.dataset.payOk, true); kit.toast("Payment confirmed. The ticket is ready.", "success"); after(); } catch (err) { b.disabled = false; kit.toast(err.message, "error"); } }));
    kit.$$("[data-pay-no]", el).forEach((b) => b.addEventListener("click", () => ui.sheet("Payment not found", `<form id="pn" class="stack">${ui.field("Tell the buyer why", ui.input("n", "", 'maxlength="200" placeholder="No payment with this TrxID in our bKash"'))}<button class="btn danger block">Reject payment</button></form>`, (s) =>
      kit.$("#pn", s).addEventListener("submit", async (x) => { x.preventDefault(); try { await api.reviewTicketPayment(b.dataset.payNo, false, String(new FormData(x.target).get("n") || "")); ctx.closeModal(); after(); } catch (err) { kit.toast(err.message, "error"); } }))));
    kit.$$("[data-rm-checker]", el).forEach((b) => b.addEventListener("click", async () => { try { await api.setTicketChecker(e.id, b.dataset.rmChecker, false); store.invalidate(`club:tcheckers:${e.id}`); } catch (err) { kit.toast(err.message, "error"); } }));
    kit.$("#tk-export", el)?.addEventListener("click", async () => {
      const rows = store.peek(`club:tlist:${e.id}`) || [];
      try { await api.logExport(e.club_id, `Tickets: ${e.title}`, rows.length); } catch (err) { return kit.toast(err.message, "error"); }
      const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const head = ["Name", "Student ID", "Email", "Department", "Ticket", "Price", "Code", "Status", "Payment", "Method", "TrxID", "Checked in"];
      ui.download(`tickets-${e.title.replace(/[^\w]+/g, "-").slice(0, 30)}.csv`, "﻿" + `${[head, ...rows.map((x) => [x.name, x.student_id, x.email, x.department, x.tier, x.price, x.code, x.status, x.payment, x.pay_method, x.pay_ref, x.checked_in_at || ""])].map((r) => r.map(q).join(",")).join("\r\n")}`, "text/csv;charset=utf-8");
    });
  }

  /* ═════════ Door check-in ═════════ */
  // Anyone the database lets scan: the door team, named ticket checkers, or every member when the organiser allows it.
  let ctab = "scan", cq = "", scanner = null, torch = false, verifyOnly = false, lastScan = null;
  addEventListener("hashchange", () => { if (scanner && !location.hash.startsWith("#/club/checkin")) { scanner.stop(); scanner = null; } });
  const resultCard = (j) => {
    if (!j) return `<div class="cl-scanres idle">${icon("qr")}<div><b>Ready to scan</b><p class="xs">Point the camera at a ticket, or type its code.</p></div></div>`;
    const [title, tone, ic, advice] = SCAN_RESULTS[j.result] || SCAN_RESULTS.invalid, t = j.ticket;
    return `<div class="cl-scanres ${tone}" role="status"><span class="big">${icon(ic)}</span><div class="grow"><b>${title}</b>
      ${t ? `<p><b>${esc(t.name)}</b>${t.student_id ? ` · ${esc(t.student_id)}` : ""}${t.department ? ` · ${esc(t.department)}` : ""}</p><p class="xs">${esc(t.tier)} · ${priceLabel(t.price)} · ${esc(t.code)}</p>` : ""}
      <p class="xs">${j.result === "used" && t?.checked_in_at ? `Checked in ${ui.time(t.checked_in_at)} by ${esc(t.checked_in_by || "a checker")}.` : j.result === "wrong_event" && j.other_event ? `It's for “${esc(j.other_event)}”.` : j.result === "unpaid" && t?.payment === "submitted" ? "Their payment is waiting for the organisers to check it." : esc(advice)}</p>
      ${j.result === "unpaid" && t?.door_cash ? `<button class="btn sm primary mt-s" id="ci-cash" data-code="${esc(t.code)}">${icon("wallet", "sm")} Took ${priceLabel(t.price)} cash · Admit</button>` : ""}
      ${j.result === "valid" ? `<button class="btn sm primary mt-s" id="ci-admit" data-code="${esc(t.code)}">${icon("check", "sm")} Admit now</button>` : ""}</div></div>`;
  };
  pages["club/checkin"] = () => {
    const g = kit.gate("check-in"); if (g) return g;
    const id = kit.param("id");
    return ui.view(evE(id), (e) => {
      if (!e?.club_id) return ui.emptyBox("calendar", "Event not found", "");
      const ts = store.use(`club:tstats:${id}`, () => api.ticketStats(id), { ttl: 15e3 });
      if (ts.error && ts.value === undefined) return /not allowed/i.test(ts.error) ? ui.emptyBox("lock", "You aren't a ticket checker for this event", "Ask the organisers to add you under Manage event → Tickets.") : ui.errorBox(ts.error);
      if (ts.value === undefined) return ui.skeleton(3, 120);
      const s = ts.value;
      if (!e.form_id && !e.ticketing?.enabled) return ui.emptyBox("ticket", "This event has no tickets", "Organisers can set up tickets or link a registration form under Manage event → Tickets.");
      const rc = store.use(`club:recentin:${id}`, () => api.recentCheckins(id), { ttl: 15e3 });
      const tl = s.can_manage ? store.use(`club:tlist:${id}`, () => api.eventTickets(id), { ttl: 15e3 }) : { value: [] };
      const tab = s.can_manage || ctab === "stats" ? ctab : "scan";
      const back = kit.can(e.club_id, "events.manage") || kit.can(e.club_id, "events.checkin") ? `#/club/eventadmin?id=${id}` : "#/club/scan";
      return `${kit.back(back, "Event")}
        ${ui.ph("Check-in & Attendance", "Scan QR codes and manage event attendance in real time")}
        <section class="cl-ccard" style="grid-template-columns:96px 1fr"><span class="art">${ui.art(e.image, e.title)}</span><span><b>${esc(e.title)}</b><span class="xs">${ui.dateShort(e.starts_at)} · ${esc(e.venue || "")}</span></span></section>
        <div class="cl-stats c5 mt">${ui.stat("users", "purple", s.capacity || "–", "Total seats")}${ui.stat("checkc", "green", s.issued ?? "–", "Registered")}${ui.stat("check", "blue", s.checked_in ?? "–", "Checked in")}${ui.stat("clock", "amber", Math.max(0, (s.issued || 0) - (s.checked_in || 0)), "Pending")}${ui.stat("list", "purple", s.waitlist ?? "–", "Waitlist")}</div>
        <nav class="cl-seg fill sm">${[["scan", "QR Scanner"], ...(s.can_manage ? [["list", "Attendee List"], ["wait", "Waitlist"]] : []), ["stats", "Analytics"]].map(([v, l]) => `<button data-ct="${v}" aria-pressed="${tab === v}">${l}</button>`).join("")}</nav>
        ${tab === "scan" ? `<div class="cl-row2 cl-scanrow"><section class="cl-scanner">${canScan() ? `<video id="ci-video" playsinline muted></video><span class="frame" aria-hidden="true"></span><p>Point the camera at a participant’s QR code</p>` : `<div class="noscan">${icon("qr")}<p>This browser can't scan QR codes. Type the ticket code instead.</p></div>`}</section>
            <section class="card cl-manual"><h2>Manual Check-in</h2><form id="ci-man" class="searchbar cl-search mt-s">${icon("search")}<input class="input" name="q" placeholder="Ticket code" autocomplete="off" aria-label="Ticket code" style="text-transform:uppercase"></form>
              ${canScan() ? `<div class="cl-mtools"><button class="cl-mtool" id="ci-torch">${icon("bulb")}<span>Flashlight</span></button><button class="cl-mtool" id="ci-flip">${icon("sync")}<span>Switch Camera</span></button></div>` : ""}
              </section></div>
            <label class="cl-toggle card mt-s"><span class="grow"><b>Check only</b><span class="xs">Verify a ticket without letting the person in</span></span><span class="switch"><input type="checkbox" id="ci-verify" ${verifyOnly ? "checked" : ""}><span></span></span></label>
            <div id="ci-last" class="mt" aria-live="assertive">${resultCard(lastScan)}</div>
            ${ui.sec("Recent Check-ins")}${ui.view(rc, (rows) => `<div class="cl-list">${rows.slice(0, 8).map((r) => `<div class="cl-li">${ui.ava(r.name)}<span class="body"><b>${esc(r.name)}</b><span>${esc([r.department, r.tier].filter(Boolean).join(" · "))}</span></span><span class="end">${ui.time(r.checked_in_at)}${ui.st(["Checked In", "green"])}</span></div>`).join("") || `<p class="small muted" style="padding:12px">No one yet.</p>`}</div>`, { n: 2, h: 56 })}`
          : tab === "stats" ? `<div class="cl-row2"><section class="card cl-chart"><h3>Check-ins per hour</h3>${charts.bars({ title: "Check-ins per hour", labels: (s.per_hour || []).map((x) => ui.time(x.h)), series: [{ name: "Check-ins", values: (s.per_hour || []).map((x) => x.n) }] })}</section>
              <section class="card cl-chart"><h3>Registrations by department</h3>${charts.donut({ title: "Registrations by department", items: Object.entries(s.by_department || {}).map(([label, value]) => ({ label, value })), sub: "people" })}</section></div>`
          : ui.view(tl, (rows) => list(rows.filter((r) => (tab === "wait" ? r.status === "waitlisted" : r.status !== "waitlisted" && r.status !== "cancelled"))), { n: 3, h: 56 })}
        ${s.can_manage ? `<div class="cl-actions3">${kit.can(e.club_id, "events.manage") ? `<a class="btn outline" href="#/club/eventadmin?id=${id}&tab=tickets">${icon("download")} Export Attendees</a><a class="btn outline" href="#/club/eventadmin?id=${id}">${icon("send")} Send Notification</a>` : ""}<button class="btn primary" data-ct="stats">${icon("bars")} Live Analytics</button></div>` : ""}`;
    }, { n: 3, h: 120 });
  };
  function list(rows) {
    const words = cq.toLowerCase().split(/\s+/).filter(Boolean);
    const l = rows.filter((r) => !words.length || words.every((w) => `${r.name} ${r.email} ${r.student_id} ${r.code}`.toLowerCase().includes(w)));
    return `<div class="searchbar cl-search">${icon("search")}<input class="input" id="ci-q" type="search" placeholder="Search by name or email" value="${esc(cq)}" autocomplete="off"></div>
      <div class="cl-list mt-s">${l.slice(0, 100).map((r) => `<div class="cl-li">${ui.ava(r.name)}<span class="body"><b>${esc(r.name)}</b><span>${esc([r.department, r.student_id, r.tier].filter(Boolean).join(" · "))}</span></span>
        ${r.checked_in_at ? `<span class="end">${ui.time(r.checked_in_at)}${ui.st(["Checked In", "green"])}</span>` : r.status === "waitlisted" ? ui.st(["Waitlist", "purple"]) : `<button class="btn sm primary" data-in="${esc(r.code)}">Check in</button>`}</div>`).join("") || `<p class="small muted" style="padding:12px">No one here.</p>`}</div>`;
  }
  pages["club/checkin"].mount = (el) => {
    kit.bindRetry(el);
    const id = kit.param("id"), e = store.peek(`club:event:${id}`); if (!e) return;
    const show = (j) => { lastScan = j; const box = kit.$("#ci-last"); if (box) box.innerHTML = resultCard(j); bindResult(); navigator.vibrate?.(j.result === "admitted" || j.result === "valid" ? 80 : [60, 80, 60]); };
    const check = async (q, { admit = !verifyOnly, collect = false } = {}) => {
      try { const j = await api.scanTicket(id, normaliseScan(q), admit, collect); show(j); if (j.result === "admitted") store.invalidate(`club:tstats:${id}`, `club:recentin:${id}`, `club:tlist:${id}`); }
      catch (err) { kit.toast(err.message, "error"); }
    };
    function bindResult() {
      kit.$("#ci-cash")?.addEventListener("click", (b) => check(b.currentTarget.dataset.code, { admit: true, collect: true }));
      kit.$("#ci-admit")?.addEventListener("click", (b) => check(b.currentTarget.dataset.code, { admit: true }));
    }
    bindResult();
    kit.$$("[data-ct]", el).forEach((b) => b.addEventListener("click", () => { ctab = b.dataset.ct; if (ctab !== "scan") { scanner?.stop(); scanner = null; } ctx.rerender(); }));
    kit.$("#ci-man", el)?.addEventListener("submit", (ev) => { ev.preventDefault(); const v = String(new FormData(ev.target).get("q") || "").trim(); if (v) { check(v); ev.target.reset(); } });
    kit.$("#ci-verify", el)?.addEventListener("change", (x) => { verifyOnly = x.target.checked; });
    kit.$$("[data-in]", el).forEach((b) => b.addEventListener("click", () => check(b.dataset.in, { admit: true })));
    const input = kit.$("#ci-q", el);
    input?.addEventListener("input", () => { cq = input.value; const pos = input.selectionStart; ctx.rerender(); const i = kit.$("#ci-q"); if (i) { i.focus(); i.setSelectionRange(pos, pos); } });
    const video = kit.$("#ci-video", el);
    if (video && canScan()) {
      // One scanner for the page; re-attach to the new <video> after a redraw.
      scanner?.stop();
      startScanner(video, (text) => check(text)).then((s) => { scanner = s; }).catch((err) => kit.toast(err.message, "error"));
      kit.$("#ci-flip", el)?.addEventListener("click", () => scanner?.flip());
      kit.$("#ci-torch", el)?.addEventListener("click", async () => { torch = !torch; if (!(await scanner?.torch(torch))) kit.toast("This camera has no flashlight", "info"); });
    }
  };
}
