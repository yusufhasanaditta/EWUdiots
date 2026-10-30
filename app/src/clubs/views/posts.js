/* Post card + reactions + comments, shared by the feed, club profiles and the members' space. */

const KIND = { news: ["megaphone", "News"], announcement: ["bell", "Announcement"], achievement: ["trophy", "Achievement"], recruitment: ["userpen", "Recruiting"] };

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
    const club = p.clubs, [ic, label] = KIND[p.kind] || KIND.news, re = r[p.id] || { n: 0, mine: null };
    const long = p.body.length > 360;
    return `<article class="card cl-post" data-post="${p.id}">
      <header class="row nowrap" style="gap:10px">
        ${showClub && club ? `<a href="#/club/c?slug=${encodeURIComponent(club.slug)}" class="row nowrap min0" style="gap:10px">${ui.logo(club, "sm")}<span class="min0"><b class="ellipsis" style="display:block">${esc(club.name)}${ui.verified(club)}</b><span class="xs">${ui.ago(p.created_at)}</span></span></a>`
          : `<span class="itile sm purple">${icon(ic)}</span><span class="min0"><b style="display:block">${esc(p.author_name || "Club")}</b><span class="xs">${ui.ago(p.created_at)}</span></span>`}
        <span class="push row nowrap" style="gap:6px">${p.pinned ? ui.pill(`${icon("pin", "sm")} Pinned`, "purple") : ""}${p.status === "draft" ? ui.pill("Draft", "amber") : ""}${ui.audiencePill(p.visibility, p.wing)}</span></header>
      <a class="cl-post-body" href="#/club/post?id=${p.id}">
        <span class="pill cl-kind">${icon(ic, "sm")} ${label}</span>
        <h3>${esc(p.title)}</h3>
        ${p.body ? `<p class="${long ? "clamp" : ""}">${ui.rich(long ? p.body.slice(0, 360) + "…" : p.body)}</p>` : ""}
        ${p.images?.length ? `<div class="cl-imgs n${Math.min(p.images.length, 3)}">${p.images.slice(0, 3).map((u) => `<img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer">`).join("")}</div>` : ""}</a>
      ${p.link ? `<a class="btn sm outline" href="${esc(p.link)}" ${p.link.startsWith("https://") ? 'target="_blank" rel="noopener noreferrer"' : ""}>${icon(p.link.startsWith("#/club/form") ? "edit" : "external", "sm")} ${p.link.startsWith("#/club/form") ? "Open the form" : "Open link"}</a>` : ""}
      <footer class="cl-post-foot">
        <button class="cl-react ${re.mine ? "on" : ""}" data-react="${p.id}" aria-pressed="${!!re.mine}" ${kit.me() ? "" : "disabled"}>${icon("heart", "sm")} <span>${re.n || ""}</span><span class="sr-only">likes</span></button>
        <a class="cl-react" href="#/club/post?id=${p.id}">${icon("notes", "sm")} <span>${c[p.id] || ""}</span><span class="sr-only">comments</span></a>
        <button class="cl-react push" data-share="${p.id}" aria-label="Share">${icon("share", "sm")}</button></footer></article>`;
  }

  /** Wire up like and share buttons inside el. */
  function bind(el) {
    kit.$$("[data-react]", el).forEach((b) => b.addEventListener("click", async (e) => {
      e.preventDefault(); const id = b.dataset.react, on = b.getAttribute("aria-pressed") === "true";
      // Optimistic: flip now, then save.
      const n = b.querySelector("span"); b.classList.toggle("on", !on); b.setAttribute("aria-pressed", String(!on)); n.textContent = String(Math.max(0, (Number(n.textContent) || 0) + (on ? -1 : 1)) || "");
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
    return kit.back("#/club/feed", "Feed") + ui.view(pe, (p) => {
      if (!p) return ui.emptyBox("lock", "You can't see this post", "It may be for club members only, or it was removed.");
      const m = meta([p]), ce = store.use(`comments:${id}`, () => api.comments(id), { ttl: 20e3 });
      const mod = kit.can(p.club_id, "comments.moderate");
      return `${card(p, m)}
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
    bind(el); kit.bindRetry(el);
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

  return { card, meta, bind, page };
}
