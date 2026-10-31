/* Sponsorship & partnership hub (#/club/sponsors, #/club/sponsor?id=…), from the "Sponsorship Hub" board.
   Sponsors are a shared directory: clubs with sponsors.manage add companies (approved by the EWUdiots team before
   they're public), publish their own packages (Bronze / Silver / Gold…), and track deals; a deal marked received is
   booked as income in the finance log. Sponsor pages show past collaborations, never amounts. Sponsors aren't users:
   contact goes through their website or email. */

const KINDS = { sponsor: "Sponsors", industry: "Industry Partners", media: "Media Partners", supporter: "Supporters" };
const DEAL = { prospect: ["Prospect", "gray"], proposed: ["Proposal sent", "blue"], confirmed: ["Confirmed", "purple"], received: ["Received", "green"], declined: ["Declined", "red"] };

import { PROSPECTS, fitLabel } from "../prospects.js";

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store, ctx } = kit;
  let kind = "all", q = "";
  const logoOf = (s, size = "lg") => (s.logo_url ? `<img class="cl-logo ${size}" src="${esc(s.logo_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="cl-logo ${size} mono" style="--cc:#4f2bff">${esc(ui.initials(s.name))}</span>`);

  pages["club/sponsors"] = () => {
    if (!api) return kit.gate("sponsors");
    const se = store.use("sponsors:all", api.sponsors, { ttl: 5 * 60e3 }), oe = store.use("sponsors:opps", api.sponsorOpportunities, { ttl: 5 * 60e3 });
    const mine = kit.clubsWith("sponsors.manage").filter((m) => kit.feature(m.club_id, "sponsors"));
    return `${ui.ph("Sponsorship & Partnership Hub", "Find sponsors, manage partnerships and grow your club's impact.", mine.length ? `<button class="btn primary" id="sp-add">${icon("plus")} Add sponsor</button><a class="btn outline" href="#/club/sponsors?manage=${mine[0].club_id}">${icon("briefcase")} My club's deals</a>` : "")}
      ${kit.param("manage") ? manage(kit.param("manage")) : `
      <div class="searchbar cl-search">${icon("search")}<input class="input" id="sp-q" type="search" placeholder="Search sponsors, partners, industries…" value="${esc(q)}" autocomplete="off"></div>
      <nav class="cl-seg mt-s">${[["all", "All"], ...Object.entries(KINDS)].map(([v, l]) => `<button data-k="${v}" aria-pressed="${kind === v}">${l}</button>`).join("")}</nav>
      <section class="cl-banner"><h2>Let's Create Bigger Opportunities <span style="color:var(--lime)">Together.</span></h2><p style="opacity:.9;max-width:420px">Connect with brands, organizations and alumni to support meaningful student initiatives.</p></section>
      ${ui.view(se, (rows) => {
        const words = q.toLowerCase().split(/\s+/).filter(Boolean);
        const list = rows.filter((s) => s.status === "approved" && (kind === "all" || s.kind === kind) && (!words.length || words.every((w) => `${s.name} ${s.industry} ${s.tagline}`.toLowerCase().includes(w))));
        return `${ui.sec("Featured Sponsors & Partners")}${list.length ? `<div class="cl-prods">${list.map((s) => `<a class="cl-prod" href="#/club/sponsor?id=${s.id}" style="text-align:center;justify-items:center">${logoOf(s)}<b>${esc(s.name)}${s.verified ? ` ${icon("checkc", "sm")}` : ""}</b>${ui.st([s.industry, "blue"])}<span class="xs">${esc(s.tagline)}</span><span class="btn sm outline">View Profile</span></a>`).join("")}</div>`
          : ui.emptyBox("handshake", "No sponsors listed yet", mine.length ? "Add the companies your club works with; the EWUdiots team approves them." : "Sponsors appear here once clubs add them.")}`;
      }, { n: 3, h: 160 })}
      ${ui.view(oe, (rows) => (rows.length ? `${ui.sec("Sponsorship Opportunities")}<div class="cl-hscroll">${rows.map((e) => `<a class="cl-vcard" href="#/club/event?id=${e.id}" style="width:220px"><span class="art">${ui.art(e.image, e.title)}${ui.dchip(e.starts_at)}</span><span class="in">${ui.st(["Sponsorship", "amber"])}<b>${esc(e.title)}</b><span class="xs">${esc(e.clubs?.name || "")}</span><span class="xs">${icon("pin", "sm")} ${esc(e.venue || "EWU")}</span></span></a>`).join("")}</div>` : ""))}
      ${prospects()}
      ${ui.sec("Why Partner with EWUdiots Clubs?")}<div class="cl-perks">${[["users", "green", "Reach motivated university students"], ["sparkle", "purple", "Support meaningful student initiatives"], ["building", "blue", "Build your brand on campus"], ["heart", "pink", "Create long-term community impact"]].map(([ic, t, l]) => `<div><span class="itile sm ${t}">${icon(ic)}</span>${l}</div>`).join("")}</div>`}`;
  };
  /* Who is likely to sponsor a student event: companies that have backed university events in Dhaka, ranked by fit. */
  const prospects = () => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = PROSPECTS.filter((p) => !words.length || words.every((w) => `${p.name} ${p.industry} ${p.backs}`.toLowerCase().includes(w))).sort((a, b) => b.fit - a.fit);
    if (!list.length) return "";
    return `${ui.sec("Likely Sponsors to Approach")}<p class="xs" style="margin:-4px 0 10px">Companies that often back university events in Bangladesh, by how likely they are to say yes. They aren't partners of EWUdiots; approach them through their websites.</p>
      <div class="sp-list">${list.map((p) => { const [l, tone] = fitLabel(p.fit); return `<a class="sp-pro" href="${esc(p.web)}" target="_blank" rel="noopener noreferrer"><span class="itile ${tone === "green" ? "green" : tone === "blue" ? "blue" : "orange"}">${icon(p.icon)}</span>
        <span class="body"><b>${esc(p.name)}</b><span>${esc(p.industry)} · ${esc(p.backs)}</span><span class="sp-fit"><i style="width:${p.fit}%"></i></span></span><span class="st ${tone}">${p.fit}% · ${l}</span></a>`; }).join("")}</div>`;
  };
  pages["club/sponsors"].mount = (el) => {
    kit.bindRetry(el);
    const input = kit.$("#sp-q", el);
    input?.addEventListener("input", () => { q = input.value; const pos = input.selectionStart; ctx.rerender(); const i = kit.$("#sp-q"); if (i) { i.focus(); i.setSelectionRange(pos, pos); } });
    kit.$$("[data-k]", el).forEach((b) => b.addEventListener("click", () => { kind = b.dataset.k; ctx.rerender(); }));
    kit.$("#sp-add", el)?.addEventListener("click", addSponsor);
    mountManage(el);
  };

  function addSponsor() {
    const mine = kit.clubsWith("sponsors.manage");
    ui.sheet("Add a sponsor", `<form id="as" class="stack">${mine.length > 1 ? ui.field("Your club", ui.select("club", mine.map((m) => [m.club_id, m.name]))) : `<input type="hidden" name="club" value="${mine[0].club_id}">`}
      ${ui.field("Company / organisation", ui.input("name", "", 'required maxlength="80"'))}<div class="row" style="gap:8px">${ui.field("Industry", ui.input("industry", "", 'required maxlength="40" placeholder="Technology"'))}${ui.field("Type", ui.select("kind", KINDS, "sponsor"))}</div>
      ${ui.field("One line", ui.input("tagline", "", 'maxlength="120" placeholder="Supporting young innovators."'))}${ui.field("About", ui.area("about", "", 'rows="3" maxlength="2000"'))}
      <div class="row" style="gap:8px">${ui.field("Website", ui.input("website", "", 'type="url" placeholder="https://"'))}${ui.field("Contact email", ui.input("email", "", 'type="email"'))}</div>${ui.field("Location", ui.input("location", "Dhaka, Bangladesh", 'maxlength="80"'))}
      <button type="button" class="btn outline" id="as-logo">${icon("image")} Logo</button><span class="xs" id="as-ln"></span><div id="cl-err"></div><button class="btn primary block">Send for approval</button><p class="xs">The EWUdiots team checks new sponsors before they're listed.</p></form>`, (s) => {
      let logo = null;
      kit.$("#as-logo", s).addEventListener("click", async () => { logo = await ui.pickFile("image/*"); if (logo) kit.$("#as-ln", s).textContent = logo.name; });
      kit.$("#as", s).addEventListener("submit", async (e) => {
        e.preventDefault(); const f = ui.values(e.target), btn = e.target.querySelector("button.primary");
        if (f.website && !/^https:\/\//.test(f.website)) return ui.fail(s, "The website must start with https://");
        ctx.busy(btn, true, "Sending…");
        try { const logo_url = logo ? await api.uploadPublic(f.club, await ui.shrink(logo, 400), "sponsors") : "";
          await api.addSponsor({ name: f.name.trim(), industry: f.industry.trim(), kind: f.kind, tagline: f.tagline || "", about: f.about || "", website: f.website || "", email: f.email || "", location: f.location || "", logo_url, added_club: f.club });
          ctx.closeModal(); store.invalidate("sponsors:"); kit.toast("Sent for approval", "success"); }
        catch (err) { ctx.busy(btn, false); ui.fail(s, err.message); }
      });
    });
  }

  /* ── A club's own packages and deals ── */
  function manage(c) {
    if (!kit.can(c, "sponsors.manage")) return ui.emptyBox("lock", "For the club's sponsorship team", "");
    const pk = store.use(`club:packages:${c}`, () => api.packages(c), { ttl: 60e3 }), de = store.use(`club:deals:${c}`, () => api.sponsorships(c), { ttl: 30e3 });
    return `${kit.back("#/club/sponsors", "All sponsors")}${ui.sec("Your sponsorship packages", `<button class="btn sm outline" id="sp-pkg">${icon("plus", "sm")} Add package</button>`)}
      ${ui.view(pk, (rows) => (rows.length ? packages(rows, true) : `<p class="small muted">Offer tiers like Bronze ৳10,000 · Silver ৳25,000 · Gold ৳50,000.</p>`))}
      ${ui.sec("Deals", `<button class="btn sm primary" id="sp-deal">${icon("plus", "sm")} New deal</button>`)}
      ${ui.view(de, (rows) => (rows.length ? `<div class="cl-list">${rows.map((d) => `<button class="cl-li" data-deal="${d.id}">${logoOf(d.sponsors || { name: "?" }, "sm")}<span class="body"><b>${esc(d.title)}</b><span>${esc(d.sponsors?.name || "")}${d.amount ? ` · ${ui.money(d.amount)}` : ""}</span></span>${ui.st(DEAL[d.status])}</button>`).join("")}</div>` : `<p class="small muted">No deals yet.</p>`))}`;
  }
  const packages = (rows, edit = false) => `<div class="cl-pkgs">${rows.map((p) => `<div class="cl-pkg ${p.popular ? "pop" : ""}">${p.popular ? `<span class="tag">Most Popular</span>` : ""}<b>${esc(p.name)}</b>${ui.st([ui.money(p.amount), "green"])}
    <ul>${p.perks.map((x) => `<li>${icon("checkc")}${esc(x)}</li>`).join("")}</ul>${edit ? `<button class="btn sm ghost" data-pkg="${p.id}">Edit</button>` : ""}</div>`).join("")}</div>`;
  function mountManage(el) {
    const c = kit.param("manage"); if (!c) return;
    const reload = () => store.invalidate(`club:packages:${c}`, `club:deals:${c}`, `club:fin:${c}`);
    const pkgSheet = (p = {}) => ui.sheet(p.id ? "Edit package" : "New package", `<form id="pk" class="stack"><div class="row" style="gap:8px">${ui.field("Name", ui.input("name", p.name || "", 'required maxlength="40" placeholder="Silver Partner"'))}${ui.field("Amount (৳)", `<input class="input" type="number" name="amount" min="0" value="${p.amount ?? ""}" required>`)}</div>
      ${ui.field("What they get (one per line)", ui.area("perks", (p.perks || []).join("\n"), 'rows="4" placeholder="Logo on banners & stage\nSpeaking opportunity"'))}${ui.toggle("popular", !!p.popular, "Most popular")}
      <button class="btn primary block">Save</button>${p.id ? `<button type="button" class="btn ghost block" id="pk-del" style="color:var(--error)">Delete</button>` : ""}</form>`, (s) => {
      kit.$("#pk", s).addEventListener("submit", async (e) => { e.preventDefault(); const f = ui.values(e.target); try { await api.savePackage({ ...(p.id ? { id: p.id } : { club_id: c }), name: f.name.trim(), amount: Number(f.amount), perks: String(f.perks || "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 10), popular: !!f.popular }); ctx.closeModal(); reload(); } catch (err) { kit.toast(err.message, "error"); } });
      kit.$("#pk-del", s)?.addEventListener("click", async () => { try { await api.deletePackage(p.id); ctx.closeModal(); reload(); } catch (err) { kit.toast(err.message, "error"); } });
    });
    kit.$("#sp-pkg", el)?.addEventListener("click", () => pkgSheet());
    kit.$$("[data-pkg]", el).forEach((b) => b.addEventListener("click", () => pkgSheet((store.peek(`club:packages:${c}`) || []).find((x) => x.id === b.dataset.pkg))));
    const dealSheet = (d = {}) => {
      const sp = (store.peek("sponsors:all") || []).filter((s) => s.status === "approved" || s.added_club === c), pk = store.peek(`club:packages:${c}`) || [], evs = store.use(`club:events:${c}`, () => api.clubEvents(c), { ttl: 60e3 }).value || [];
      ui.sheet(d.id ? "Deal" : "New deal", `<form id="dl" class="stack">${ui.field("Sponsor", ui.select("sponsor", sp.map((s) => [s.id, s.name]), d.sponsor_id))}${ui.field("Title", ui.input("title", d.title || "", 'required maxlength="140" placeholder="Tech Talk 2026 – Silver"'))}
        <div class="row" style="gap:8px">${ui.field("Package", ui.select("package", [["", "Custom"], ...pk.map((p) => [p.id, `${p.name} (${ui.money(p.amount)})`])], d.package_id || ""))}${ui.field("Amount (৳)", `<input class="input" type="number" name="amount" min="0" value="${d.amount ?? 0}">`)}</div>
        <div class="row" style="gap:8px">${ui.field("Event", ui.select("event", [["", "No event"], ...evs.map((e) => [e.id, e.title])], d.event_id || ""))}${ui.field("Status", ui.select("status", Object.fromEntries(Object.entries(DEAL).map(([k, v]) => [k, v[0]])), d.status || "prospect"))}</div>
        <div class="row" style="gap:8px">${ui.field("Date", `<input class="input" type="date" name="on" value="${d.happened_on || ""}">`)}${ui.field("Students reached", `<input class="input" type="number" name="reach" min="0" value="${d.participants ?? ""}">`)}</div>
        ${ui.field("Notes", ui.area("notes", d.notes || "", 'rows="3" maxlength="2000"'))}${ui.toggle("public", d.public !== false, "Show on the sponsor's page", "Title and date only — never the amount")}
        <p class="xs">Marking it “Received” adds the amount to your finance book as sponsorship income.</p><div id="cl-err"></div><button class="btn primary block">Save</button></form>`, (s) => {
        kit.$('[name="package"]', s)?.addEventListener("change", (e) => { const p = pk.find((x) => x.id === e.target.value); if (p) s.querySelector('[name="amount"]').value = p.amount; });
        kit.$("#dl", s).addEventListener("submit", async (e) => { e.preventDefault(); const f = ui.values(e.target); if (!f.sponsor) return ui.fail(s, "Add the sponsor to the directory first.");
          try { await api.saveSponsorship({ ...(d.id ? { id: d.id } : { club_id: c }), sponsor_id: f.sponsor, title: f.title.trim(), package_id: f.package || null, amount: Number(f.amount) || 0, event_id: f.event || null, status: f.status, happened_on: f.on || null, participants: f.reach ? Number(f.reach) : null, notes: f.notes || "", public: !!f.public }); ctx.closeModal(); reload(); } catch (err) { ui.fail(s, err.message); } });
      });
    };
    kit.$("#sp-deal", el)?.addEventListener("click", () => dealSheet());
    kit.$$("[data-deal]", el).forEach((b) => b.addEventListener("click", () => dealSheet((store.peek(`club:deals:${c}`) || []).find((x) => x.id === b.dataset.deal))));
  }

  /* ═════════ A sponsor ═════════ */
  pages["club/sponsor"] = () => {
    if (!api) return kit.gate("sponsors");
    const id = kit.param("id"), se = store.use(`sponsor:${id}`, () => api.sponsor(id), { ttl: 5 * 60e3 });
    return kit.back("#/club/sponsors", "Sponsors") + ui.view(se, (s) => {
      if (!s) return ui.emptyBox("handshake", "Sponsor not found", "");
      const pe = store.use(`sponsor:profile:${id}`, () => api.sponsorProfile(id), { ttl: 5 * 60e3 }), p = pe.value || {};
      const pk = store.use("sponsors:packages", api.allPackages, { ttl: 5 * 60e3 }).value || [];
      const asks = kit.clubsWith("sponsors.manage");
      return `${ui.ph("Sponsor Details & Collaboration", "Explore details, packages and past collaborations.")}
        <section class="card row" style="gap:16px;flex-wrap:wrap">${logoOf(s, "xl")}<div class="grow min0"><h1 style="font-size:24px">${esc(s.name)} ${s.verified ? icon("checkc", "sm") : ""}</h1><p class="xs">${esc(s.industry)}${s.location ? ` · ${icon("pin", "sm")} ${esc(s.location)}` : ""}</p><p>${esc(s.tagline)}</p></div>
          <div class="stack" style="gap:8px">${s.website ? `<a class="btn primary" href="${esc(s.website)}" target="_blank" rel="noopener noreferrer">Visit Website ${icon("external", "sm")}</a>` : ""}${s.email ? `<a class="btn outline" href="mailto:${esc(s.email)}">${icon("mail")} Contact Sponsor</a>` : ""}</div></section>
        <div class="cl-stats mt">${ui.stat("handshake", "green", p.clubs ?? 0, "Campus partnerships")}${ui.stat("calendar", "blue", p.events ?? 0, "University events")}${ui.stat("users", "green", p.reached ? `${p.reached}+` : "–", "Students reached")}${ui.stat("clock", "amber", p.since ? new Date().getFullYear() - p.since + 1 : "–", "Years partner")}</div>
        ${s.about ? `<section class="card"><h2>About ${esc(s.name)}</h2><p style="color:var(--text-2)">${ui.rich(s.about)}</p></section>` : ""}
        ${pk.length ? `${ui.sec("Sponsorship Packages")}<p class="xs">Packages offered by EWU clubs.</p>${Object.values(pk.reduce((m, x) => { (m[x.club_id] ||= { club: x.clubs, rows: [] }).rows.push(x); return m; }, {})).slice(0, 3).map((g) => `<h3 class="small mt">${esc(g.club?.name || "")}</h3>${packages(g.rows)}`).join("")}` : ""}
        ${p.collaborations?.length ? `${ui.sec("Past Collaborations")}<div class="cl-hscroll">${p.collaborations.map((x) => `<div class="cl-vcard" style="width:220px"><span class="art">${ui.art(x.image, x.title)}</span><span class="in"><b>${esc(x.title)}</b><span class="xs">${x.happened_on ? ui.dateLong(x.happened_on) : ""}</span><span class="xs">${esc(x.club)}${x.participants ? ` · ${x.participants}+ participants` : ""}</span></span></div>`).join("")}</div>` : ""}
        ${asks.length ? `<section class="card row nowrap mt" style="gap:12px">${icon("handshake")}<div class="grow"><b>Interested in a Collaboration?</b><p class="xs">Start a deal for your club and send a proposal.</p></div><a class="btn primary" href="#/club/sponsors?manage=${asks[0].club_id}">${icon("send")} Send Collaboration Request</a></section>` : ""}`;
    }, { n: 3, h: 140 });
  };
  pages["club/sponsor"].mount = (el) => kit.bindRetry(el);
}
