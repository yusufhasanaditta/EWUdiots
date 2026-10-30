/* Club event pages, from the "Event Registration / Check-In" and "Event Management" boards:
   #/club/event?id=…       everyone: details, speakers, schedule, FAQs, seats, register (the event's form), add to calendar
   #/club/eventadmin?id=…  organisers (events.manage): stats, quick actions, timeline, speakers & FAQs, announcements
   #/club/checkin?id=…     door team (events.checkin): QR scanner, manual check-in, attendee list, waitlist, live numbers
   Registrations are form_responses of the event's form; tickets are the QR from the registration (ewud:t:<code>). */
import { toICS } from "../ics.js";
import { canScan, startScanner } from "../scan.js";
import { toCSV, STATUSES } from "../forms.js";
import { KINDS } from "../../events.js";

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store, ctx, charts } = kit;
  const evE = (id) => store.use(`club:event:${id}`, () => api.event(id), { ttl: 45e3 });
  const formE = (fid) => store.use(`club:form:${fid}`, () => api.form(fid), { ttl: 60e3 });
  let tab = "about";

  /* ═════════ Public event page ═════════ */
  pages["club/event"] = () => {
    if (!api) return kit.gate("events");
    const id = kit.param("id");
    return kit.back("#/club/events", "Events") + ui.view(evE(id), (e) => {
      if (!e) return ui.emptyBox("calendar", "Event not found", "It may be for members only, or it was removed.");
      const form = e.form_id ? formE(e.form_id).value : null;
      const taken = e.form_id ? store.use(`club:fcount:${e.form_id}`, () => api.formCount(e.form_id), { ttl: 30e3 }).value ?? null : null;
      const mine = e.form_id && kit.me() ? store.use(`club:myresp:${e.form_id}`, () => api.myResponse(e.form_id), { ttl: 30e3 }).value : null;
      const cap = e.capacity || form?.settings?.limit || null, left = cap != null && taken != null ? Math.max(0, cap - taken) : null;
      const deadline = form?.settings?.deadline, open = form?.status === "open" && (!deadline || new Date(deadline) > Date.now());
      const past = new Date(e.ends_at || e.starts_at) < Date.now();
      const tabs = [["about", "About"], ...(e.speakers?.length ? [["speakers", "Speakers"]] : []), ...(e.agenda?.length ? [["schedule", "Schedule"]] : []), ...(e.faqs?.length ? [["faqs", "FAQs"]] : [])];
      const manage = e.club_id && (kit.can(e.club_id, "events.manage") || kit.can(e.club_id, "events.checkin"));
      return `<section class="cl-cover-lg">${e.image ? `<img src="${esc(e.image)}" alt="">` : ""}<div class="tools">${ui.dchip(e.starts_at)}</div><h1>${esc(e.title)}</h1></section>
        <div class="row between mt" style="gap:8px;flex-wrap:wrap"><a class="row nowrap" style="gap:8px;text-decoration:none;color:inherit" href="#/club/c?slug=${encodeURIComponent(e.clubs?.slug || "")}">${ui.logo(e.clubs, "xs")}<span class="xs">Organized by <b>${esc(e.clubs?.name || e.organizer)}</b></span></a>
          ${past ? ui.st(["Event ended", "gray"]) : open ? ui.st(["Open for Registration", "green"], "checkc") : form ? ui.st(["Registration closed", "red"]) : ui.st([KINDS[e.kind] || "Event", "purple"])}</div>
        <div class="cl-facts"><div class="cl-fact">${icon("calendar")}<div><b>${ui.dateLong(e.starts_at)}</b><span>${ui.when(e.starts_at, { weekday: "long" })}</span></div></div>
          <div class="cl-fact">${icon("clock")}<div><b>${e.all_day ? "All day" : `${ui.time(e.starts_at)}${e.ends_at ? ` – ${ui.time(e.ends_at)}` : ""}`}</b><span>${e.ends_at ? `${Math.round((new Date(e.ends_at) - new Date(e.starts_at)) / 36e5 * 10) / 10} hours` : ""}</span></div></div>
          <div class="cl-fact">${icon("pin")}<div><b>${esc(e.venue || "To be announced")}</b><span>East West University</span></div></div></div>
        ${e.perks?.length ? `<div class="cl-row3">${e.perks.map((p, i) => `<div class="cl-fact">${icon(["users", "handshake", "award"][i % 3])}<div><b>${esc(p)}</b></div></div>`).join("")}</div>` : ""}
        ${tabs.length > 1 ? `<nav class="cl-seg mt">${tabs.map(([v, l]) => `<button data-tab="${v}" aria-pressed="${tab === v}">${l}</button>`).join("")}</nav>` : ""}
        ${tab === "speakers" ? `<div class="cl-pcards">${(e.speakers || []).map((s) => `<div class="cl-pcard"><span class="photo">${s.photo ? `<img src="${esc(s.photo)}" alt="">` : esc(ui.initials(s.name))}</span><b>${esc(s.name)}</b><span class="xs">${esc(s.role || "")}</span></div>`).join("")}</div>`
          : tab === "schedule" ? `<section class="card"><div class="cl-vtl">${(e.agenda || []).map((a) => `<div><span class="dot now"></span><span><b>${esc(a.title)}</b><span class="xs">${esc(a.at || "")}</span></span><span></span></div>`).join("")}</div></section>`
          : tab === "faqs" ? `<div class="stack">${(e.faqs || []).map((f) => `<details class="card"><summary><b>${esc(f.q)}</b></summary><p class="mt-s" style="color:var(--text-2)">${ui.rich(f.a)}</p></details>`).join("")}</div>`
          : `<section class="card"><h2>Event Description</h2><p style="color:var(--text-2);line-height:1.6">${ui.rich(e.description || "Details coming soon.")}</p></section>`}
        ${form ? `<div class="cl-stats mt">${ui.stat("users", "purple", cap ?? "Open", "Total seats")}${ui.stat("checkc", "green", taken ?? "–", "Registered")}${left != null ? ui.stat("clock", "amber", left, "Seats left") : ""}${deadline ? ui.stat("calendar", "blue", ui.dateShort(deadline), "Registration deadline") : ""}</div>` : ""}
        <div class="stack mt">
          ${mine ? `<div class="alert green"><span class="a-ic">${icon("ticket")}</span><div class="grow"><b>You're registered</b><p>${esc(STATUSES[mine.status]?.[0] || mine.status)}${mine.ticket ? ` · Ticket ${esc(mine.ticket)}` : ""}</p></div><a class="btn sm outline" href="#/club/form?id=${e.form_id}">View ticket</a></div>`
            : open && !past ? `<a class="btn primary block lg" href="#/club/form?id=${e.form_id}">Register for This Event ${icon("arrow", "sm")}</a>` : ""}
          <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn outline" id="ev-ics">${icon("calendar")} Add to Calendar</button><button class="btn outline" id="ev-share">${icon("share")} Share</button>
            ${manage ? `<a class="btn outline" href="#/club/eventadmin?id=${e.id}">${icon("settings")} Manage event</a>` : ""}</div></div>
        ${form && !mine ? `${ui.sec("After Registration")}<div class="cl-tiles">${[["qr", "purple", "Get QR Ticket in the app"], ["bell", "blue", "Event reminders & updates"], ["mail", "green", "Confirmation in your inbox"], ["checkc", "orange", "Check-in at the venue"]].map(([ic, t, l]) => `<div class="cl-tile t-${t}">${icon(ic)}<span>${l}</span></div>`).join("")}</div>` : ""}
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
  let atab = "overview";
  pages["club/eventadmin"] = () => {
    const g = kit.gate("event management"); if (g) return g;
    const id = kit.param("id");
    return ui.view(evE(id), (e) => {
      if (!e?.club_id || !(kit.can(e.club_id, "events.manage") || kit.can(e.club_id, "events.checkin"))) return ui.emptyBox("lock", "For the club's organisers", "");
      const se = store.use(`club:evstats:${id}`, () => api.eventStats(id), { ttl: 30e3 }), s = se.value || {};
      const can = kit.can(e.club_id, "events.manage");
      return `${kit.back(`#/club/event?id=${id}`, "Event page")}
        <section class="cl-cover-lg">${e.image ? `<img src="${esc(e.image)}" alt="">` : ""}${can ? `<div class="tools"><a class="btn sm white" href="#/club/manage?c=${e.club_id}&tab=events">${icon("edit", "sm")} Edit Event</a></div>` : ""}<h1>${esc(e.title)}</h1><p>${ui.st(["Published", "green"], "checkc")} Organized by ${esc(e.clubs?.name || "")}</p></section>
        <div class="cl-facts">${[["calendar", ui.dateLong(e.starts_at), ""], ["clock", `${ui.time(e.starts_at)}${e.ends_at ? ` – ${ui.time(e.ends_at)}` : ""}`, ""], ["pin", e.venue || "Venue TBA", ""]].map(([ic, b]) => `<div class="cl-fact">${icon(ic)}<div><b>${esc(b)}</b></div></div>`).join("")}</div>
        <nav class="cl-seg sm">${[["overview", "Overview"], ["timeline", "Timeline"], ["speakers", "Speakers & FAQs"]].map(([v, l]) => `<button data-at="${v}" aria-pressed="${atab === v}">${l}</button>`).join("")}</nav>
        ${atab === "timeline" ? timeline(e, can) : atab === "speakers" ? speakers(e, can)
          : `<section class="card"><h2>Event Description</h2><p style="color:var(--text-2)">${ui.rich(e.description || "")}</p><div class="row mt-s" style="gap:8px;flex-wrap:wrap"><a class="btn sm outline" href="#/club/event?id=${id}">${icon("external", "sm")} View Event Page</a><button class="btn sm outline" id="ea-copy">${icon("link", "sm")} Copy Link</button></div></section>
            <div class="cl-stats mt">${ui.stat("users", "green", `${s.registered ?? "–"}${s.capacity ? ` / ${s.capacity}` : ""}`, "Registered")}${ui.stat("checkc", "green", s.checked_in ?? "–", "Checked in")}${ui.stat("community", "purple", s.volunteers ?? "–", "Volunteers")}${ui.stat("clock", "amber", s.waitlist ?? "–", "Waitlist")}</div>
            ${ui.sec("Quick Actions")}<div class="cl-quick">${[
              e.form_id && kit.can(e.club_id, "forms.view_responses") && [`#/club/recruit?form=${e.form_id}`, "users", "Manage Registrations"],
              [`#/club/checkin?id=${id}`, "qr", "Check-in (QR)"], can && ["#ann", "megaphone", "Send Announcement"],
              e.volunteer_form_id && [`#/club/recruit?form=${e.volunteer_form_id}`, "community", "Manage Volunteers"], kit.can(e.club_id, "analytics.view") && [`#/club/analytics?c=${e.club_id}&tab=events`, "bars", "View Reports"],
              can && [`#/club/manage?c=${e.club_id}&tab=events`, "edit", "Edit Event"]].filter(Boolean).map(([h, ic, l]) => `<a class="cl-quick-btn" href="${h}" ${h === "#ann" ? 'id="ea-ann"' : ""}>${icon(ic)}<span>${l}</span></a>`).join("")}</div>
            ${!e.form_id && can ? `<div class="alert amber mt"><span class="a-ic">${icon("info")}</span><div class="grow"><b>No registration form yet</b><p>Create an event form in Manage → Forms and link it to this event to take registrations and issue QR tickets.</p></div></div>` : ""}
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
    kit.$$("[data-at]", el).forEach((b) => b.addEventListener("click", () => { atab = b.dataset.at; ctx.rerender(); }));
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

  /* ═════════ Door check-in ═════════ */
  let ctab = "scan", cq = "", scanner = null, torch = false;
  addEventListener("hashchange", () => { if (scanner && !location.hash.startsWith("#/club/checkin")) { scanner.stop(); scanner = null; } });
  pages["club/checkin"] = () => {
    const g = kit.gate("check-in"); if (g) return g;
    const id = kit.param("id");
    return ui.view(evE(id), (e) => {
      if (!e?.club_id || !(kit.can(e.club_id, "events.checkin") || kit.can(e.club_id, "attendance.take"))) return ui.emptyBox("lock", "For the club's door team", "Ask your club for the check-in permission.");
      if (!e.form_id) return ui.emptyBox("ticket", "This event has no registration form", "Check-in works with registrations and QR tickets.");
      const se = store.use(`club:evstats:${id}`, () => api.eventStats(id), { ttl: 15e3 }), s = se.value || {};
      const seeAll = kit.can(e.club_id, "forms.view_responses");
      const re = seeAll ? store.use(`club:resp:${e.form_id}`, () => api.responses(e.form_id), { ttl: 15e3 }) : { value: [] };
      const rows = re.value || [], recent = rows.filter((r) => r.checked_in_at).sort((a, b) => new Date(b.checked_in_at) - new Date(a.checked_in_at));
      return `${kit.back(`#/club/eventadmin?id=${id}`, "Event")}
        ${ui.ph("Check-in & Attendance", "Scan QR codes and manage event attendance in real time")}
        <section class="cl-ccard" style="grid-template-columns:96px 1fr"><span class="art">${ui.art(e.image, e.title)}</span><span><b>${esc(e.title)}</b><span class="xs">${ui.dateShort(e.starts_at)} · ${esc(e.venue || "")}</span></span></section>
        <div class="cl-stats c5 mt">${ui.stat("users", "purple", s.capacity || "–", "Total seats")}${ui.stat("checkc", "green", s.registered ?? "–", "Registered")}${ui.stat("check", "blue", s.checked_in ?? "–", "Checked in")}${ui.stat("clock", "amber", Math.max(0, (s.registered || 0) - (s.checked_in || 0)), "Pending")}${ui.stat("list", "purple", s.waitlist ?? "–", "Waitlist")}</div>
        <nav class="cl-seg">${[["scan", "QR Scanner"], ["list", "Attendee List"], ["wait", "Waitlist"], ["stats", "Analytics"]].map(([v, l]) => `<button data-ct="${v}" aria-pressed="${ctab === v}">${l}</button>`).join("")}</nav>
        ${ctab === "scan" ? `<div class="cl-row2"><section class="card" style="padding:10px">${canScan() ? `<video id="ci-video" playsinline muted style="width:100%;border-radius:14px;background:#111;aspect-ratio:1;object-fit:cover"></video><p class="xs mt-s" style="text-align:center">Point the camera at a participant's QR code</p>` : `<p class="small muted" style="padding:12px">This browser can't scan QR codes. Use manual check-in.</p>`}</section>
            <section class="card"><h2 style="font-size:16px">Manual Check-in</h2><form id="ci-man" class="row nowrap mt-s" style="gap:8px">${ui.input("q", "", 'placeholder="Ticket code" autocomplete="off" style="flex:1" aria-label="Ticket code"')}<button class="btn primary">Check in</button></form>
              ${canScan() ? `<div class="row mt" style="gap:8px"><button class="btn outline grow" id="ci-torch">${icon("bulb")} Flashlight</button><button class="btn outline grow" id="ci-flip">${icon("sync")} Switch Camera</button></div>` : ""}
              <div id="ci-last" class="mt" aria-live="polite"></div></section></div>
            ${seeAll ? `${ui.sec("Recent Check-ins")}<div class="cl-list">${recent.slice(0, 8).map((r) => `<div class="cl-li">${ui.ava(r.name)}<span class="body"><b>${esc(r.name)}</b><span>${esc(r.department || r.student_id)}</span></span><span class="end">${ui.time(r.checked_in_at)}${ui.st(["Checked In", "green"])}</span></div>`).join("") || `<p class="small muted" style="padding:12px">No one yet.</p>`}</div>` : ""}`
          : ctab === "stats" ? `<div class="cl-row2"><section class="card cl-chart"><h3>Check-ins per hour</h3>${charts.bars({ title: "Check-ins per hour", labels: (s.per_hour || []).map((x) => ui.time(x.h)), series: [{ name: "Check-ins", values: (s.per_hour || []).map((x) => x.n) }] })}</section>
              <section class="card cl-chart"><h3>Registrations by department</h3>${charts.donut({ title: "Registrations by department", items: Object.entries(s.by_department || {}).map(([label, value]) => ({ label, value })), sub: "people" })}</section></div>`
          : !seeAll ? ui.emptyBox("lock", "Attendee details need the responses permission", "You can still check people in with the scanner or ticket code.")
          : list(rows.filter((r) => (ctab === "wait" ? r.status === "waitlisted" : r.status !== "waitlisted" && r.status !== "rejected")), e)}
        ${seeAll ? `<div class="cl-bulkbar mt"><button class="btn outline" id="ci-export">${icon("download")} Export Attendees</button>${kit.can(e.club_id, "events.manage") ? `<a class="btn outline" href="#/club/eventadmin?id=${id}">${icon("megaphone")} Send Notification</a>` : ""}<button class="btn primary" data-ct="stats">${icon("bars")} Live Analytics</button></div>` : ""}`;
    }, { n: 3, h: 120 });
  };
  function list(rows, e) {
    const words = cq.toLowerCase().split(/\s+/).filter(Boolean);
    const l = rows.filter((r) => !words.length || words.every((w) => `${r.name} ${r.email} ${r.student_id} ${r.ticket}`.toLowerCase().includes(w)));
    return `<div class="searchbar cl-search">${icon("search")}<input class="input" id="ci-q" type="search" placeholder="Search by name or email" value="${esc(cq)}" autocomplete="off"></div>
      <div class="cl-list mt-s">${l.map((r) => `<div class="cl-li">${ui.ava(r.name)}<span class="body"><b>${esc(r.name)}</b><span>${esc([r.department, r.student_id].filter(Boolean).join(" · "))}</span></span>
        ${r.checked_in_at ? `<span class="end">${ui.time(r.checked_in_at)}${ui.st(["Checked In", "green"])}</span>` : r.status === "waitlisted" ? ui.st(["Waitlist", "purple"]) : `<button class="btn sm primary" data-in="${r.id}">Check in</button>`}</div>`).join("") || `<p class="small muted" style="padding:12px">No one here.</p>`}</div>`;
  }
  pages["club/checkin"].mount = (el) => {
    kit.bindRetry(el);
    const id = kit.param("id"), e = store.peek(`club:event:${id}`); if (!e?.form_id) return;
    const done = (r) => { const box = kit.$("#ci-last"); if (box) box.innerHTML = `<div class="alert green"><span class="a-ic">${icon("checkc")}</span><div><b>${esc(r.name)}</b><p>Checked in · ${esc(r.ticket || "")}</p></div></div>`; navigator.vibrate?.(60); store.invalidate(`club:evstats:${id}`, `club:resp:${e.form_id}`); };
    const fail = (msg) => { const box = kit.$("#ci-last"); if (box) box.innerHTML = `<div class="alert red"><span class="a-ic">${icon("alert")}</span><div><b>${esc(msg)}</b></div></div>`; navigator.vibrate?.([40, 60, 40]); };
    // Tickets show "EWUDCLUB:<form id>:<code>" as their QR (form.js); a typed code or a response id works too.
    const check = async (q) => {
      const m = String(q).match(/^EWUDCLUB:([0-9a-f-]{36}):(\w+)$/i);
      if (m && m[1] !== e.form_id) return fail("That ticket is for a different event");
      try { done(await api.eventCheckin(id, m ? m[2] : q)); } catch (err) { fail(err.message); }
    };
    kit.$$("[data-ct]", el).forEach((b) => b.addEventListener("click", () => { ctab = b.dataset.ct; if (ctab !== "scan") { scanner?.stop(); scanner = null; } ctx.rerender(); }));
    kit.$("#ci-man", el)?.addEventListener("submit", (ev) => { ev.preventDefault(); const v = String(new FormData(ev.target).get("q") || "").trim(); if (v) check(v); });
    kit.$$("[data-in]", el).forEach((b) => b.addEventListener("click", () => check(b.dataset.in)));
    const input = kit.$("#ci-q", el);
    input?.addEventListener("input", () => { cq = input.value; const pos = input.selectionStart; ctx.rerender(); const i = kit.$("#ci-q"); if (i) { i.focus(); i.setSelectionRange(pos, pos); } });
    kit.$("#ci-export", el)?.addEventListener("click", async () => {
      const rows = store.peek(`club:resp:${e.form_id}`) || [], form = await store.fetch(`club:form:${e.form_id}`, () => api.form(e.form_id));
      try { if (kit.can(e.club_id, "forms.export")) await api.logExport(e.club_id, `Attendees: ${e.title}`, rows.length); else return kit.toast("Exporting needs the export permission", "error"); } catch (err) { return kit.toast(err.message, "error"); }
      ui.download(`attendees-${e.title.replace(/[^\w]+/g, "-").slice(0, 30)}.csv`, toCSV(form, rows), "text/csv;charset=utf-8");
    });
    const video = kit.$("#ci-video", el);
    if (ctab === "scan" && video && canScan()) {
      // One scanner for the page; re-attach to the new <video> after a redraw.
      scanner?.stop();
      startScanner(video, (text) => check(text)).then((s) => { scanner = s; }).catch((err) => fail(err.message));
      kit.$("#ci-flip", el)?.addEventListener("click", () => scanner?.flip());
      kit.$("#ci-torch", el)?.addEventListener("click", async () => { torch = !torch; if (!(await scanner?.torch(torch))) kit.toast("This camera has no flashlight", "info"); });
    }
  };
}
