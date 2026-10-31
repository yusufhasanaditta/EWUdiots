/* Club profile (#/club/c?slug=…&tab=…): the club's public portfolio. About · Posts · Events · Committee · History ·
   Gallery, with Follow / Join / Apply and, for members, the way into the members' space and the Manage console.
   Clubs nobody runs here yet show their official link and "I run this club" (a claim the EWUdiots team verifies). */
import { createPosts } from "./posts.js";
import { CATEGORIES, JOIN_MODES } from "../perms.js";

const TABS = [["about", "Overview"], ["committee", "Executives"], ["events", "Events"], ["posts", "Posts"], ["gallery", "Gallery"], ["history", "Achievements"]];
const SOCIAL = { facebook: ["Facebook", "globe"], instagram: ["Instagram", "image"], linkedin: ["LinkedIn", "linkedin"], youtube: ["YouTube", "play"], website: ["Website", "external"] };

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store } = kit;
  const posts = createPosts(kit);
  const slug = () => kit.param("slug") || "";
  const tab = () => (TABS.some(([t]) => t === kit.param("tab")) ? kit.param("tab") : "about");
  const clubEntry = () => store.use(`club:${slug()}`, () => api.club(slug()), { ttl: 2 * 60e3 });

  pages["club/c"] = () => {
    if (!api) return kit.gate("this club");
    return kit.back("#/club/explore", "All clubs") + ui.view(clubEntry(), (club) => (club ? render(club) : ui.emptyBox("search", "Club not found", "It may have moved. Find it in Explore.", `<a class="btn primary" href="#/club/explore">Explore clubs</a>`)), { n: 2, h: 160 });
  };

  // Sections the president hid from visitors (Manage → Settings). Members and the EWUdiots team always see everything.
  const hidden = (club, key) => club.public_sections?.[key] === false && !kit.membership(club.id) && !kit.isPlatform();
  const PILLARS = [["book", "purple", "Learn", "Skills through workshops"], ["zap", "green", "Build", "Hands-on projects"], ["users", "blue", "Collaborate", "Peers and industry"], ["trend", "orange", "Grow", "Opportunities ahead"]];

  function render(club) {
    const counts = store.use("clubs:counts", api.counts, { ttl: 60e3 }).value?.[club.id] || { members: 0, followers: 0 };
    const m = kit.membership(club.id), live = club.status === "active";
    const follows = kit.me() ? store.use("me:follows", api.follows).value || [] : [];
    const req = kit.me() ? (store.use("me:requests", api.myRequests).value || []).find((r) => r.club_id === club.id && r.status === "pending") : null;
    const memberForm = (store.use("forms:open", api.openForms).value || []).find((f) => f.club_id === club.id && f.kind === "membership");
    const evs = live ? store.use(`club:events:${club.id}`, () => api.clubEvents(club.id), { ttl: 60e3 }).value || [] : [];
    const wins = live ? (store.use(`club:milestones:${club.id}`, () => api.milestones(club.id)).value || []).filter((x) => x.kind === "award") : [];
    const t = tab(), href = (v) => `#/club/c?slug=${encodeURIComponent(club.slug)}&tab=${v}`;
    const stats = [["users", "purple", counts.members, "Members"], ["calendar", "blue", evs.length, "Events"], ["bell", "pink", counts.followers, "Followers"], ["trophy", "orange", wins.length, "Achievements"]];
    return `<section class="cp-hero" style="--cc:${esc(club.color)}">${club.cover_url ? `<img src="${esc(club.cover_url)}" alt="" referrerpolicy="no-referrer">` : `<span class="cp-hero-art" aria-hidden="true"></span>`}<span class="cl-cover-fade"></span>
        <button class="cp-share" id="cp-share" type="button" aria-label="Share this club">${icon("share", "sm")}</button></section>
      <section class="cp-id">${ui.logo(club, "xl")}
        <div class="grow min0"><h1>${esc(club.name)}${ui.verified(club)}</h1>
          <p class="cp-cats">${[CATEGORIES[club.category] || "Club", club.founded_year && `Since ${club.founded_year}`, club.recruiting && "Recruiting"].filter(Boolean).map(esc).join('<i aria-hidden="true">·</i>')}</p></div></section>
      ${club.tagline ? `<p class="cp-tag">${esc(club.tagline)}</p>` : ""}
      ${live ? `<div class="cp-stats">${stats.map(([ic, tone, v, l]) => `<div class="cp-stat ${tone}">${icon(ic)}<b>${v}</b><span>${l}</span></div>`).join("")}</div>` : unclaimed(club)}
      ${live ? `<div class="cp-dock">${actions(club, m, follows.includes(club.id), req, memberForm)}</div>` : ""}
      <nav class="cp-tabs" role="tablist">${TABS.filter(([v]) => v === "about" || !hidden(club, v)).map(([v, l]) => `<a role="tab" href="${href(v)}" aria-selected="${t === v}">${l}</a>`).join("")}</nav>
      <div class="cp-body fx-rise">${hidden(club, t) && t !== "about" ? ui.emptyBox("lock", "Members only", "The club shows this to its members.") : body(club, t)}</div>`;
  }

  function actions(club, m, following, req, memberForm) {
    if (club.status !== "active") return "";
    const out = [];
    if (m) {
      out.push(`<a class="btn primary" href="#/club/space?c=${club.id}">${icon("community")} Members' space</a>`);
      if (kit.canManage(club.id)) out.push(`<a class="btn outline" href="#/club/manage?c=${club.id}">${icon("settings")} Manage</a>`);
    } else if (req) out.push(`<button class="btn neutral" id="cp-cancel" data-req="${req.id}">${icon("clock")} Request sent · Cancel</button>`);
    else if (memberForm) out.push(`<a class="btn primary" href="#/club/form?id=${memberForm.id}">${icon("userpen")} Apply to join</a>`);
    else if (club.join_mode === "open") out.push(`<button class="btn primary" id="cp-join">${icon("plus")} Join</button>`);
    else if (club.join_mode === "apply") out.push(`<button class="btn primary" id="cp-join">${icon("userpen")} Ask to join</button>`);
    else out.push(`<span class="pill">${icon("lock", "sm")} ${JOIN_MODES.invite}</span>`);
    out.push(`<button class="btn ${following ? "neutral" : "outline"}" id="cp-follow" aria-pressed="${following}">${icon("bell")} ${following ? "Following" : "Follow"}</button>`);
    return out.join("");
  }

  const unclaimed = (club) => `<section class="card soft mt row nowrap top"><span class="itile orange">${icon("info")}</span><div class="grow">
      <b>${club.status === "pending" ? "Waiting for the EWUdiots team" : "This club isn't run on EWUdiots yet"}</b>
      <p class="small muted">${club.status === "pending" ? "We're checking this club before it goes live." : "Its president can claim it to post news, open registrations and manage members here."}</p>
      <div class="row mt-s" style="gap:8px">${official(club) ? `<a class="btn sm" href="${esc(official(club))}" target="_blank" rel="noopener noreferrer">${icon("external", "sm")} EWU club page (archived)</a>` : ""}
        ${club.status === "unclaimed" && kit.me() ? `<button class="btn sm primary" id="cp-claim">${icon("crown", "sm")} I run this club</button>` : ""}</div></div></section>`;

  function body(club, t) {
    if (t === "about") return about(club);
    if (t === "posts") {
      const pe = store.use(`club:posts:${club.id}`, () => api.clubPosts(club.id), { ttl: 45e3 });
      return ui.view(pe, (rows) => { if (!rows.length) return ui.emptyBox("megaphone", "No posts yet", ""); const mt = posts.meta(rows); return `<div class="stack">${rows.map((p) => posts.card(p, mt, { showClub: false })).join("")}</div>`; });
    }
    if (t === "events") {
      const ee = store.use(`club:events:${club.id}`, () => api.clubEvents(club.id), { ttl: 60e3 });
      return ui.view(ee, (rows) => {
        const now = Date.now(), up = rows.filter((e) => new Date(e.ends_at || e.starts_at) >= now).reverse(), past = rows.filter((e) => new Date(e.ends_at || e.starts_at) < now);
        if (!rows.length) return ui.emptyBox("calendar", "No events yet", "");
        return `${up.length ? `<h2 class="cl-h2">Upcoming</h2><div class="stack">${up.map(eventRow).join("")}</div>` : ""}${past.length ? `<h2 class="cl-h2">Past</h2><div class="stack">${past.slice(0, 20).map(eventRow).join("")}</div>` : ""}`;
      });
    }
    if (t === "committee") {
      // Present committee, previous committees and event committees (past terms labelled "Event · …").
      const sub = ["present", "previous", "event"].includes(kit.param("sub")) ? kit.param("sub") : "present";
      const seg = ui.seg([["present", "Present"], ["previous", "Previous"], ["event", "Event teams"]], sub, (v) => `#/club/c?slug=${encodeURIComponent(club.slug)}&tab=committee&sub=${v}`);
      if (sub === "present") {
        const ce = store.use(`club:committee:${club.id}`, () => api.committee(club.id));
        return seg + ui.view(ce, (rows) => (rows.length ? `<div class="cp-execs mt">${rows.map((p, i) => execCard(p, i)).join("")}</div>${moderators(club)}`
          : ui.emptyBox("users", "Committee not listed yet", club.advisors ? `Faculty moderator: ${esc(club.advisors)}` : "") + moderators(club)), { n: 4, h: 180 });
      }
      const te = store.use(`club:terms:${club.id}`, () => api.terms(club.id));
      return seg + ui.view(te, (terms) => {
        const list = terms.filter((x) => (sub === "event") === /^event\b/i.test(x.label));
        return list.length ? `<div class="stack mt">${list.map((x) => `<details class="card tight cp-term"><summary><span class="itile sm ${sub === "event" ? "teal" : "purple"}">${icon(sub === "event" ? "calendar" : "award")}</span><b class="grow">${esc(x.label.replace(/^event\s*[·:-]\s*/i, ""))}</b><span class="xs">${ui.plural(x.committee.length, "person", "people")}</span></summary>
            <div class="cp-execs mini mt-s">${x.committee.map((p) => `<div class="cp-exec">${ui.ava(p.name, "", "lg")}<b>${esc(p.name)}</b><span class="xs">${esc(p.title || p.role)}</span></div>`).join("")}</div></details>`).join("")}</div>`
          : ui.emptyBox(sub === "event" ? "calendar" : "clock", sub === "event" ? "No event teams yet" : "No previous committees yet", "The club admin adds them in Executive Committee → Previous.");
      });
    }
    if (t === "history") {
      const me = store.use(`club:milestones:${club.id}`, () => api.milestones(club.id)), te = store.use(`club:terms:${club.id}`, () => api.terms(club.id));
      return ui.view(me, (ms) => `${ms.length ? `<div class="cl-timeline">${ms.map((x) => `<div class="cl-tl-item"><span class="cl-tl-year">${x.year}</span><div class="card tight"><b>${x.kind === "award" ? `${icon("trophy", "sm")} ` : ""}${esc(x.title)}</b>${x.body ? `<p class="small muted">${ui.rich(x.body)}</p>` : ""}${x.image ? `<img class="cl-tl-img" src="${esc(x.image)}" alt="" loading="lazy">` : ""}</div></div>`).join("")}</div>` : ""}
        ${ui.view(te, (terms) => (terms.length ? `<h2 class="cl-h2">Past committees</h2><div class="stack">${terms.map((x) => `<details class="card tight"><summary><b>${esc(x.label)}</b> <span class="xs">${ui.plural(x.committee.length, "person", "people")}</span></summary><div class="mt-s">${x.committee.map((p) => ui.person(p.name, esc(p.title || p.role))).join("")}</div></details>`).join("")}</div>` : !ms.length ? ui.emptyBox("clock", "No history yet", "The club adds milestones, awards and past committees here.") : ""))}`);
    }
    const ge = store.use(`club:media:${club.id}`, () => api.media(club.id));
    return ui.view(ge, (rows) => {
      if (!rows.length) return ui.emptyBox("image", "No photos yet", "");
      const albums = [...new Set(rows.map((r) => r.album))];
      return albums.map((a) => `<h2 class="cl-h2">${esc(a)}</h2><div class="cl-gallery">${rows.filter((r) => r.album === a).map((r) => `<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer"><img src="${esc(r.url)}" alt="${esc(r.caption)}" loading="lazy"></a>`).join("")}</div>`).join("");
    }, { n: 1, h: 220 });
  }

  /** clubs.ewubd.edu went offline in 2026; the Internet Archive copy is the official page now. */
  const official = (club) => club.ewu_info?.about_source || (club.official_url ? `https://web.archive.org/web/2026/${club.official_url.replace(/^http:/, "https:")}` : "");
  /** Faculty moderators imported from the EWU club site (names, designations and photos are public EWU faculty data). */
  const moderators = (club) => {
    const list = club.ewu_info?.moderators || [];
    if (!list.length) return "";
    return `<section class="card mt"><h2>Faculty Moderators</h2><div class="cl-list mt-s" style="border:0;box-shadow:none">${list.map((m) => `<${m.profile ? `a href="${esc(m.profile)}" target="_blank" rel="noopener noreferrer"` : "div"} class="cl-li" style="padding:10px 0">${ui.ava(m.name, m.photo, "lg")}
      <span class="body"><b>${esc(m.name)}</b><span>${esc([m.designation, m.department].filter(Boolean).join(", "))}</span>${m.tenure ? `<span class="xs">Moderator ${esc(m.tenure)}</span>` : ""}</span>${m.profile ? icon("external", "sm") : ""}</${m.profile ? "a" : "div"}>`).join("")}</div></section>`;
  };
  const ROLE_IC = [[/president|chair/i, "crown"], [/vice/i, "star"], [/secretary/i, "edit"], [/treasur|financ/i, "wallet"], [/tech|it\b|dev/i, "zap"], [/event|program/i, "calendar"], [/media|design|pr\b|public/i, "megaphone"], [/moderat|advis|faculty/i, "cap"]];
  const roleIcon = (title) => (ROLE_IC.find(([re]) => re.test(title || "")) || [0, "award"])[1];
  const execCard = (p, i) => `<button type="button" class="cp-exec" data-person="${i}">${ui.ava(p.display_name, p.photo_url, "xl")}
      <b>${esc(p.display_name)}</b><span class="cp-role">${icon(roleIcon(p.title || p.role_name), "sm")}${esc(p.title || p.role_name)}</span>${p.department ? `<span class="xs">${esc(p.department)}</span>` : ""}</button>`;
  const about = (club) => {
    if (club.status !== "active") return `${club.source === "ewubd" ? `<div class="alert blue"><span class="a-ic">${icon("info")}</span><div class="grow"><b>From the EWU club site</b><p>Public information from EWU's club website (archived ${esc(club.ewu_info?.fetched || "")}). The club hasn't joined EWUdiots yet.</p></div></div>` : ""}
      <section class="card mt"><h2>About</h2><p class="mt-s">${club.about ? ui.rich(club.about) : `<span class="muted">No introduction yet.</span>`}</p></section>${moderators(club)}${details(club)}`;
    const now = Date.now(), up = (store.peek(`club:events:${club.id}`) || []).filter((e) => new Date(e.ends_at || e.starts_at) >= now).reverse().slice(0, 2);
    const execs = hidden(club, "committee") ? [] : store.use(`club:committee:${club.id}`, () => api.committee(club.id)).value || [];
    const sp = store.use(`club:sponsorships:${club.id}`, () => api.sponsorships(club.id).catch(() => []), { ttl: 5 * 60e3 }).value || [];
    const link = (v) => `<a class="cp-more" href="#/club/c?slug=${encodeURIComponent(club.slug)}&tab=${v}">See all ${icon("chevR", "sm")}</a>`;
    return `<section class="cp-sec"><div class="cp-sh"><h2>About us</h2></div><p class="cp-about">${club.about ? ui.rich(club.about) : `<span class="muted">The club hasn't written an introduction yet.</span>`}</p>
        ${club.mission ? `<p class="cp-mission">${icon("target", "sm")} ${ui.rich(club.mission)}</p>` : ""}
        <div class="cp-pillars">${PILLARS.map(([ic, tone, h, d]) => `<div class="cp-pillar"><span class="itile sm ${tone}">${icon(ic)}</span><b>${h}</b><span>${d}</span></div>`).join("")}</div></section>
      ${club.wings?.length ? `<section class="cp-sec"><div class="cp-sh"><h2>Our focus areas</h2></div><div class="cp-focus">${club.wings.map((w) => `<span class="cp-chip">${icon("layers", "sm")}${esc(w)}</span>`).join("")}</div></section>` : ""}
      ${up.length && !hidden(club, "events") ? `<section class="cp-sec"><div class="cp-sh"><h2>Upcoming events</h2>${link("events")}</div><div class="cp-evs">${up.map((e) => `<a class="cp-ev" href="#/club/event?id=${e.id}">${e.cover_url ? `<img src="${esc(e.cover_url)}" alt="" loading="lazy">` : ""}<span class="cp-date"><b>${ui.when(e.starts_at, { day: "numeric" })}</b>${ui.when(e.starts_at, { month: "short" })}</span>
          <span class="cp-ev-b"><b>${esc(e.title)}</b><span class="xs">${icon("clock", "sm")} ${ui.dateTime(e.starts_at)}</span>${e.venue ? `<span class="xs">${icon("pin", "sm")} ${esc(e.venue)}</span>` : ""}</span></a>`).join("")}</div></section>` : ""}
      ${execs.length ? `<section class="cp-sec"><div class="cp-sh"><h2>Executive committee</h2>${link("committee")}</div><div class="cp-execs row-scroll">${execs.slice(0, 6).map((p, i) => execCard(p, i)).join("")}</div></section>` : ""}
      ${sp.length ? `<section class="cp-sec"><div class="cp-sh"><h2>Sponsors &amp; partners</h2></div><div class="cp-focus">${sp.filter((x) => x.sponsors).map((x) => `<span class="cp-chip sp">${x.sponsors.logo_url ? `<img src="${esc(x.sponsors.logo_url)}" alt="" loading="lazy">` : icon("briefcase", "sm")}${esc(x.sponsors.name)}</span>`).join("")}</div></section>` : ""}
      ${moderators(club)}${details(club)}`;
  };
  const details = (club) => `<section class="cp-sec"><div class="cp-sh"><h2>Details &amp; contact</h2></div><div class="card tight">
        ${club.advisors ? `<div class="lrow"><span class="itile orange">${icon("cap")}</span><span class="body"><b>Club moderator (faculty)</b><span>${esc(club.advisors)}</span></span></div>` : ""}
        <div class="lrow"><span class="itile purple">${icon("userpen")}</span><span class="body"><b>Membership</b><span>${esc(JOIN_MODES[club.join_mode])}${club.recruiting ? " · recruiting now" : ""}</span></span></div>
        ${club.contact_email ? `<a class="lrow" href="mailto:${esc(club.contact_email)}"><span class="itile blue">${icon("mail")}</span><span class="body"><b>Email</b><span class="ellipsis">${esc(club.contact_email)}</span></span></a>` : ""}
        ${Object.entries(club.socials || {}).filter(([k, v]) => SOCIAL[k] && /^https:\/\//.test(v)).map(([k, v]) => `<a class="lrow" href="${esc(v)}" target="_blank" rel="noopener noreferrer"><span class="itile pink">${icon(SOCIAL[k][1])}</span><span class="body"><b>${SOCIAL[k][0]}</b><span class="ellipsis">${esc(v.replace(/^https:\/\/(www\.)?/, ""))}</span></span></a>`).join("")}
        ${official(club) ? `<a class="lrow" href="${esc(official(club))}" target="_blank" rel="noopener noreferrer"><span class="itile green">${icon("globe")}</span><span class="body"><b>EWU club page (archived)</b><span class="ellipsis">${esc(club.official_url.replace(/^https?:\/\//, ""))}</span></span></a>` : ""}</div></section>`;

  /* An executive's card: photo, position and how to reach them. Members open the full profile (activity, badges). */
  function personSheet(club, p) {
    const soc = Object.entries(p.socials || {}).filter(([, v]) => /^https:\/\//.test(v));
    ui.sheet(p.display_name, `<div class="cp-person">${ui.ava(p.display_name, p.photo_url, "xl")}<span class="cp-role">${icon(roleIcon(p.title || p.role_name), "sm")}${esc(p.title || p.role_name)}</span>
        ${p.department ? `<p class="small muted">${esc(p.department)}${p.wing ? ` · ${esc(p.wing)} wing` : ""}</p>` : ""}
        ${soc.length ? `<div class="row" style="gap:8px;justify-content:center">${soc.map(([k, v]) => `<a class="btn sm outline" href="${esc(v)}" target="_blank" rel="noopener noreferrer">${icon(k === "linkedin" ? "linkedin" : k === "github" ? "github" : "link", "sm")} ${esc(k)}</a>`).join("")}</div>` : ""}
        ${kit.membership(club.id) || kit.isPlatform() ? `<a class="btn primary block" href="#/club/member?c=${club.id}&u=${p.user_id}">${icon("trophy", "sm")} Profile, badges and achievements</a>` : `<p class="xs">Join the club to see members' full profiles and achievements.</p>`}</div>`);
  }

  // Every club event opens its event page (details, registration, add to calendar).
  const eventRow = (e) => `<a class="card cl-event" href="#/club/event?id=${e.id}"><div class="ev-date"><b>${ui.when(e.starts_at, { day: "numeric" })}</b><span>${ui.when(e.starts_at, { month: "short" })}</span></div>
      <div class="grow min0"><b>${esc(e.title)}</b><p class="xs">${ui.dateTime(e.starts_at)}${e.venue ? ` · ${esc(e.venue)}` : ""}</p></div>${e.visibility === "members" ? ui.pill(`${icon("lock", "sm")} Members`, "purple") : ""}${e.form_id ? ui.pill("Registration", "green") : ""}</a>`;

  pages["club/c"].mount = (el) => {
    const club = store.peek(`club:${slug()}`); if (!club) return kit.bindRetry(el);
    posts.bind(el); kit.bindRetry(el);
    kit.$("#cp-follow", el)?.addEventListener("click", async (e) => {
      if (!kit.me()) return kit.go("#/login?from=profile");
      const on = e.currentTarget.getAttribute("aria-pressed") === "true";
      try { await (on ? api.unfollow(club.id) : api.follow(club.id)); store.invalidate("me:follows", "clubs:counts", "feed:"); kit.toast(on ? "Unfollowed" : "Following", "success", on ? "" : "Their posts appear in your feed."); } catch (err) { kit.toast(err.message, "error"); }
    });
    kit.$("#cp-join", el)?.addEventListener("click", () => join(club));
    kit.$("#cp-cancel", el)?.addEventListener("click", async (e) => { try { await api.cancelRequest(e.currentTarget.dataset.req); store.invalidate("me:requests"); } catch (err) { kit.toast(err.message, "error"); } });
    kit.$("#cp-claim", el)?.addEventListener("click", () => claim(club));
    kit.$("#cp-share", el)?.addEventListener("click", () => kit.ctx.native.share({ title: club.name, text: club.tagline || `${club.name} on EWUdiots`, url: location.href }).catch(() => {}));
    kit.$$("[data-person]", el).forEach((b) => b.addEventListener("click", () => { const p = (store.peek(`club:committee:${club.id}`) || [])[Number(b.dataset.person)]; if (p) personSheet(club, p); }));
  };

  function join(club) {
    if (!kit.me()) return kit.go("#/login?from=profile");
    const dept = kit.ctx.S.profile?.department || "";
    if (club.join_mode === "open") {
      return api.join(club.id, dept).then(() => { store.invalidate("me:", "clubs:counts", "club:"); kit.toast(`Welcome to ${club.name}`, "success", "Your members' space is ready."); }, (err) => kit.toast(err.message, "error"));
    }
    ui.sheet(`Ask to join ${club.short_name || club.name}`, `<form id="jn-form" class="stack"><p class="small muted">The club's executives see your name, student ID and department, and accept or decline. You'll get a message in the app.</p>
      ${ui.field("Department", ui.input("dept", dept, 'maxlength="60" placeholder="e.g. CSE"'))}
      ${ui.field("A short note (optional)", ui.area("note", "", 'maxlength="600" rows="3" placeholder="Why you\'d like to join, or what you can help with"'))}
      <div id="cl-err"></div><button class="btn primary block">${icon("arrow")} Send request</button></form>`, (m) => {
      kit.$("#jn-form", m).addEventListener("submit", async (e) => {
        e.preventDefault(); const f = ui.values(e.target), btn = e.target.querySelector("button.primary"); kit.ctx.busy(btn, true, "Sending…");
        try { await api.join(club.id, f.dept, f.note); kit.ctx.closeModal(); store.invalidate("me:"); kit.toast("Request sent", "success", "The club will review it."); }
        catch (err) { kit.ctx.busy(btn, false); ui.fail(m, err.message); }
      });
    });
  }

  function claim(club) {
    ui.sheet(`Claim ${club.short_name || club.name}`, `<form id="cl-form" class="stack"><p class="small muted">Tell us your role. The EWUdiots team checks it (usually with your faculty advisor or the club's page) and then makes you the club's admin on EWUdiots.</p>
      ${ui.field("Your position", ui.input("pos", "", 'required maxlength="60" placeholder="President"'))}
      ${ui.field("How can we confirm it?", ui.area("proof", "", 'maxlength="1000" rows="3" placeholder="Faculty advisor\'s name and email, the club\'s Facebook page…"'))}
      <div id="cl-err"></div><button class="btn primary block">${icon("crown")} Send claim</button></form>`, (m) => {
      kit.$("#cl-form", m).addEventListener("submit", async (e) => {
        e.preventDefault(); const f = ui.values(e.target), btn = e.target.querySelector("button.primary");
        if (String(f.pos).trim().length < 2) return ui.fail(m, "Add your position in the club.");
        kit.ctx.busy(btn, true, "Sending…");
        try { await api.claim(club.id, f.pos.trim(), String(f.proof || "").trim()); kit.ctx.closeModal(); kit.toast("Claim sent", "success", "We'll message you in the app when it's reviewed."); }
        catch (err) { kit.ctx.busy(btn, false); ui.fail(m, err.message); }
      });
    });
  }
}
