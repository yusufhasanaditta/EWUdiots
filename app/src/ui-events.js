/* Campus events (#/events): official ewubd.edu events (added by the daily job), events added by admins, and events that
   students, teachers and alumni suggest. Suggestions wait for an admin's approval (migration 0010); the poster sees
   their own pending ones and gets an inbox message when they're reviewed. Signed-out visitors can browse. */
import { KINDS } from "./events.js";
import { CLUBS } from "./campus-data.js";

const KIND_LOOK = { workshop: ["bulb", "blue"], seminar: ["megaphone", "purple"], concert: ["play", "pink"], cultural: ["sparkle", "orange"], club_recruitment: ["userpen", "green"],
  club_event: ["community", "teal"], competition: ["trophy", "yellow"], fair: ["building", "orange"], sports: ["flame", "red"], other: ["calendar", "purple"] };
const TZ = "Asia/Dhaka";
const dhaka = (d, o) => new Date(d).toLocaleString("en-GB", { timeZone: TZ, ...o });
const dayKey = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD in Dhaka
const ends = (e) => new Date(e.ends_at || e.starts_at).getTime() + (e.ends_at ? 0 : e.all_day ? 864e5 : 3 * 36e5);

export function install(ctx) {
  const { pages, icon, esc, $, $$, toast, openModal, closeModal, modalHead, busy, confirmModal } = ctx;
  const sb = () => ctx.cloud.sb, me = () => ctx.C.user, myRole = () => ctx.cloud.roleOf(me());
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  let rows = null, loadedAt = 0, kind = "all", past = false, loading = false;
  const refresh = (force) => {
    if (loading || (!force && rows && Date.now() - loadedAt < 60e3)) return;
    loading = true;
    sb().from("events").select("*").order("starts_at").limit(400).then(({ data, error }) => { rows = error ? { error: error.message } : data; loadedAt = Date.now(); loading = false; if (["events", "home"].includes(ctx.route())) ctx.rerender(); });
  };

  const when = (e) => {
    const sameDay = !e.ends_at || dayKey(e.ends_at) === dayKey(e.starts_at), t = (d) => dhaka(d, { hour: "numeric", minute: "2-digit" });
    if (e.all_day) return sameDay ? dhaka(e.starts_at, { weekday: "short", day: "numeric", month: "short" }) : `${dhaka(e.starts_at, { day: "numeric", month: "short" })} – ${dhaka(e.ends_at, { day: "numeric", month: "short" })}`;
    return sameDay ? `${dhaka(e.starts_at, { weekday: "short", day: "numeric", month: "short" })} · ${t(e.starts_at)}${e.ends_at ? `–${t(e.ends_at)}` : ""}` : `${dhaka(e.starts_at, { day: "numeric", month: "short" })}, ${t(e.starts_at)} – ${dhaka(e.ends_at, { day: "numeric", month: "short" })}`;
  };
  const soon = (e) => { const d = Math.round((new Date(dayKey(e.starts_at)) - new Date(dayKey(Date.now()))) / 864e5); return Date.now() >= new Date(e.starts_at) && Date.now() < ends(e) ? ["Happening now", "green"] : d === 0 ? ["Today", "green"] : d === 1 ? ["Tomorrow", "amber"] : d > 1 && d < 7 ? [`In ${d} days`, "blue"] : null; };
  const status = (e) => e.status === "pending" ? '<span class="pill amber">Waiting for approval</span>' : e.status === "rejected" ? `<span class="pill red">Not approved</span>` : "";
  const card = (e) => {
    const [ic] = KIND_LOOK[e.kind] || KIND_LOOK.other, s = soon(e);
    return `<article class="card ev-card ${ends(e) < Date.now() ? "dim" : ""}" data-ev="${e.id}">
      <div class="ev-date"><b>${dhaka(e.starts_at, { day: "numeric" })}</b><span>${dhaka(e.starts_at, { month: "short" })}</span></div>
      <div class="grow min0"><div class="row" style="gap:6px"><span class="pill">${icon(ic, "sm")} ${esc(KINDS[e.kind] || "Event")}</span>${e.pinned ? `<span class="pill purple">${icon("pin", "sm")} Pinned</span>` : ""}${e.source === "auto" ? `<span class="pill blue">${icon("checkc", "sm")} Official</span>` : ""}${s ? `<span class="pill ${s[1]}">${s[0]}</span>` : ""}${status(e)}</div>
        <h3 class="ev-title">${esc(e.title)}</h3>
        <p class="small muted">${icon("clock", "sm")} ${when(e)}${e.venue ? ` · ${icon("pin", "sm")} ${esc(e.venue)}` : ""}</p>
        ${e.organizer ? `<p class="xs mt-s">By ${esc(e.organizer)}</p>` : ""}
        ${e.status === "rejected" && e.review_note ? `<p class="xs mt-s" style="color:var(--error-t)">${esc(e.review_note)}</p>` : ""}</div>
      ${icon("chevR", "chev")}</article>`;
  };

  pages.events = () => {
    const canPost = me() && ["student", "faculty", "alumni"].includes(myRole());
    const head = ctx.head("Events", "Workshops, concerts, club recruitment and everything happening on campus.",
      canPost ? `<button class="btn primary" id="ev-new">${icon("plus")} Suggest an event</button>` : ctx.cloud.enabled && !me() ? `<a class="btn" href="#/login?from=profile">${icon("user")} Sign in to post</a>` : "");
    if (!ctx.cloud.enabled) return head + `<section class="card">${ctx.empty("icon:cloudoff", "Needs the EWUdiots server", "This build runs on this device only.")}</section>`;
    refresh();
    if (!rows) return head + `<div class="stack mt">${[1, 2, 3].map(() => '<div class="skel" style="height:110px"></div>').join("")}</div>`;
    const all = rows.error ? [] : rows, now = Date.now();
    const mine = me() ? all.filter((e) => e.created_by === me().id && e.status !== "approved") : [];
    const live = all.filter((e) => e.status === "approved" && (kind === "all" || e.kind === kind));
    const list = past ? live.filter((e) => ends(e) < now).reverse().slice(0, 60) : live.filter((e) => ends(e) >= now).sort((a, b) => b.pinned - a.pinned || new Date(a.starts_at) - new Date(b.starts_at));
    const groups = [];
    for (const e of list) { const g = past ? dhaka(e.starts_at, { month: "long", year: "numeric" }) : soon(e) ? "This week" : dhaka(e.starts_at, { month: "long", year: "numeric" }); const last = groups[groups.length - 1]; if (last && last[0] === g && !e.pinned) last[1].push(e); else groups.push([e.pinned && !past ? "Pinned" : g, [e]]); }
    const merged = groups.reduce((a, [g, l]) => { const p = a[a.length - 1]; if (p && p[0] === g) p[1].push(...l); else a.push([g, l]); return a; }, []);
    return `${head}${rows.error ? `<div class="alert red">${icon("x")}<div><b>Couldn't load events</b><p>${esc(rows.error)}</p></div></div>` : ""}
      ${mine.length ? `<section class="card soft" style="margin-bottom:14px"><h3>${icon("clock", "sm")} Your suggestions</h3><p class="xs">An admin checks each event before everyone can see it. You'll get a message when it's reviewed.</p><div class="stack mt-s">${mine.map(card).join("")}</div></section>` : ""}
      <div class="row between wrap" style="gap:8px"><div class="chips">${[["all", "All"], ...Object.entries(KINDS)].map(([v, l]) => `<button class="chip" data-kind="${v}" aria-pressed="${kind === v}">${esc(l)}</button>`).join("")}</div>
        <div class="seg"><button data-past="0" aria-pressed="${!past}">Upcoming</button><button data-past="1" aria-pressed="${past}">Past</button></div></div>
      ${merged.length ? merged.map(([g, l]) => `<h2 class="ev-group">${esc(g)}</h2><div class="stack">${l.map(card).join("")}</div>`).join("")
        : `<div class="card mt">${ctx.empty("icon:calendar", past ? "No past events" : "No upcoming events yet", past ? "" : canPost ? "Know about a workshop, concert or club recruitment? Suggest it and an admin will publish it." : "Official EWU events appear here automatically, along with ones students suggest.", canPost && !past ? `<button class="btn primary" id="ev-new2">${icon("plus")} Suggest an event</button>` : "")}</div>`}
      <p class="xs mt" style="text-align:center">Official events are read from ewubd.edu/events. Unofficial · not affiliated with EWU.</p>`;
  };
  pages.events.mount = (el) => {
    $$("[data-kind]", el).forEach((b) => b.addEventListener("click", () => { kind = b.dataset.kind; ctx.rerender(); }));
    $$("[data-past]", el).forEach((b) => b.addEventListener("click", () => { past = b.dataset.past === "1"; ctx.rerender(); }));
    $$("[data-ev]", el).forEach((c) => c.addEventListener("click", () => details(c.dataset.ev)));
    ["#ev-new", "#ev-new2"].forEach((s) => $(s, el)?.addEventListener("click", () => form()));
    const id = ctx.qparam("id"); if (id && rows && !rows.error && rows.some((e) => e.id === id)) details(id);
  };

  function details(id) {
    const e = rows.find((x) => x.id === id); if (!e) return;
    const [ic, tone] = KIND_LOOK[e.kind] || KIND_LOOK.other, mine = me() && e.created_by === me().id;
    openModal(modalHead(e.title) + `<div class="stack">
      ${e.image ? `<img class="ev-img" src="${esc(e.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}
      <div class="row" style="gap:6px"><span class="itile sm ${tone}">${icon(ic)}</span><b>${esc(KINDS[e.kind] || "Event")}</b>${status(e)}</div>
      <div class="lrow"><span class="itile purple">${icon("clock")}</span><span class="body"><b>${when(e)}</b><span>Bangladesh time</span></span></div>
      ${e.venue ? `<div class="lrow"><span class="itile purple">${icon("pin")}</span><span class="body"><b>${esc(e.venue)}</b><span>Venue</span></span></div>` : ""}
      ${e.organizer ? `<div class="lrow"><span class="itile purple">${icon("community")}</span><span class="body"><b>${esc(e.organizer)}</b><span>Organizer</span></span></div>` : ""}
      ${e.description ? `<div class="prose small">${esc(e.description).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("")}</div>` : ""}
      <div class="row">${ends(e) >= Date.now() ? `<button class="btn primary" id="ev-ics">${icon("calendar")} Add to calendar</button>` : ""}${e.link ? `<a class="btn" href="${esc(e.link)}" target="_blank" rel="noopener nofollow">${icon("external", "sm")} ${e.source === "auto" ? "On ewubd.edu" : "Register / details"}</a>` : ""}<button class="btn ghost" id="ev-share">${icon("share", "sm")} Share</button></div>
      ${mine ? `<div class="row">${e.status === "pending" ? `<button class="btn sm" id="ev-edit">${icon("edit", "sm")} Edit</button>` : ""}<button class="btn sm ghost" id="ev-del">${icon("trash", "sm")} Delete</button></div>` : ""}
      ${e.source === "user" ? '<p class="xs">Suggested by a member and approved by the EWUdiots team. Check with the organizer before you go.</p>' : ""}</div>`, (m) => {
      $("#ev-ics", m)?.addEventListener("click", () => ics(e));
      $("#ev-share", m).addEventListener("click", async () => { try { const r = await ctx.native.share({ title: e.title, text: `${e.title} · ${when(e)}${e.venue ? ` · ${e.venue}` : ""}`, url: `${location.origin}/app.html#/events?id=${e.id}` }); if (r === "copied") toast("Link copied"); } catch { /* cancelled */ } });
      $("#ev-edit", m)?.addEventListener("click", () => form(e));
      $("#ev-del", m)?.addEventListener("click", () => confirmModal("Delete this event?", "", "Delete", async () => { ok(await sb().from("events").delete().eq("id", e.id)); refresh(true); toast("Deleted"); }, true));
    });
  }

  function ics(e) {
    const stamp = (d) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"), date = (d) => dayKey(d).replace(/-/g, "");
    const txt = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/[,;]/g, (c) => "\\" + c).replace(/\r?\n/g, "\\n");
    const span = e.all_day ? [`DTSTART;VALUE=DATE:${date(e.starts_at)}`, `DTEND;VALUE=DATE:${date(new Date(e.ends_at || e.starts_at).getTime() + 864e5)}`]
      : [`DTSTART:${stamp(e.starts_at)}`, `DTEND:${stamp(e.ends_at || new Date(e.starts_at).getTime() + 2 * 36e5)}`];
    const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//EWUdiots//Events//EN", "BEGIN:VEVENT", `UID:${e.id}@ewudiots`, `DTSTAMP:${stamp(Date.now())}`, ...span,
      `SUMMARY:${txt(e.title)}`, e.venue && `LOCATION:${txt(e.venue)}`, `DESCRIPTION:${txt([e.organizer && `By ${e.organizer}`, e.description, e.link].filter(Boolean).join("\n\n"))}`, "END:VEVENT", "END:VCALENDAR"].filter(Boolean).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([body], { type: "text/calendar" })); a.download = "ewu-event.ics"; a.click(); toast("Calendar file downloaded", "success", "Open it to add the event.");
  }

  function form(e = null) {
    const d = e ? dayKey(e.starts_at) : "", t = (x) => (x && !e.all_day ? dhaka(x, { hour: "2-digit", minute: "2-digit", hour12: false }) : "");
    openModal(modalHead(e ? "Edit your event" : "Suggest an event") + `<form id="evf" class="grid g2" novalidate>
      <label class="field full-row">Event name<input class="input" name="title" required minlength="3" maxlength="160" value="${esc(e?.title || "")}" placeholder="Robotics Club Recruitment — Fall 2026"></label>
      <label class="field">Type<select class="select" name="kind">${Object.entries(KINDS).map(([v, l]) => `<option value="${v}" ${(e?.kind || "club_event") === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
      <label class="field">Organizer / club<input class="input" name="organizer" maxlength="120" list="ev-clubs" value="${esc(e?.organizer || "")}" placeholder="e.g. Computer Programming Club"><datalist id="ev-clubs">${CLUBS.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></label>
      <label class="field">Date<input class="input" name="date" type="date" required value="${d}" min="${dayKey(Date.now())}"></label>
      <label class="field">Last day <span class="xs">(if longer)</span><input class="input" name="until" type="date" value="${e?.ends_at && dayKey(e.ends_at) !== d ? dayKey(e.ends_at) : ""}"></label>
      <label class="field">Starts at <span class="xs">(optional)</span><input class="input" name="start" type="time" value="${t(e?.starts_at)}"></label>
      <label class="field">Ends at <span class="xs">(optional)</span><input class="input" name="end" type="time" value="${t(e?.ends_at)}"></label>
      <label class="field full-row">Venue<input class="input" name="venue" maxlength="160" value="${esc(e?.venue || "")}" placeholder="Manzur Elahi Auditorium, or Room 630"></label>
      <label class="field full-row">Registration or details link <span class="xs">(https, optional)</span><input class="input" name="link" type="url" maxlength="500" value="${esc(e?.link || "")}" placeholder="https://forms.gle/…"></label>
      <label class="field full-row">About the event<textarea class="input" name="description" rows="4" maxlength="3000" placeholder="What happens, who can join, fees, what to bring…">${esc(e?.description || "")}</textarea></label>
      <div id="evf-err" class="full-row"></div>
      <p class="xs full-row">${icon("shield", "sm")} An admin checks every suggestion before it's shown to everyone.</p>
      <div class="row full-row"><span class="grow"></span><button class="btn primary">${icon("check")} ${e ? "Save" : "Send for approval"}</button></div></form>`, (m) => $("#evf", m).addEventListener("submit", async (ev) => {
      ev.preventDefault(); const f = Object.fromEntries(new FormData(ev.target)), err = (x) => { $("#evf-err", m).innerHTML = `<div class="alert red">${icon("alert")}<div><p>${esc(x)}</p></div></div>`; };
      const title = f.title.trim(), link = f.link.trim();
      if (title.length < 3) return err("Give the event a name.");
      if (!f.date) return err("Pick the date.");
      if (link && !/^https:\/\//i.test(link)) return err("The link must start with https://");
      const startsAt = `${f.date}T${f.start || "00:00"}:00+06:00`, lastDay = f.until && f.until > f.date ? f.until : f.date;
      const endsAt = f.end ? `${lastDay}T${f.end}:00+06:00` : lastDay !== f.date ? `${lastDay}T23:59:00+06:00` : null;
      if (endsAt && new Date(endsAt) < new Date(startsAt)) return err("It can't end before it starts.");
      if (new Date(endsAt || startsAt).getTime() + 864e5 < Date.now()) return err("That date has already passed.");
      const row = { title: title.slice(0, 160), kind: f.kind, organizer: f.organizer.trim(), venue: f.venue.trim(), link, description: f.description.trim(), starts_at: startsAt, ends_at: endsAt, all_day: !f.start };
      const b = ev.target.querySelector("button.primary"); busy(b, true, "Sending…");
      try {
        if (e) ok(await sb().from("events").update(row).eq("id", e.id));
        else ok(await sb().from("events").insert({ ...row, author_name: (ctx.S.profile?.name || "").slice(0, 80) }));
        closeModal(); refresh(true); toast(e ? "Saved" : "Sent for approval", "success", e ? "" : "You'll get a message when an admin reviews it.");
      } catch (x) { busy(b, false); err(/row-level|limit/i.test(x.message) ? "You've suggested a few events today. Try again tomorrow." : x.message); }
    }));
  }

  // Home card: the next few approved events (fetched once per minute at most).
  return {
    upcoming(n = 3) { if (!ctx.cloud.enabled) return []; refresh(); return rows && !rows.error ? rows.filter((e) => e.status === "approved" && ends(e) >= Date.now()).sort((a, b) => b.pinned - a.pinned || new Date(a.starts_at) - new Date(b.starts_at)).slice(0, n) : []; },
    when, look: (k) => KIND_LOOK[k] || KIND_LOOK.other
  };
}
