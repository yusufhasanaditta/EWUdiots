/* Notice Board: official EWU notices from ewubd.edu (via /api/notices), refreshed automatically.
   New notices get a badge, appear in Notifications and, with reminders on, as a phone/desktop alert. */
const CACHE = "ewudiots.notices";
const POLL = 30 * 60e3;
const CAT_IC = { Exams: ["exam", "purple"], Advising: ["calcheck", "blue"], Payments: ["wallet", "orange"], Scholarships: ["award", "yellow"], Holidays: ["sun", "green"], Admission: ["users", "teal"], Convocation: ["cap", "pink"], Events: ["megaphone", "blue"], General: ["bell", "purple"] };

export function install(ctx) {
  const { pages, icon, esc, $, $$, toast } = ctx;
  const S = () => ctx.S;
  // Native builds load from the device, so they need the website's address for the API.
  const API = (ctx.native.isNative ? import.meta.env.VITE_SITE_URL || "" : "") + "/api/notices";
  let feed = (() => { try { return JSON.parse(localStorage.getItem(CACHE)) || null; } catch { return null; } })(); // { at, notices }
  let loading = null, error = "", tab = "All", q = "", failedAt = 0;
  const seen = () => (S().noticeSeen = S().noticeSeen || { ids: [], since: null });
  const list = () => feed?.notices || [];
  const isNew = (n) => !seen().ids.includes(n.id);

  async function refresh({ force = false } = {}) {
    if (loading) return loading;
    if (!force && ((feed && Date.now() - feed.at < POLL) || Date.now() - failedAt < 60e3)) return feed; // fresh, or failed < 1 min ago
    loading = (async () => {
      try {
        if (ctx.native.isNative && !import.meta.env.VITE_SITE_URL) throw new Error("This build doesn't know the website address yet (VITE_SITE_URL).");
        const r = await fetch(API, { cache: "no-cache" });
        const j = /json/.test(r.headers.get("content-type") || "") ? await r.json() : {};
        if (!r.ok || !Array.isArray(j.notices)) throw new Error(j.error || `Notice board unavailable (${r.status})`);
        const first = !seen().since;
        feed = { at: Date.now(), notices: j.notices };
        try { localStorage.setItem(CACHE, JSON.stringify(feed)); } catch { /* storage full */ }
        error = ""; failedAt = 0;
        // First run: only the 3 newest notices from the last month count as new, so you aren't flooded.
        if (first) { const month = Date.now() - 30 * 864e5, fresh = new Set(j.notices.filter((n) => n.date && new Date(n.date) >= month).slice(0, 3).map((n) => n.id)); seen().ids = j.notices.filter((n) => !fresh.has(n.id)).map((n) => n.id); seen().since = new Date().toISOString(); ctx.save({ silent: true }); }
        else alertNew(j.notices.filter(isNew));
        if (["notices", "home", "notifications"].includes(ctx.route())) ctx.rerender();
      } catch (e) { error = navigator.onLine ? e.message : "You're offline. Showing saved notices."; failedAt = Date.now(); if (ctx.route() === "notices") ctx.rerender(); }
      finally { loading = null; }
      return feed;
    })();
    return loading;
  }
  const alerted = new Set();
  function alertNew(items) {
    const fresh = items.filter((n) => !alerted.has(n.id)); fresh.forEach((n) => alerted.add(n.id));
    if (!fresh.length || !S().settings.notify || !("Notification" in window) || Notification.permission !== "granted") return;
    try { new Notification(fresh.length === 1 ? "New EWU notice" : `${fresh.length} new EWU notices`, { body: fresh[0].title, icon: "/icons/icon-192.png" }); } catch { /* not allowed here */ }
  }
  const markSeen = (ids) => { const s = seen(); const add = ids.filter((id) => !s.ids.includes(id)); if (add.length) { s.ids = [...s.ids, ...add].slice(-400); ctx.save({ silent: true }); } };

  const fmt = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
  const row = (n) => { const [ic, tone] = CAT_IC[n.cat] || CAT_IC.General;
    return `<article class="nb-item${isNew(n) ? " new" : ""}"><span class="itile ${tone}">${icon(ic)}</span><div class="grow min0">
      <div class="row" style="gap:6px">${isNew(n) ? '<span class="pill purple">New</span>' : ""}<span class="xs">${esc(n.cat)} · ${fmt(n.date)}</span></div>
      <a class="nb-title" href="${esc(n.url)}" target="_blank" rel="noopener" data-nseen="${esc(n.id)}">${esc(n.title)}</a>
      <div class="row mt-s" style="gap:8px">${n.pdf ? `<a class="btn sm outline" href="${esc(n.pdf)}" target="_blank" rel="noopener" data-nseen="${esc(n.id)}">${icon("download", "sm")} PDF</a>` : ""}<a class="btn sm ghost" href="${esc(n.url)}" target="_blank" rel="noopener" data-nseen="${esc(n.id)}">${icon("external", "sm")} Open on ewubd.edu</a></div></div></article>`; };

  pages.notices = () => {
    refresh();
    const all = list(), cats = ["All", ...new Set(all.map((n) => n.cat))], ql = q.trim().toLowerCase();
    const shown = all.filter((n) => (tab === "All" || n.cat === tab) && (!ql || n.title.toLowerCase().includes(ql)));
    const unseen = all.filter(isNew).length;
    return `${ctx.head("Notice Board", "Official notices from East West University, updated automatically.", unseen ? `<button class="btn ghost sm" id="nb-read">${icon("check")} Mark all read</button>` : "")}
      ${error ? `<div class="alert amber" style="margin-bottom:12px"><span class="a-ic">${icon("wifioff")}</span><div class="grow"><b>Couldn't refresh</b><p>${esc(error)}</p></div><button class="btn sm" id="nb-retry">Try again</button></div>` : ""}
      <div class="row nowrap"><div class="searchbar grow">${icon("search")}<input class="input" id="nb-q" type="search" placeholder="Search notices" value="${esc(q)}" aria-label="Search notices"></div><button class="icon-btn" id="nb-refresh" aria-label="Refresh">${icon("sync")}</button></div>
      ${cats.length > 2 ? `<div class="seg mt">${cats.map((c) => `<button data-ncat="${esc(c)}" aria-selected="${tab === c}">${esc(c)}${c === "All" && unseen ? ` <span class="cnt">${unseen}</span>` : ""}</button>`).join("")}</div>` : ""}
      ${ctx.content.posts("announcement").map((p) => `<div class="alert purple mt fx-rise"><span class="a-ic">${icon("megaphone")}</span><div class="grow"><b>${esc(p.title)}</b><p>${esc(p.body)}</p></div>${p.link ? `<a class="btn sm" href="${esc(p.link)}" target="_blank" rel="noopener">Open</a>` : ""}</div>`).join("")}
      <section class="card mt">${!feed ? [1, 2, 3].map(() => '<div class="skel" style="height:74px;margin-bottom:10px"></div>').join("") : shown.length ? shown.map(row).join("") : ctx.empty("icon:bell", "No notices match", "Try another category or search.")}</section>
      <p class="xs mt">From <a href="https://www.ewubd.edu/notice-board" target="_blank" rel="noopener">ewubd.edu/notice-board</a>${feed ? ` · checked ${new Date(feed.at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}` : ""}. EWUdiots is unofficial; the original notice is always the one that counts.</p>`;
  };
  pages.notices.mount = (el) => {
    $$("[data-ncat]", el).forEach((b) => b.addEventListener("click", () => { tab = b.dataset.ncat; ctx.rerender(); }));
    $$("[data-nseen]", el).forEach((a) => a.addEventListener("click", () => markSeen([a.dataset.nseen])));
    $("#nb-read", el)?.addEventListener("click", () => { markSeen(list().map((n) => n.id)); ctx.rerender(); toast("All notices marked read", "info"); });
    const again = async () => { await refresh({ force: true }); if (!error) toast("Notices updated", "info"); };
    $("#nb-retry", el)?.addEventListener("click", again); $("#nb-refresh", el)?.addEventListener("click", again);
    const qi = $("#nb-q", el); let t; qi.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { q = qi.value; ctx.rerender(); const n = $("#nb-q"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200); });
  };

  /* Home card + notifications feed */
  const homeCard = () => { refresh(); const top = list().slice(0, 3); if (!top.length) return "";
    return `<section class="card"><div class="card-h"><h2><span class="itile sm orange">${icon("megaphone")}</span>EWU Notice Board</h2><a class="see" href="#/notices">View All${list().some(isNew) ? ` (${list().filter(isNew).length} new)` : ""}</a></div>
      ${top.map((n) => `<a class="lrow" href="#/notices" style="min-height:44px;padding:8px 0"><span class="itile sm ${(CAT_IC[n.cat] || CAT_IC.General)[1]}">${icon((CAT_IC[n.cat] || CAT_IC.General)[0])}</span><span class="body"><b style="font-size:14px;font-weight:500">${esc(n.title)}</b><span>${fmt(n.date)}</span></span>${isNew(n) ? '<span class="pill purple">New</span>' : ""}</a>`).join("")}</section>`; };
  const inboxItems = () => list().filter(isNew).slice(0, 10).map((n) => ({ id: `n:${n.id}`, cat: "Campus", icon: (CAT_IC[n.cat] || CAT_IC.General)[0], tone: "orange", title: "New EWU notice", body: n.title, at: n.date ? new Date(n.date + "T09:00:00").toISOString() : new Date().toISOString(), href: "#/notices" }));
  const unseenCount = () => list().filter(isNew).length;

  setInterval(() => { if (document.visibilityState === "visible") refresh(); }, POLL);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refresh(); });
  return { refresh, homeCard, inboxItems, unseenCount };
}
