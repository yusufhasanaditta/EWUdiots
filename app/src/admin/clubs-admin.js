/* Admin → Clubs (EWUdiots Club, migration 0016): platform overview, claims waiting for verification, every club with
   status / verified / appoint-an-admin, and reported club content. Verifying a claim makes that student the club's
   admin; appointing works by student ID or email (an invite if they have no account yet). */

/** @param {any} h helpers from admin.js */
export function clubViews(h) {
  const { $, $$, esc, icon, toast, openModal, closeModal, confirmAct, act, busy, ago } = h;
  const api = () => h.api();
  const live = () => api().kind === "supabase";
  const STATUS = { unclaimed: ["Unclaimed", ""], pending: ["Waiting", "amber"], active: ["Active", "green"], suspended: ["Suspended", "red"], archived: ["Archived", ""] };

  return {
    async clubs(el) {
      if (!live()) { el.innerHTML = `<div class="alert amber">${icon("alert")}<div><b>Clubs need the live server</b><p>Sign in to the real admin panel to verify clubs.</p></div></div>`; return; }
      const tab = el.dataset.t || "claims";
      const [stats, claims] = await Promise.all([api().rpc("admin_club_stats"), api().list("club_claims", { select: "*, clubs(name, slug, status, official_url)", limit: 200 })]);
      const pending = claims.filter((c) => c.status === "pending");
      const kpi = [["community", "purple", stats.clubs, "Active clubs"], ["clock", pending.length ? "orange" : "green", stats.pending_claims, "Claims waiting"], ["users", "blue", stats.members, "Club members"], ["megaphone", "teal", stats.posts_30d, "Posts (30 days)"], ["edit", "pink", stats.responses_30d, "Sign-ups (30 days)"], ["flag", stats.open_reports ? "red" : "green", stats.open_reports, "Open reports"]];
      el.innerHTML = `<div class="kpis">${kpi.map(([i, t, n, l], k) => `<div class="kpi fx-rise" style="--i:${k}"><span class="itile ${t}">${icon(i)}</span><b>${n}</b><span>${l}</span></div>`).join("")}</div>
        <div class="seg mt">${[["claims", `Claims${pending.length ? ` (${pending.length})` : ""}`], ["all", "All clubs"], ["reports", `Reports${stats.open_reports ? ` (${stats.open_reports})` : ""}`]].map(([v, l]) => `<button data-ct="${v}" aria-selected="${tab === v}">${l}</button>`).join("")}</div>
        <div id="ct-body" class="mt"></div>`;
      $$("[data-ct]", el).forEach((b) => b.addEventListener("click", () => { el.dataset.t = b.dataset.ct; h.VIEWS.clubs(el); }));
      const body = $("#ct-body", el), reload = () => { h.refreshBadges?.(); h.VIEWS.clubs(el); };
      if (tab === "claims") return claimsView(body, claims, reload);
      if (tab === "reports") return reportsView(body, reload);
      return allView(body, reload);
    }
  };

  function claimsView(body, claims, reload) {
    const pending = claims.filter((c) => c.status === "pending"), done = claims.filter((c) => c.status !== "pending").slice(0, 30);
    const row = (c) => `<div class="lrow top"><span class="itile sm ${c.status === "approved" ? "green" : c.status === "rejected" ? "red" : "orange"}">${icon("crown")}</span>
      <span class="body"><b>${esc(c.clubs?.name || "Club")}${c.clubs?.status === "pending" ? ' <span class="pill amber">new club</span>' : ""}</b><span>${esc(c.name)} · ${esc(c.email)} · ${esc(c.position)} · ${ago(c.created_at)}</span>${c.proof ? `<span class="xs">“${esc(c.proof)}”</span>` : ""}${c.review_note ? `<span class="xs">Note: ${esc(c.review_note)}</span>` : ""}</span>
      ${c.status === "pending" ? `<button class="btn sm primary" data-cv="${c.id}" data-ok="1">${icon("check", "sm")} Verify</button><button class="btn sm ghost" data-cv="${c.id}" data-ok="0">Decline</button>` : `<span class="pill">${esc(c.status)}</span>`}</div>`;
    body.innerHTML = `<p class="small muted">Check each claim before approving: ask the faculty advisor, or look at the club's page for the person's name. Approving makes them the club's admin on EWUdiots.</p>
      <section class="card tight mt">${pending.length ? pending.map(row).join("") : '<p class="small muted">No claims waiting.</p>'}</section>
      ${done.length ? `<h3 class="mt">Recently reviewed</h3><section class="card tight mt-s">${done.map(row).join("")}</section>` : ""}`;
    $$("[data-cv]", body).forEach((b) => b.addEventListener("click", () => {
      const ok = b.dataset.ok === "1", c = claims.find((x) => x.id === b.dataset.cv);
      openModal(ok ? "Verify this claim?" : "Decline this claim?", `<form id="cv-f" class="stack"><p class="small">${esc(c.name)} as ${esc(c.position)} of <b>${esc(c.clubs?.name || "")}</b>.${ok ? " They become its Club Admin and the club goes live with a verified badge." : ""}</p>
        <label class="field">Note to them (optional)<textarea class="input" name="note" rows="2" maxlength="300"></textarea></label><button class="btn ${ok ? "primary" : "danger"}">${ok ? "Verify" : "Decline"}</button></form>`, (m) => {
        $("#cv-f", m).addEventListener("submit", async (e) => {
          e.preventDefault(); const btn = e.target.querySelector("button"); busy(btn, true);
          try { await act(ok ? "Verified club claim" : "Declined club claim", `${c.clubs?.name} · ${c.email}`, () => api().rpc("review_claim", { claim: c.id, approve: ok, note: new FormData(e.target).get("note") })); closeModal(); toast(ok ? "Verified" : "Declined", "success"); reload(); }
          catch (err) { busy(btn, false); toast(err.message, "error"); }
        });
      });
    }));
  }

  async function allView(body, reload) {
    const rows = await api().list("clubs", { order: "name", asc: true, limit: 1000 });
    body.innerHTML = `<div class="row" style="gap:8px"><input class="input grow" id="cq" placeholder="Search clubs" type="search"></div>
      <section class="card tight mt">${rows.map((c) => `<div class="lrow" data-row="${esc(c.name.toLowerCase())}"><span class="itile sm ${STATUS[c.status]?.[1] || ""}">${icon("community")}</span>
        <span class="body"><b>${esc(c.name)}${c.verified ? ` ${icon("checkc", "sm")}` : ""}</b><span>${STATUS[c.status]?.[0] || c.status} · ${esc(c.slug)}</span></span>
        <a class="btn sm ghost" href="/app.html#/club/c?slug=${encodeURIComponent(c.slug)}" target="_blank" rel="noopener">${icon("external", "sm")}</a><button class="btn sm outline" data-ce="${c.id}">Manage</button></div>`).join("")}</section>`;
    $("#cq", body).addEventListener("input", (e) => { const q = e.target.value.toLowerCase(); $$("[data-row]", body).forEach((r) => { r.hidden = q && !r.dataset.row.includes(q); }); });
    $$("[data-ce]", body).forEach((b) => b.addEventListener("click", () => {
      const c = rows.find((x) => x.id === b.dataset.ce);
      openModal(c.name, `<div class="stack"><p class="small muted">Status: <b>${STATUS[c.status]?.[0]}</b>${c.verified ? " · verified" : ""}</p>
        <div class="row" style="gap:8px;flex-wrap:wrap"><a class="btn sm primary" href="/app.html#/club/manage?c=${c.id}" target="_blank" rel="noopener">${icon("settings", "sm")} Open club console</a><a class="btn sm outline" href="/app.html#/club/committee?c=${c.id}&tab=previous" target="_blank" rel="noopener">${icon("users", "sm")} Committees & history</a></div>
        <p class="xs">As a platform admin you have every club permission there: members, positions, committees, events, posts, finance.</p>
        <form id="ca-f" class="row nowrap" style="gap:8px"><input class="input grow" name="who" placeholder="Student ID or email of the new club admin" required><button class="btn primary">${icon("crown", "sm")} Appoint</button></form>
        <p class="xs">If they have no account yet, they get an invite and become admin when they sign up.</p>
        <div class="row" style="gap:8px;flex-wrap:wrap">${c.status !== "active" ? `<button class="btn sm" data-st="active">${icon("play", "sm")} Activate</button>` : `<button class="btn sm danger-soft" data-st="suspended">${icon("lock", "sm")} Suspend</button>`}
          ${c.status !== "archived" ? `<button class="btn sm neutral" data-st="archived">Archive</button>` : ""}${c.status !== "unclaimed" ? `<button class="btn sm neutral" data-st="unclaimed">Mark unclaimed</button>` : ""}
          <button class="btn sm ${c.verified ? "neutral" : "outline"}" id="ca-ver">${icon("checkc", "sm")} ${c.verified ? "Remove verified badge" : "Give verified badge"}</button></div></div>`, (m) => {
        $("#ca-f", m).addEventListener("submit", async (e) => {
          e.preventDefault(); const who = new FormData(e.target).get("who").trim(), btn = e.target.querySelector("button"); busy(btn, true);
          try { await act("Appointed club admin", `${c.name} · ${who}`, () => api().rpc("admin_set_club_admin", { c: c.id, who })); closeModal(); toast("Appointed", "success"); reload(); } catch (err) { busy(btn, false); toast(err.message, "error"); }
        });
        $$("[data-st]", m).forEach((s) => s.addEventListener("click", () => { closeModal(); confirmAct(`Set ${esc(c.name)} to ${STATUS[s.dataset.st][0]}?`, s.dataset.st === "suspended" ? "Its posts, forms and members' space go offline until you activate it again." : "", "Confirm", async () => { await act("Changed club status", `${c.name} → ${s.dataset.st}`, () => api().update("clubs", { id: c.id }, { status: s.dataset.st })); reload(); }); }));
        $("#ca-ver", m).addEventListener("click", async () => { try { await act("Changed club verification", c.name, () => api().update("clubs", { id: c.id }, { verified: !c.verified })); closeModal(); reload(); } catch (err) { toast(err.message, "error"); } });
      });
    }));
  }

  async function reportsView(body, reload) {
    const rows = await api().list("club_reports", { select: "*, clubs(name, slug)", eq: { status: "open" }, limit: 300 });
    body.innerHTML = `<section class="card tight">${rows.length ? rows.map((r) => `<div class="lrow"><span class="itile sm red">${icon("flag")}</span><span class="body"><b>${esc(r.clubs?.name || "Club")} · ${esc(r.target_type)}</b><span>${esc(r.reason)} · ${ago(r.created_at)}</span></span>
      ${r.target_type === "post" ? `<a class="btn sm ghost" href="/app.html#/club/post?id=${r.target_id}" target="_blank" rel="noopener">${icon("eye", "sm")} View</a><button class="btn sm danger-soft" data-hide="${r.target_id}" data-r="${r.id}">Hide post</button>` : ""}
      <button class="btn sm ghost" data-done="${r.id}">Dismiss</button></div>`).join("") : '<p class="small muted">No open reports.</p>'}</section>`;
    $$("[data-hide]", body).forEach((b) => b.addEventListener("click", async () => { try { await act("Hid club post", b.dataset.hide, () => api().update("club_posts", { id: b.dataset.hide }, { status: "hidden" })); await api().update("club_reports", { id: b.dataset.r }, { status: "done" }); toast("Post hidden", "success"); reload(); } catch (err) { toast(err.message, "error"); } }));
    $$("[data-done]", body).forEach((b) => b.addEventListener("click", async () => { try { await api().update("club_reports", { id: b.dataset.done }, { status: "done" }); reload(); } catch (err) { toast(err.message, "error"); } }));
  }
}
