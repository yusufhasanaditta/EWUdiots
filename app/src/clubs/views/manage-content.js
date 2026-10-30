/* Console sections for content: posts (with audience, photos, a link to a form), events (in the campus feed,
   optionally members-only, optionally with a registration form) and the club's history and gallery. */
import { KINDS } from "../../events.js";
import { AUDIENCES, has } from "../perms.js";

const POST_KINDS = { news: "News", announcement: "Announcement", achievement: "Achievement", recruitment: "Recruitment" };
// <input type="datetime-local"> ↔ ISO, in the device's time zone (Bangladesh for nearly everyone using this).
const toLocal = (iso) => { if (!iso) return ""; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 16); };
const fromLocal = (v) => (v ? new Date(v).toISOString() : null);

/** @param {any} kit */
export function contentSections(kit) {
  const { ui, icon, esc, api, store } = kit;

  /* ═════════ Posts ═════════ */
  function composer(club, m, p = null) {
    const forms = store.peek(`club:forms:${club.id}`) || [];
    const auds = Object.entries(AUDIENCES).filter(([v]) => v !== "public" || has(m, "posts.publish_public"));
    let images = [...(p?.images || [])];
    const thumbs = () => images.map((u, i) => `<span class="cl-thumb"><img src="${esc(u)}" alt=""><button type="button" data-rmimg="${i}" aria-label="Remove photo">${icon("x", "sm")}</button></span>`).join("");
    ui.sheet(p ? "Edit post" : "New post", `<form id="ps-form" class="stack" novalidate>
      <div class="grid g2">${ui.field("Type", ui.select("kind", POST_KINDS, p?.kind || "news"))}${ui.field("Who can see it", ui.select("visibility", auds, p?.visibility || (has(m, "posts.publish_public") ? "public" : "members")))}</div>
      <div id="ps-wing" ${p?.visibility === "wing" ? "" : "hidden"}>${ui.field("Wing", club.wings?.length ? ui.select("wing", club.wings, p?.wing || m.wing || club.wings[0]) : ui.input("wing", p?.wing || m.wing, 'maxlength="40"'))}</div>
      ${ui.field("Title", ui.input("title", p?.title, 'required maxlength="160"'))}
      ${ui.field("Text", ui.area("body", p?.body, 'rows="7" maxlength="8000" placeholder="Links starting with https:// become clickable."'))}
      <div class="field"><span>Photos (up to 6)</span><div class="cl-thumbs" id="ps-thumbs">${thumbs()}</div><button type="button" class="btn sm outline" id="ps-img" style="justify-self:start">${icon("image", "sm")} Add photo</button></div>
      ${ui.field("Button link (optional)", ui.select("link", [["", "No button"], ...forms.filter((f) => f.status === "open").map((f) => [`#/club/form?id=${f.id}`, `Form: ${f.title}`]), ["custom", "A web link…"]], forms.some((f) => p?.link === `#/club/form?id=${f.id}`) ? p.link : p?.link ? "custom" : ""))}
      <div id="ps-url" ${p?.link && !p.link.startsWith("#/") ? "" : "hidden"}>${ui.input("url", p?.link?.startsWith("https://") ? p.link : "", 'type="url" placeholder="https://"')}</div>
      ${ui.toggle("pinned", p?.pinned, "Pin to the top")}
      <div id="cl-err"></div><div class="row" style="gap:8px"><button class="btn primary grow" data-st="published">${icon("megaphone")} ${p?.status === "published" ? "Save" : "Publish"}</button><button class="btn neutral" data-st="draft">Save draft</button></div></form>`, (sh) => {
      const f = kit.$("#ps-form", sh);
      f.visibility.addEventListener("change", () => { kit.$("#ps-wing", sh).hidden = f.visibility.value !== "wing"; });
      f.link.addEventListener("change", () => { kit.$("#ps-url", sh).hidden = f.link.value !== "custom"; });
      const redraw = () => { kit.$("#ps-thumbs", sh).innerHTML = thumbs(); kit.$$("[data-rmimg]", sh).forEach((b) => b.addEventListener("click", () => { images.splice(Number(b.dataset.rmimg), 1); redraw(); })); };
      redraw();
      kit.$("#ps-img", sh).addEventListener("click", async (e) => {
        if (images.length >= 6) return kit.toast("Up to 6 photos", "warn");
        const file = await ui.pickFile("image/jpeg,image/png,image/webp"); if (!file) return;
        kit.ctx.busy(e.currentTarget, true, "Uploading…");
        try { images.push(await api.uploadPublic(club.id, await ui.shrink(file), "posts")); redraw(); } catch (err) { kit.toast(err.message, "error"); }
        kit.ctx.busy(kit.$("#ps-img", sh), false);
      });
      kit.$$("[data-st]", sh).forEach((b) => b.addEventListener("click", async (e) => {
        e.preventDefault(); const v = ui.values(f);
        if (String(v.title).trim().length < 3) return ui.fail(sh, "Add a title (at least 3 characters).");
        const link = v.link === "custom" ? String(v.url || "").trim() : v.link;
        if (link && !/^(https:\/\/|#\/)/.test(link)) return ui.fail(sh, "Links must start with https://");
        const row = { kind: v.kind, visibility: v.visibility, wing: v.visibility === "wing" ? String(v.wing || "") : "", title: v.title.trim(), body: String(v.body || "").trim(), images, link: link || "", pinned: !!v.pinned, status: b.dataset.st };
        kit.ctx.busy(b, true, "Saving…");
        try {
          await (p ? api.updatePost(p.id, row) : api.createPost({ ...row, club_id: club.id }));
          kit.ctx.closeModal(); store.invalidate(`club:posts:${club.id}`, "feed:", "post:"); kit.toast(b.dataset.st === "draft" ? "Draft saved" : "Posted", "success");
        } catch (err) { kit.ctx.busy(b, false); ui.fail(sh, err.message); }
      }));
    });
  }

  const posts = { label: "Posts", icon: "megaphone", group: "Content", perm: "posts.write",
    render(club) {
      store.use(`club:forms:${club.id}`, () => api.forms(club.id), { ttl: 60e3 });
      const pe = store.use(`club:posts:${club.id}`, () => api.clubPosts(club.id, { drafts: true }), { ttl: 20e3 });
      return kit.head("Posts", "News and announcements. Choose who sees each one.", `<button class="btn primary" id="ps-new">${icon("plus")} New post</button>`)
        + ui.view(pe, (rows) => (rows.length ? `<section class="card tight">${rows.map((p) => `<div class="lrow"><span class="itile sm ${p.status === "draft" ? "orange" : "purple"}">${icon(p.pinned ? "pin" : "megaphone")}</span>
            <a class="body" href="#/club/post?id=${p.id}"><b>${esc(p.title)}</b><span>${esc(POST_KINDS[p.kind])} · ${esc(AUDIENCES[p.visibility])}${p.wing ? ` (${esc(p.wing)})` : ""} · ${p.status === "draft" ? "draft" : ui.ago(p.created_at)}</span></a>
            <button class="btn sm ghost icon-only" data-pe="${p.id}" aria-label="Edit">${icon("edit", "sm")}</button><button class="btn sm ghost icon-only" data-pd="${p.id}" aria-label="Delete">${icon("trash", "sm")}</button></div>`).join("")}</section>`
          : ui.emptyBox("megaphone", "No posts yet", "Share news, wins and announcements with your members or everyone.")));
    },
    mount(el, club, m) {
      const find = (id) => (store.peek(`club:posts:${club.id}`) || []).find((p) => p.id === id);
      kit.$("#ps-new", el)?.addEventListener("click", () => composer(club, m));
      kit.$$("[data-pe]", el).forEach((b) => b.addEventListener("click", () => composer(club, m, find(b.dataset.pe))));
      kit.$$("[data-pd]", el).forEach((b) => b.addEventListener("click", () => kit.ctx.confirmModal("Delete this post?", "Its comments and reactions go too.", "Delete", async () => { await api.deletePost(b.dataset.pd); store.invalidate(`club:posts:${club.id}`, "feed:"); }, true)));
      if (kit.param("new") === "1") composer(club, m);
    } };

  /* ═════════ Events ═════════ */
  function eventForm(club, e = null) {
    const forms = store.peek(`club:forms:${club.id}`) || [];
    ui.sheet(e ? "Edit event" : "New event", `<form id="ev-form" class="stack" novalidate>
      ${ui.field("Title", ui.input("title", e?.title, 'required maxlength="160"'))}
      ${ui.field("Type", ui.select("kind", Object.fromEntries(Object.entries(KINDS).filter(([k]) => k !== "other").concat([["other", "Other"]])), e?.kind || "club_event"))}
      <div class="grid g2">${ui.field("Starts", ui.input("starts_at", toLocal(e?.starts_at), 'type="datetime-local" required'))}${ui.field("Ends (optional)", ui.input("ends_at", toLocal(e?.ends_at), 'type="datetime-local"'))}</div>
      ${ui.field("Venue", ui.input("venue", e?.venue, 'maxlength="160" placeholder="e.g. FUB-603, Auditorium"'))}
      ${ui.field("Details", ui.area("description", e?.description, 'rows="5" maxlength="3000"'))}
      <div class="grid g2">${ui.field("Who can see it", ui.select("visibility", { public: "Everyone (also in campus Events)", members: "Club members only" }, e?.visibility || "public"))}${ui.field("Places (optional)", ui.input("capacity", e?.capacity || "", 'type="number" min="1" max="20000"'))}</div>
      ${ui.field("Registration form", ui.select("form_id", [["", "No registration"], ...forms.filter((f) => f.kind !== "membership").map((f) => [f.id, `${f.title}${f.status !== "open" ? ` (${f.status})` : ""}`])], e?.form_id || ""), "Create the form under Forms first. Its registrations get QR tickets.")}
      <div id="cl-err"></div><button class="btn primary block">${icon("calendar")} ${e ? "Save" : "Publish event"}</button></form>`, (sh) => {
      kit.$("#ev-form", sh).addEventListener("submit", async (ev) => {
        ev.preventDefault(); const v = ui.values(ev.target), btn = ev.target.querySelector("button.primary");
        if (String(v.title).trim().length < 3 || !v.starts_at) return ui.fail(sh, "Add a title and a start time.");
        if (v.ends_at && new Date(v.ends_at) < new Date(v.starts_at)) return ui.fail(sh, "The end is before the start.");
        const row = { title: v.title.trim(), kind: v.kind, starts_at: fromLocal(v.starts_at), ends_at: fromLocal(v.ends_at), venue: String(v.venue || "").trim(), description: String(v.description || "").trim(), visibility: v.visibility, capacity: v.capacity ? Number(v.capacity) : null, form_id: v.form_id || null, club_id: club.id };
        kit.ctx.busy(btn, true, "Saving…");
        try {
          const saved = await (e ? api.updateEvent(e.id, row) : api.createEvent(row));
          if (row.form_id) await api.updateForm(row.form_id, { event_id: saved.id }).catch(() => {});
          kit.ctx.closeModal(); store.invalidate(`club:events:${club.id}`, "events:upcoming"); kit.toast(e ? "Event saved" : "Event published", "success", row.visibility === "public" ? "It's on the campus Events page too." : "");
        } catch (err) { kit.ctx.busy(btn, false); ui.fail(sh, err.message); }
      });
    });
  }
  const events = { label: "Events", icon: "calendar", group: "Content", perm: "events.manage",
    render(club) {
      store.use(`club:forms:${club.id}`, () => api.forms(club.id), { ttl: 60e3 });
      const ee = store.use(`club:events:${club.id}`, () => api.clubEvents(club.id), { ttl: 30e3 });
      return kit.head("Events", "Public events also appear on the campus Events page for everyone.", `<button class="btn primary" id="ev-new">${icon("plus")} New event</button>`)
        + ui.view(ee, (rows) => (rows.length ? `<section class="card tight">${rows.map((e) => `<div class="lrow"><span class="cl-cal-date"><b>${ui.when(e.starts_at, { day: "numeric" })}</b><span>${ui.when(e.starts_at, { month: "short" })}</span></span>
            <span class="body"><b>${esc(e.title)}</b><span>${ui.dateTime(e.starts_at)}${e.venue ? ` · ${esc(e.venue)}` : ""}${e.visibility === "members" ? " · members only" : ""}${e.form_id ? " · registration" : ""}</span></span>
            ${e.form_id ? `<a class="btn sm ghost" href="#/club/manage?c=${club.id}&tab=responses&form=${e.form_id}">${icon("users", "sm")}</a>` : ""}<button class="btn sm ghost icon-only" data-ee="${e.id}" aria-label="Edit">${icon("edit", "sm")}</button><button class="btn sm ghost icon-only" data-ed="${e.id}" aria-label="Delete">${icon("trash", "sm")}</button></div>`).join("")}</section>`
          : ui.emptyBox("calendar", "No events yet", "Workshops, meetups, competitions: announce them here.")));
    },
    mount(el, club) {
      const find = (id) => (store.peek(`club:events:${club.id}`) || []).find((e) => e.id === id);
      kit.$("#ev-new", el)?.addEventListener("click", () => eventForm(club));
      kit.$$("[data-ee]", el).forEach((b) => b.addEventListener("click", () => eventForm(club, find(b.dataset.ee))));
      kit.$$("[data-ed]", el).forEach((b) => b.addEventListener("click", () => kit.ctx.confirmModal("Delete this event?", "It disappears from the campus Events page too.", "Delete", async () => { await api.deleteEvent(b.dataset.ed); store.invalidate(`club:events:${club.id}`, "events:upcoming"); }, true)));
      if (kit.param("new") === "1") eventForm(club);
    } };

  /* ═════════ History & gallery ═════════ */
  const history = { label: "History & gallery", icon: "image", group: "Content", perm: "posts.write",
    render(club, m) {
      const me = store.use(`club:milestones:${club.id}`, () => api.milestones(club.id)), ge = store.use(`club:media:${club.id}`, () => api.media(club.id));
      const canHist = has(m, "settings.edit");
      return kit.head("History & gallery", "Milestones and awards for the club's timeline, and photo albums.")
        + (canHist ? `<form id="hi-form" class="card stack"><h2>Add to the timeline</h2><div class="grid g2">${ui.field("Year", ui.input("year", new Date().getFullYear(), 'type="number" min="1990" max="2100" required'))}${ui.field("Kind", ui.select("kind", { milestone: "Milestone", award: "Award", event: "Big event" }))}</div>
            ${ui.field("Title", ui.input("title", "", 'required maxlength="140" placeholder="e.g. Champions, National Robotics Olympiad"'))}${ui.field("Details", ui.area("body", "", 'rows="2" maxlength="1500"'))}<div id="cl-err"></div><button class="btn primary sm" style="justify-self:start">${icon("plus", "sm")} Add</button></form>` : "")
        + ui.view(me, (rows) => (rows.length ? `<section class="card tight mt">${rows.map((x) => `<div class="lrow"><span class="cl-tl-year sm">${x.year}</span><span class="body"><b>${esc(x.title)}</b><span>${esc(x.kind)}</span></span>${canHist ? `<button class="btn sm ghost icon-only" data-hd="${x.id}" aria-label="Delete">${icon("trash", "sm")}</button>` : ""}</div>`).join("")}</section>` : ""))
        + `<section class="card mt stack"><h2>Gallery</h2><div class="row" style="gap:8px">${ui.input("album", "", 'id="ga-album" placeholder="Album, e.g. Club Fair 2026" maxlength="60" style="max-width:260px"')}<button class="btn outline sm" id="ga-up">${icon("upload", "sm")} Upload photos</button></div>
          ${ui.view(ge, (rows) => (rows.length ? `<div class="cl-gallery">${rows.map((r) => `<figure><img src="${esc(r.url)}" alt="" loading="lazy"><figcaption class="xs">${esc(r.album)}</figcaption><button class="cl-thumb-x" data-gd="${r.id}" aria-label="Delete photo">${icon("x", "sm")}</button></figure>`).join("")}</div>` : `<p class="small muted">No photos yet.</p>`))}</section>`;
    },
    mount(el, club) {
      kit.$("#hi-form", el)?.addEventListener("submit", async (e) => {
        e.preventDefault(); const v = ui.values(e.target);
        try { await api.addMilestone({ club_id: club.id, year: Number(v.year), kind: v.kind, title: v.title.trim(), body: String(v.body || "").trim() }); e.target.reset(); store.invalidate(`club:milestones:${club.id}`); } catch (err) { ui.fail(e.target, err.message); }
      });
      kit.$$("[data-hd]", el).forEach((b) => b.addEventListener("click", async () => { try { await api.deleteMilestone(b.dataset.hd); store.invalidate(`club:milestones:${club.id}`); } catch (err) { kit.toast(err.message, "error"); } }));
      kit.$("#ga-up", el)?.addEventListener("click", async (e) => {
        const input = document.createElement("input"); input.type = "file"; input.accept = "image/jpeg,image/png,image/webp"; input.multiple = true;
        input.addEventListener("change", async () => {
          const files = [...(input.files || [])].slice(0, 20), album = (kit.$("#ga-album", el)?.value || "").trim() || "General";
          kit.ctx.busy(e.target.closest("button"), true, `Uploading ${files.length}…`);
          let n = 0; for (const f of files) { try { await api.addMedia({ club_id: club.id, album, url: await api.uploadPublic(club.id, await ui.shrink(f), "gallery") }); n++; } catch (err) { kit.toast(err.message, "error"); break; } }
          store.invalidate(`club:media:${club.id}`); kit.toast(`${ui.plural(n, "photo")} added`, "success");
        }, { once: true });
        input.click();
      });
      kit.$$("[data-gd]", el).forEach((b) => b.addEventListener("click", async () => { try { await api.deleteMedia(b.dataset.gd); store.invalidate(`club:media:${club.id}`); } catch (err) { kit.toast(err.message, "error"); } }));
    } };

  return { posts, events, history };
}
