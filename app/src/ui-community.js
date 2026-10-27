/* News (official EWU news + EWUdiots team posts) and Alumni ("where are they now": EWU newsletter success stories
   + profiles alumni submit and an admin approves). */
const NEWS_CACHE = "ewudiots.news";
const SECTOR_TONE = { Pharma: "teal", Banking: "blue", Technology: "purple", Fintech: "purple", "Higher study": "green", Academia: "green", "NGO / Development": "orange", Telecom: "blue", FMCG: "yellow", Healthcare: "teal", Conglomerate: "orange" };

export function install(ctx) {
  const { pages, icon, esc, $, $$, toast, openModal, closeModal, modalHead, busy } = ctx;
  const S = () => ctx.S;
  const API = (ctx.native.isNative ? ctx.SITE : "") + "/api/news";
  const fmt = (d) => (d ? new Date(d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

  /* ═════════════ NEWS ═════════════ */
  let feed = (() => { try { return JSON.parse(localStorage.getItem(NEWS_CACHE)) || null; } catch { return null; } })();
  let loading = null, error = "", nTag = "All", nQ = "", failedAt = 0;
  async function refresh(force = false) {
    if (loading) return loading;
    if (!force && ((feed && Date.now() - feed.at < 60 * 60e3) || Date.now() - failedAt < 60e3)) return feed; // fresh, or failed < 1 min ago
    loading = (async () => {
      try {
        const r = await fetch(API, { cache: "no-cache" });
        const j = /json/.test(r.headers.get("content-type") || "") ? await r.json() : {};
        if (!r.ok || !Array.isArray(j.news)) throw new Error(j.error || `News unavailable (${r.status})`);
        feed = { at: Date.now(), news: j.news }; error = ""; failedAt = 0;
        try { localStorage.setItem(NEWS_CACHE, JSON.stringify(feed)); } catch { /* storage full */ }
      } catch (e) { error = navigator.onLine ? e.message : "You're offline. Showing saved news."; failedAt = Date.now(); }
      finally { loading = null; }
      if (["news", "home"].includes(ctx.route()) && (!failedAt || ctx.route() === "news")) ctx.rerender();
      return feed;
    })();
    return loading;
  }
  // Team posts (admin panel) first, then EWU's own news.
  const allNews = () => [
    ...ctx.content.posts("news").map((p) => ({ id: `team-${p.id}`, title: p.title, excerpt: p.body.slice(0, 220), image: p.image_url, url: p.link, date: (p.starts_at || p.created_at || "").slice(0, 10), tag: p.tag || "EWUdiots", team: true, pinned: p.pinned })),
    ...(feed?.news || [])
  ];
  const card = (n, i) => `<article class="news-card fx-rise" style="--i:${i}">
      ${n.image ? `<div class="nc-img"><img src="${esc(n.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>` : `<div class="nc-img none">${icon("globe")}</div>`}
      <div class="nc-body"><div class="row" style="gap:6px">${n.team ? '<span class="pill purple">EWUdiots</span>' : `<span class="pill">${esc(n.tag)}</span>`}${n.pinned ? `<span class="pill amber">${icon("pin", "sm")} Pinned</span>` : ""}<span class="xs">${fmt(n.date)}</span></div>
        <h3>${esc(n.title)}</h3>${n.excerpt ? `<p class="small muted">${esc(n.excerpt)}</p>` : ""}
        ${n.url ? `<a class="lnk" href="${esc(n.url)}" target="_blank" rel="noopener">Read more ${icon("external", "sm")}</a>` : ""}</div></article>`;
  pages.news = () => {
    refresh();
    const all = allNews(), tags = ["All", ...new Set(all.map((n) => (n.team ? "EWUdiots" : n.tag)))], q = nQ.trim().toLowerCase();
    const list = all.filter((n) => (nTag === "All" || (n.team ? "EWUdiots" : n.tag) === nTag) && (!q || `${n.title} ${n.excerpt}`.toLowerCase().includes(q)));
    const [lead, ...rest] = list;
    return `${ctx.head("Campus News", "What's happening at East West University, straight from ewubd.edu.", `<button class="icon-btn" id="nw-refresh" aria-label="Refresh">${icon("sync")}</button>`)}
      ${error ? `<div class="alert amber" style="margin-bottom:12px"><span class="a-ic">${icon("wifioff")}</span><div class="grow"><b>Couldn't refresh</b><p>${esc(error)}</p></div></div>` : ""}
      <div class="searchbar">${icon("search")}<input class="input" id="nw-q" type="search" placeholder="Search news" value="${esc(nQ)}" aria-label="Search news"></div>
      ${tags.length > 2 ? `<div class="seg mt">${tags.map((t) => `<button data-ntag="${esc(t)}" aria-selected="${nTag === t}">${esc(t)}</button>`).join("")}</div>` : ""}
      ${!feed && !all.length ? `<div class="news-grid mt">${[1, 2, 3].map(() => '<div class="skel" style="height:300px"></div>').join("")}</div>`
        : lead ? `<article class="news-lead mt fx-rise">${lead.image ? `<img src="${esc(lead.image)}" alt="" referrerpolicy="no-referrer">` : ""}<div class="nl-body"><span class="pill ${lead.team ? "purple" : "white"}">${esc(lead.team ? "EWUdiots" : lead.tag)}</span><h2>${esc(lead.title)}</h2>${lead.excerpt ? `<p>${esc(lead.excerpt)}</p>` : ""}<div class="row"><span class="xs">${fmt(lead.date)}</span>${lead.url ? `<a class="btn white sm" href="${esc(lead.url)}" target="_blank" rel="noopener">Read the story ${icon("external", "sm")}</a>` : ""}</div></div></article>
          <div class="news-grid mt">${rest.map(card).join("")}</div>`
        : `<div class="card mt">${ctx.empty("icon:search", "No news matches", "Try another topic or search.")}</div>`}
      <p class="xs mt">From <a href="https://www.ewubd.edu/news" target="_blank" rel="noopener">ewubd.edu/news</a>${feed ? ` · checked ${new Date(feed.at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}` : ""}. Photos and stories belong to East West University.</p>`;
  };
  pages.news.mount = (el) => {
    $$("[data-ntag]", el).forEach((b) => b.addEventListener("click", () => { nTag = b.dataset.ntag; ctx.rerender(); }));
    $("#nw-refresh", el).addEventListener("click", async () => { await refresh(true); if (!error) toast("News updated", "info"); });
    const q = $("#nw-q", el); let t; q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { nQ = q.value; ctx.rerender(); const n = $("#nw-q"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200); });
  };
  const homeNews = () => { if (!ctx.content.feature("news")) return ""; refresh(); const top = allNews().slice(0, 6); if (!top.length) return "";
    return `<section class="mt"><div class="section-h"><h2>Campus News</h2><a class="see" href="#/news">See all</a></div><div class="hscroll news-strip">${top.map((n) => `<a class="news-mini" href="${esc(n.url || "#/news")}" ${n.url ? 'target="_blank" rel="noopener"' : ""}>${n.image ? `<img src="${esc(n.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="nm-ph">${icon("globe")}</span>`}<b>${esc(n.title)}</b><span class="xs">${fmt(n.date)}</span></a>`).join("")}</div></section>`; };

  /* ═════════════ ALUMNI ═════════════ */
  let alum = null, alumP = null, aQ = "", aSector = "All", aCountry = "All", aKind = "All", aShow = 30;
  const loadAlumni = () => (alumP = alumP || fetch("/data/alumni.json").then((r) => r.json()).catch(() => ({ alumni: [], issues: {}, fields: [] }))
    .then((j) => { alum = j; if (ctx.route() === "alumni") ctx.rerender(); }));
  const people = () => {
    if (!alum) return [];
    const F = alum.fields || [];
    const fromNewsletter = (alum.alumni || []).map((row) => { const o = Object.fromEntries(F.map((k, i) => [k, row[i]])); return { ...o, source: alum.issues[o.issue] }; });
    const fromApp = ctx.content.data.alumni.map((a) => ({ name: a.name, role: a.role, org: a.org, country: a.country || "Bangladesh", dept: a.dept, sector: a.sector || "Other", kind: "job", note: [a.grad_year && `Class of ${a.grad_year}`, a.note].filter(Boolean).join(" · "), linkedin: a.linkedin, verified: true }));
    return [...fromApp, ...fromNewsletter];
  };
  pages.alumni = () => {
    loadAlumni();
    if (!alum) return `${ctx.head("Alumni", "Where EWU graduates are now.")}<div class="grid g3 mt">${[1, 2, 3, 4, 5, 6].map(() => '<div class="skel" style="height:150px"></div>').join("")}</div>`;
    const all = people(), q = aQ.trim().toLowerCase();
    const count = (k) => Object.entries(all.reduce((m, p) => ((m[p[k] || "Other"] = (m[p[k] || "Other"] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
    const countries = count("country"), sectors = count("sector"), orgs = count("org").filter(([, n]) => n > 1).slice(0, 6);
    const list = all.filter((p) => (aSector === "All" || p.sector === aSector) && (aCountry === "All" || p.country === aCountry) && (aKind === "All" || p.kind === aKind) && (!q || `${p.name} ${p.role} ${p.org} ${p.dept} ${p.country}`.toLowerCase().includes(q)));
    const abroad = all.filter((p) => p.country && p.country !== "Bangladesh").length, max = countries[0]?.[1] || 1;
    return `${ctx.head("Alumni", "Where EWU graduates are now: jobs, research and higher study around the world.", "", ctx.art("mascot-thumbs", "Future you?"))}
      <div class="stat-row fx-rise"><div><b class="count" data-to="${all.length}">${all.length}</b><span>alumni stories</span></div><div><b class="count" data-to="${countries.length}">${countries.length}</b><span>countries</span></div><div><b class="count" data-to="${abroad}">${abroad}</b><span>working or studying abroad</span></div><div><b class="count" data-to="${new Set(all.map((p) => p.org)).size}">${new Set(all.map((p) => p.org)).size}</b><span>organisations</span></div></div>
      <div class="split mt" style="align-items:start">
        <section class="card fx-rise" style="--i:1"><h3>${icon("globe", "sm")} Where they are</h3><div class="mt-s">${countries.slice(0, 8).map(([c, n]) => `<button class="geo-row${aCountry === c ? " on" : ""}" data-country="${esc(c)}"><span class="grow">${esc(c)}</span><span class="geo-bar"><i style="width:${Math.max(6, (n / max) * 100)}%"></i></span><b>${n}</b></button>`).join("")}</div></section>
        <section class="card fx-rise" style="--i:2"><h3>${icon("briefcase", "sm")} Top employers</h3><div class="mt-s">${orgs.map(([o, n]) => `<button class="lrow" data-org="${esc(o)}" style="min-height:44px"><span class="itile sm purple">${icon("building")}</span><span class="body"><b>${esc(o)}</b></span><span class="pill">${n} alumni</span></button>`).join("")}</div></section>
      </div>
      <div class="row nowrap mt"><div class="searchbar grow">${icon("search")}<input class="input" id="al-q" type="search" placeholder="Search name, company, university, department" value="${esc(aQ)}" aria-label="Search alumni"></div><button class="btn primary" id="al-add">${icon("plus")} <span class="d-only">Add yourself</span></button></div>
      <div class="seg mt">${["All", ...sectors.map(([s]) => s)].slice(0, 12).map((s) => `<button data-sector="${esc(s)}" aria-selected="${aSector === s}">${esc(s)}</button>`).join("")}</div>
      <div class="row mt-s" style="gap:6px">${[["All", "Everyone"], ["job", "Working"], ["study", "Higher study"], ["award", "Awards"]].map(([v, l]) => `<button class="chip" data-kind="${v}" aria-pressed="${aKind === v}">${l}</button>`).join("")}${aCountry !== "All" ? `<button class="chip" id="al-cx" aria-pressed="true">${esc(aCountry)} ${icon("x", "sm")}</button>` : ""}</div>
      ${list.length ? `<div class="alum-grid mt">${list.slice(0, aShow).map((p, i) => `<article class="alum fx-rise" style="--i:${i % 12}">
          <div class="row nowrap"><span class="avatar" style="background:${ctx.colorFor(p.name)}">${esc(ctx.initials(p.name))}</span><div class="min0 grow"><b class="ellipsis" style="display:block">${esc(p.name)}</b><span class="xs">${esc([p.dept, p.kind === "study" ? "Higher study" : p.kind === "award" ? "Award" : ""].filter(Boolean).join(" · ") || "EWU alumni")}</span></div>${p.verified ? `<span class="pill green" title="Submitted by the alumnus and approved">${icon("checkc", "sm")}</span>` : ""}</div>
          <p class="al-role">${esc(p.role)}</p><p class="al-org">${icon("building", "sm")} ${esc(p.org)}</p><p class="xs">${icon("pin", "sm")} ${esc(p.country || "")}</p>
          ${p.note ? `<p class="small muted mt-s">${esc(p.note)}</p>` : ""}
          <div class="row mt-s" style="gap:8px">${p.source ? `<a class="xs" href="${esc(p.source.url)}" target="_blank" rel="noopener">${icon("file", "sm")} ${esc(p.source.title)}</a>` : ""}${p.linkedin ? `<a class="xs" href="${esc(p.linkedin)}" target="_blank" rel="noopener">${icon("external", "sm")} LinkedIn</a>` : ""}</div></article>`).join("")}</div>
        ${list.length > aShow ? `<button class="btn outline block mt" id="al-more">Show more (${list.length - aShow} left)</button>` : ""}`
        : `<div class="card mt">${ctx.empty("icon:search", "No alumni match", "Try another filter or search.")}</div>`}
      <p class="xs mt">From the Alumni Success Stories in EWU newsletters, plus profiles alumni add themselves (checked by the EWUdiots team). Want yours changed or removed? <a href="mailto:civicframe01@gmail.com?subject=Alumni%20listing">Email us</a>.</p>`;
  };
  pages.alumni.mount = (el) => {
    const set = (fn) => () => { fn(); aShow = 30; ctx.rerender(); };
    $$("[data-sector]", el).forEach((b) => b.addEventListener("click", set(() => { aSector = b.dataset.sector; })));
    $$("[data-kind]", el).forEach((b) => b.addEventListener("click", set(() => { aKind = b.dataset.kind; })));
    $$("[data-country]", el).forEach((b) => b.addEventListener("click", set(() => { aCountry = aCountry === b.dataset.country ? "All" : b.dataset.country; })));
    $$("[data-org]", el).forEach((b) => b.addEventListener("click", set(() => { aQ = b.dataset.org; })));
    $("#al-cx", el)?.addEventListener("click", set(() => { aCountry = "All"; }));
    $("#al-more", el)?.addEventListener("click", () => { aShow += 30; ctx.rerender(); });
    $("#al-add", el)?.addEventListener("click", addYourself);
    const q = $("#al-q", el); if (q) { let t; q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { aQ = q.value; aShow = 30; ctx.rerender(); const n = $("#al-q"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200); }); }
    ctx.countUp(el);
  };
  function addYourself() {
    if (!ctx.cloud.enabled) return toast("Alumni profiles need the EWUdiots server", "info", "This build works offline only.");
    if (!ctx.C.user) return ctx.confirmModal("Sign in to add your profile", "Only verified EWU accounts can add an alumni profile. Sign in with your EWU email first.", "Sign in", () => ctx.go("#/login?from=profile"), false, "lock");
    if (!ctx.content.feature("alumni_submissions")) return toast("New alumni profiles are paused", "info", "Please try again later.");
    const p = S().profile || {};
    openModal(modalHead("Add yourself to Alumni") + `<form id="al-form" class="grid g2">
      <label class="field full-row">Full name<input class="input" name="name" required minlength="2" maxlength="80" value="${esc(p.name || "")}"></label>
      <label class="field">Job title or programme<input class="input" name="role" required minlength="2" maxlength="120" placeholder="Software Engineer · MSc in Data Science"></label>
      <label class="field">Organisation or university<input class="input" name="org" required minlength="2" maxlength="120" placeholder="Company / university"></label>
      <label class="field">Country<input class="input" name="country" value="Bangladesh" maxlength="60"></label>
      <label class="field">Graduation year<input class="input" name="grad_year" inputmode="numeric" pattern="\\d{4}" placeholder="2024"></label>
      <label class="field">Department<input class="input" name="dept" value="${esc(p.department || "")}" maxlength="60"></label>
      <label class="field">Sector<select class="select" name="sector">${["Technology", "Banking", "Fintech", "Pharma", "Higher study", "Academia", "NGO / Development", "Telecom", "FMCG", "Healthcare", "Government", "Entrepreneur", "Other"].map((s) => `<option>${s}</option>`).join("")}</select></label>
      <label class="field full-row">One line about your journey (optional)<input class="input" name="note" maxlength="280"></label>
      <label class="field full-row">LinkedIn (optional)<input class="input" name="linkedin" type="url" placeholder="https://www.linkedin.com/in/…" pattern="https://(www\\.)?linkedin\\.com/.*"></label>
      <p class="xs full-row">Your profile appears after the EWUdiots team checks it. Only what you type here is shown.</p>
      <div class="row full-row"><button type="button" class="btn neutral grow" data-close>Cancel</button><button class="btn primary grow">${icon("check")} Submit</button></div></form>`, (m) => {
      $("#al-form", m).addEventListener("submit", async (e) => {
        e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), btn = e.target.querySelector("button.primary");
        busy(btn, true, "Submitting…");
        try { await ctx.cloud.submitAlumni({ ...f, grad_year: f.grad_year ? Number(f.grad_year) : null }); closeModal(); toast("Thanks! Your profile is waiting for review", "success", "It shows up here once it's approved."); }
        catch (err) { busy(btn, false); toast("Couldn't submit", "error", err.message); }
      });
    });
  }
  return { homeNews, refreshNews: refresh };
}
