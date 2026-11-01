/* Post card + reactions + comments, shared by the feed, club profiles and the members' space. */

// Kind → [icon, label, tone]; the boards show the kind as a tinted pill at the top right of each post.
const KIND = { news: ["megaphone", "News", "gray"], announcement: ["bell", "Announcement", "purple"], achievement: ["trophy", "Achievement", "amber"], recruitment: ["userpen", "Recruitment", "green"],
  event: ["calendar", "Event", "blue"], project: ["kanban", "Project Update", "amber"], gallery: ["image", "Gallery", "pink"] };

/** @param {any} kit */
export function createPosts(kit) {
  const { ui, icon, esc, api, store } = kit;

  /** Reactions and comment counts for a list of posts (one request each). */
  const meta = (posts) => {
    const ids = posts.map((p) => p.id), key = ids.join(",");
    const r = store.use(`meta:r:${key}`, () => api.reactions(ids), { ttl: 30e3 }).value || {};
    const c = store.use(`meta:c:${key}`, () => api.commentCounts(ids), { ttl: 30e3 }).value || {};
    return { r, c };
  };

  /** @param {any} p a post (with p.clubs joined when shown outside its club) */
  function card(p, { r = {}, c = {} } = {}, { showClub = true } = {}) {
    const club = p.clubs, [ic, label, tone] = KIND[p.kind] || KIND.news, re = r[p.id] || { n: 0, mine: null };
    const long = p.body.length > 360;
    return `<article class="card cl-post" data-post="${p.id}">
      <header class="row nowrap" style="gap:10px">
        ${showClub && club ? `<a href="#/club/c?slug=${encodeURIComponent(club.slug)}" class="row nowrap min0" style="gap:10px">${ui.logo(club, "sm")}<span class="min0"><b class="ellipsis" style="display:block">${esc(club.name)}${ui.verified(club)}</b><span class="xs">${ui.ago(p.created_at)}</span></span></a>`
          : `<span class="itile sm purple">${icon(ic)}</span><span class="min0"><b style="display:block">${esc(p.author_name || "Club")}</b><span class="xs">${ui.ago(p.created_at)}</span></span>`}
        <span class="push row nowrap" style="gap:6px">${p.pinned ? ui.pill(`${icon("pin", "sm")} Pinned`, "purple") : ""}${p.status === "draft" ? ui.pill("Draft", "amber") : ""}${p.visibility !== "public" ? `<span class="cl-aud" title="${esc(p.visibility === "exec" ? "Executives only" : "Members only")}">${icon(p.visibility === "exec" ? "lock" : "users", "sm")}</span>` : ""}${ui.st([label, tone])}</span></header>
      <a class="cl-post-body" href="#/club/post?id=${p.id}">
        <h3>${esc(p.title)}</h3>
        ${p.body ? `<p class="${long ? "clamp" : ""}">${ui.rich(long ? p.body.slice(0, 360) + "…" : p.body)}</p>` : ""}
        ${p.images?.length ? `<div class="cl-imgs n${Math.min(p.images.length, 3)}">${p.images.slice(0, 3).map((u) => `<img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer">`).join("")}</div>` : ""}</a>
      ${p.link && !p.event_id ? `<a class="btn sm outline" href="${esc(p.link)}" ${p.link.startsWith("https://") ? 'target="_blank" rel="noopener noreferrer"' : ""}>${icon(p.link.startsWith("#/club/form") ? "edit" : "external", "sm")} ${p.link.startsWith("#/club/form") ? "Open the form" : "Open link"}</a>` : ""}
      <footer class="cl-post-foot">
        <button class="cl-react ${re.mine ? "on" : ""}" data-react="${p.id}" aria-pressed="${!!re.mine}" ${kit.me() ? "" : "disabled"}>${icon("heart", "sm")} <span>${re.n || ""}</span><span class="sr-only">likes</span></button>
        <a class="cl-react" href="#/club/post?id=${p.id}">${icon("notes", "sm")} <span>${c[p.id] || ""}</span><span class="sr-only">comments</span></a>
        <button class="cl-react" data-share="${p.id}" aria-label="Share">${icon("share", "sm")}</button>
        ${p.event_id ? `<a class="btn sm outline push" href="#/club/event?id=${p.event_id}">Register Now</a>` : p.kind === "recruitment" || p.link?.startsWith("#/club/form") ? `<a class="btn sm outline push" href="${esc(p.link || `#/club/post?id=${p.id}`)}">View Details</a>` : `<a class="cl-react push" href="#/club/post?id=${p.id}" aria-label="Open">${icon("bookmark", "sm")}</a>`}</footer></article>`;
  }

  /* Announcement rows (the board's list): picture or poster, kind tag, title, club, date, place or a snippet. */
  const SAVED = "ewud:saved-posts";
  const saved = () => { try { return JSON.parse(localStorage.getItem(SAVED) || "[]"); } catch { return []; } };
  const toggleSave = (id) => { const l = saved(), on = l.includes(id); try { localStorage.setItem(SAVED, JSON.stringify(on ? l.filter((x) => x !== id) : [id, ...l].slice(0, 200))); } catch { /* private mode */ } kit.toast(on ? "Removed from saved" : "Saved", "success"); return !on; };
  const tagOf = (p) => { if (p.pinned) return ["Alert", "red", "alert"]; const [ic, l, t] = KIND[p.kind] || KIND.news; return [["news", "announcement"].includes(p.kind) ? "General" : l, t, ic]; };
  const poster = (p, big = false) => { const [, tone, ic] = tagOf(p); return `<span class="an-poster t-${tone}${big ? " big" : ""}">${icon(ic)}<b>${esc(p.title.split(/\s+/).slice(0, big ? 8 : 4).join(" "))}</b></span>`; };
  function row(p) {
    const [tag, tone] = tagOf(p), ev = p.events, img = p.images?.[0];
    return `<article class="an-card" data-post="${p.id}"><a class="an-thumb" href="#/club/post?id=${p.id}" tabindex="-1" aria-hidden="true">${poster(p)}${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}</a>
      <div class="an-body min0"><div class="row nowrap" style="gap:6px"><span class="an-tag t-${tone}">${tag}</span><button class="an-more push" data-amore="${p.id}" aria-label="More options">${icon("more")}</button></div>
        <a class="an-title clamp2" href="#/club/post?id=${p.id}">${esc(p.title)}</a>
        ${p.clubs ? `<span class="an-club">${ui.logo(p.clubs, "xs")}<span class="ellipsis">${esc(p.clubs.name)}</span></span>` : ""}
        <span class="an-meta">${icon("calendar", "sm")} ${ev?.starts_at ? `${ui.when(ev.starts_at, { day: "numeric", month: "short", year: "numeric" })} · ${ui.time(ev.starts_at)}` : ui.when(p.created_at, { day: "numeric", month: "short", year: "numeric" })}</span>
        ${ev?.venue ? `<span class="an-meta">${icon("pin", "sm")} <span class="ellipsis">${esc(ev.venue)}</span></span>` : p.body ? `<p class="an-snip clamp2">${esc(p.body.replace(/[*_#>`]/g, "").slice(0, 160))}</p>` : ""}</div></article>`;
  }
  function bindRows(el) {
    // Pictures from club sites sometimes fail to load; the poster underneath shows instead.
    kit.$$(".an-thumb img, .pd-hero > img", el).forEach((im) => { const drop = () => im.remove(); if (im.complete && !im.naturalWidth) drop(); else im.addEventListener("error", drop); });
    kit.$$("[data-amore]", el).forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.amore, on = saved().includes(id), url = `${kit.ctx.SITE}/app.html#/club/post?id=${id}`;
      ui.sheet("Announcement", `<div class="cl-list"><a class="cl-li" href="#/club/post?id=${id}">${icon("external", "sm")}<span class="body"><b>Open</b></span></a>
        <button class="cl-li" data-x="share">${icon("share", "sm")}<span class="body"><b>Share</b></span></button>
        <button class="cl-li" data-x="save">${icon("bookmark", "sm")}<span class="body"><b>${on ? "Remove from saved" : "Save"}</b></span></button></div>`, (m) => {
        kit.$("a", m).addEventListener("click", () => kit.ctx.closeModal());
        kit.$('[data-x="share"]', m).addEventListener("click", () => { kit.ctx.closeModal(); kit.ctx.native.share({ title: "EWUdiots Club", url }).catch(() => { navigator.clipboard?.writeText(url); kit.toast("Link copied"); }); });
        kit.$('[data-x="save"]', m).addEventListener("click", () => { toggleSave(id); kit.ctx.closeModal(); });
      });
    }));
    kit.$$("[data-psave]", el).forEach((b) => b.addEventListener("click", () => { const on = toggleSave(b.dataset.psave); kit.$$(`[data-psave="${b.dataset.psave}"]`, el).forEach((x) => { x.setAttribute("aria-pressed", String(on)); x.innerHTML = `${icon("bookmark", on ? "solid" : "")}${x.dataset.lbl ? ` ${on ? "Saved" : "Save"}` : ""}`; }); }));
  }

  /** Wire up like and share buttons inside el. */
  function bind(el) {
    kit.$$("[data-react]", el).forEach((b) => b.addEventListener("click", async (e) => {
      e.preventDefault(); const id = b.dataset.react, on = b.getAttribute("aria-pressed") === "true";
      // Optimistic: flip now, then save.
      const n = b.querySelector("span"); b.classList.toggle("on", !on); b.setAttribute("aria-pressed", String(!on)); n.textContent = String(Math.max(0, (Number(n.textContent) || 0) + (on ? -1 : 1)) || (b.closest(".pd-acts") ? "0" : ""));
      try { await (on ? api.unreact(id) : api.react(id)); store.invalidate("meta:r:"); } catch (err) { kit.toast(err.message, "error"); store.invalidate("meta:r:"); }
    }));
    kit.$$("[data-share]", el).forEach((b) => b.addEventListener("click", () => {
      const url = `${kit.ctx.SITE}/app.html#/club/post?id=${b.dataset.share}`;
      kit.ctx.native.share({ title: "EWUdiots Club", text: b.closest(".cl-post")?.querySelector("h3")?.textContent || "", url }).catch(() => { navigator.clipboard?.writeText(url); kit.toast("Link copied"); });
    }));
  }

  /** Full post page (#/club/post?id=…) with comments. */
  function page() {
    const id = kit.param("id"); if (!id) return ui.emptyBox("notes", "Post not found", "");
    const pe = store.use(`post:${id}`, () => api.post(id));
    return kit.back("#/club/feed", "Announcements") + ui.view(pe, (p) => {
      if (!p) return ui.emptyBox("lock", "You can't see this post", "It may be for club members only, or it was removed.");
      const m = meta([p]), ce = store.use(`comments:${id}`, () => api.comments(id), { ttl: 20e3 });
      const mod = kit.can(p.club_id, "comments.moderate"), [tag, tone] = tagOf(p), re = m.r[p.id] || { n: 0, mine: null }, isSaved = saved().includes(p.id);
      const ev = p.event_id ? store.use(`club:event:${p.event_id}`, () => api.event(p.event_id), { ttl: 45e3 }).value : null;
      const filled = ev?.form_id ? store.use(`club:fcount:${ev.form_id}`, () => api.formCount(ev.form_id), { ttl: 30e3 }).value ?? null : null;
      const following = kit.me() ? (store.use("me:follows", api.follows).value || []).includes(p.club_id) : false;
      const upcoming = ev && new Date(ev.ends_at || ev.starts_at) > Date.now();
      return `<div class="pd-hero">${poster(p, true)}${p.images?.[0] ? `<img src="${esc(p.images[0])}" alt="" referrerpolicy="no-referrer">` : ""}<span class="an-tag t-${tone}">${tag}</span>
          <button class="pd-save" data-psave="${p.id}" aria-pressed="${isSaved}" aria-label="Save">${icon("bookmark", isSaved ? "solid" : "")}</button></div>
        <section class="pd-main" data-post="${p.id}"><h1>${esc(p.title)}</h1>
          <div class="pd-facts">${ev ? `<span>${icon("calendar", "sm")} ${ui.when(ev.starts_at, { day: "numeric", month: "short", year: "numeric" })} (${ui.when(ev.starts_at, { weekday: "long" })})</span><span>${icon("clock", "sm")} ${ui.time(ev.starts_at)}${ev.ends_at ? ` - ${ui.time(ev.ends_at)}` : ""}</span>${ev.venue ? `<span>${icon("pin", "sm")} ${esc(ev.venue)}</span>` : ""}`
            : `<span>${icon("calendar", "sm")} ${ui.when(p.created_at, { day: "numeric", month: "short", year: "numeric" })}</span>${p.author_name ? `<span>${icon("user", "sm")} ${esc(p.author_name)}</span>` : ""}`}</div>
          ${p.clubs ? `<div class="pd-club"><a class="row nowrap min0" style="gap:12px;color:inherit;text-decoration:none" href="#/club/c?slug=${encodeURIComponent(p.clubs.slug)}">${ui.logo(p.clubs, "md")}<span class="min0"><b>${esc(p.clubs.name)}${ui.verified(p.clubs)}</b><span>@${esc(p.clubs.slug)}</span></span></a>
            ${kit.me() ? `<button class="btn sm outline" id="pd-follow" aria-pressed="${following}">${icon(following ? "check" : "plus", "sm")} ${following ? "Following" : "Follow"}</button>` : ""}</div>` : ""}
          ${p.body ? `<div class="pd-body">${ui.rich(p.body)}</div>` : ""}
          ${p.images?.length > 1 ? `<div class="cl-imgs n${Math.min(p.images.length - 1, 3)}">${p.images.slice(1, 4).map((u) => `<img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer">`).join("")}</div>` : ""}
          ${ev?.perks?.length ? `<div class="pd-hl"><h2>${icon("star", "solid")} Event Highlights</h2><ul>${ev.perks.map((x) => `<li>${icon("checkc", "solid")}${esc(x)}</li>`).join("")}</ul></div>` : ""}
          ${ev?.speakers?.length ? `<h2 class="pd-h">${icon("mic", "sm")} Speakers</h2><div class="pd-spk">${ev.speakers.map((x) => `<div>${x.photo ? `<img src="${esc(x.photo)}" alt="">` : `<span class="ph">${esc(ui.initials(x.name))}</span>`}<span class="min0"><b>${esc(x.name)}</b><span>${esc(x.role || "")}</span></span></div>`).join("")}</div>` : ""}
          ${ev && upcoming ? `<div class="pd-reg">${ev.capacity || filled != null ? `<div>${icon("users")}<span><b>${filled ?? "–"}${ev.capacity ? ` / ${ev.capacity}` : ""}</b><span>Registered</span></span></div>` : ""}
            ${ev.form_id ? `<div class="ok">${icon("lock", "sm")}<span><b>Registration Open</b><span>Until ${ui.when(ev.starts_at, { day: "numeric", month: "short", year: "numeric" })}</span></span></div>` : ""}
            <a class="btn primary lg" href="#/club/event?id=${ev.id}">Register Now ${icon("arrow", "sm")}</a></div>`
            : ev ? `<a class="btn outline block mt-s" href="#/club/event?id=${ev.id}">View event</a>`
            : p.link ? `<a class="btn primary block mt-s" href="${esc(p.link)}" ${p.link.startsWith("https://") ? 'target="_blank" rel="noopener noreferrer"' : ""}>${p.link.startsWith("#/club/form") ? "Open the form" : "Open link"} ${icon("arrow", "sm")}</a>` : ""}
          <h3 hidden>${esc(p.title)}</h3>
          <div class="pd-acts"><button class="cl-react ${re.mine ? "on" : ""}" data-react="${p.id}" aria-pressed="${!!re.mine}" ${kit.me() ? "" : "disabled"}>${icon("thumb", "sm")} Like (<span>${re.n || 0}</span>)</button>
            <button class="cl-react" data-share="${p.id}">${icon("share", "sm")} Share</button>
            <button class="cl-react" data-psave="${p.id}" data-lbl="1" aria-pressed="${isSaved}">${icon("bookmark", isSaved ? "solid" : "")} ${isSaved ? "Saved" : "Save"}</button></div></section>
        <section class="card mt"><h2>${icon("notes", "sm")} Comments</h2>
          ${ui.view(ce, (rows) => (rows.length ? `<div class="stack mt-s">${rows.map((x) => `<div class="cl-comment ${x.hidden ? "dim" : ""}"><span class="avatar sm">${esc(ui.initials(x.author_name))}</span><div class="grow min0"><b>${esc(x.author_name || "Member")}</b> <span class="xs">${ui.ago(x.created_at)}${x.hidden ? " · hidden" : ""}</span><p>${ui.rich(x.body)}</p></div>
            ${x.user_id === kit.me()?.id || mod ? `<button class="btn sm ghost icon-only" data-cdel="${x.id}" aria-label="Delete comment">${icon("trash", "sm")}</button>` : ""}${mod && x.user_id !== kit.me()?.id ? `<button class="btn sm ghost icon-only" data-chide="${x.id}" data-h="${x.hidden ? 0 : 1}" aria-label="${x.hidden ? "Show" : "Hide"} comment">${icon(x.hidden ? "eye" : "x", "sm")}</button>` : ""}</div>`).join("")}</div>`
            : `<p class="small muted mt-s">No comments yet.</p>`), { n: 2, h: 56 })}
          ${kit.me() ? `<form id="cm-form" class="row nowrap mt" style="gap:8px"><input class="input grow" name="body" maxlength="1000" placeholder="Write a comment…" required><button class="btn primary">${icon("arrow")}<span class="sr-only">Send</span></button></form>` : `<p class="xs mt">Sign in to comment.</p>`}
          <button class="lnk xs mt" id="cm-report">${icon("flag", "sm")} Report this post</button></section>`;
    });
  }
  page.mount = (el) => {
    const id = kit.param("id"), p = store.peek(`post:${id}`);
    bind(el); bindRows(el); kit.bindRetry(el);
    kit.$("#pd-follow", el)?.addEventListener("click", async (ev) => {
      if (!p) return; const on = ev.currentTarget.getAttribute("aria-pressed") === "true";
      try { await (on ? api.unfollow(p.club_id) : api.follow(p.club_id)); store.invalidate("me:follows", "clubs:counts"); } catch (err) { kit.toast(err.message, "error"); }
    });
    kit.$("#cm-form", el)?.addEventListener("submit", async (e) => {
      e.preventDefault(); const f = e.target, body = f.body.value.trim(); if (!body || !p) return;
      kit.ctx.busy(f.querySelector("button"), true, "");
      try { await api.addComment(id, p.club_id, body); store.invalidate(`comments:${id}`, "meta:c:"); } catch (err) { kit.toast(err.message, "error"); kit.ctx.busy(f.querySelector("button"), false); }
    });
    kit.$$("[data-cdel]", el).forEach((b) => b.addEventListener("click", async () => { try { await api.deleteComment(b.dataset.cdel); store.invalidate(`comments:${id}`, "meta:c:"); } catch (err) { kit.toast(err.message, "error"); } }));
    kit.$$("[data-chide]", el).forEach((b) => b.addEventListener("click", async () => { try { await api.hideComment(b.dataset.chide, b.dataset.h === "1"); store.invalidate(`comments:${id}`); } catch (err) { kit.toast(err.message, "error"); } }));
    kit.$("#cm-report", el)?.addEventListener("click", () => report(p));
  };

  function report(p) {
    if (!p || !kit.me()) return kit.toast("Sign in to report", "info");
    ui.sheet("Report this post", `<form id="rp-form" class="stack"><p class="small muted">The EWUdiots team reviews reports. The club isn't told who reported.</p>
      ${ui.field("What's wrong?", ui.select("reason", ["Spam or scam", "Harassment or hate", "Fake or misleading", "Personal information", "Something else"]))}<div id="cl-err"></div><button class="btn primary block">${icon("flag")} Send report</button></form>`, (m) => {
      kit.$("#rp-form", m).addEventListener("submit", async (e) => {
        e.preventDefault();
        try { await api.report(p.club_id, "post", p.id, e.target.reason.value); kit.ctx.closeModal(); kit.toast("Thanks. We'll take a look.", "success"); } catch (err) { ui.fail(m, err.message); }
      });
    });
  }

  return { card, meta, bind, page, row, bindRows };
}
