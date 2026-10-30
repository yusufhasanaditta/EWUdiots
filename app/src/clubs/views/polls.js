/* Polls & voting (#/club/polls, #/club/poll?id=) and club elections (#/club/elections, #/club/election?id=), from the
   "Polls & Voting" and "Club Election" boards. Polls: quick member votes (anonymous or named; named votes can be
   changed while open). Elections: nomination → verification → campaign → voting → results, one anonymous ballot per
   position (who voted and what they chose are stored apart), and the Club Admin applies the results, which hands
   the winners their positions and saves the outgoing committee to History. */

const CATS = { general: ["General", "blue"], event: ["Event", "purple"], executive: ["Executive", "amber"], project: ["Project", "teal"], other: ["Other", "gray"] };
const PHASES = [["nomination", "Nomination Period", "nomination_start", "nomination_end"], ["verification", "Candidate Verification", "nomination_end", "verification_end"], ["campaign", "Campaign Period", "verification_end", "voting_start"], ["voting", "Voting Period", "voting_start", "voting_end"], ["results", "Result Announcement", "voting_end", "results_at"]];
const ORDER = ["draft", "upcoming", "nomination", "verification", "campaign", "voting", "results", "applied"];
/** Same rules as public.election_phase(). */
export function phase(e, now = Date.now()) {
  if (["cancelled", "applied", "draft"].includes(e.status)) return e.status;
  const t = (k) => (e[k] ? new Date(e[k]).getTime() : null);
  if (now < t("nomination_start")) return "upcoming";
  if (now < t("nomination_end")) return "nomination";
  if (now < (t("verification_end") ?? t("nomination_end"))) return "verification";
  if (now < t("voting_start")) return "campaign";
  if (now < t("voting_end")) return "voting";
  return "results";
}

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store, ctx } = kit;
  let tab = "active", cat = "", club = "";
  const pollState = (p) => (p.closed || (p.closes_at && new Date(p.closes_at) < Date.now()) ? "closed" : p.starts_at && new Date(p.starts_at) > Date.now() ? "upcoming" : "active");
  const left = (d) => { const ms = new Date(d) - Date.now(), days = Math.ceil(ms / 864e5); return ms <= 0 ? "Ended" : days > 1 ? `${days} days` : `${Math.max(1, Math.ceil(ms / 36e5))} hours`; };

  /* ═════════ Polls ═════════ */
  pages["club/polls"] = () => {
    const g = kit.gate("polls"); if (g) return g;
    const mine = kit.myClubs(), ids = mine.map((m) => m.club_id);
    if (!ids.length) return ui.ph("Polls & Voting", "Make decisions together, transparently") + ui.emptyBox("bars", "Join a club to vote", "Polls and elections are for club members.", `<a class="btn primary" href="#/club/explore">Find clubs</a>`);
    const pe = store.use(`me:polls:${ids.join(",")}`, () => api.clubPollsAll(ids), { ttl: 30e3 });
    const ve = store.use(`me:voted:${(pe.value || []).length}`, () => api.myVotes((pe.value || []).map((p) => p.id)), { ttl: 30e3 });
    const counts = store.use("clubs:counts", api.counts, { ttl: 60e3 }).value || {};
    const creators = kit.clubsWith("polls.create");
    return `${ui.ph("Polls & Voting", "Make decisions together, transparently", creators.length ? `<button class="btn primary" id="pl-new">${icon("plus")} Create Poll</button>` : "")}
      ${ui.seg([["polls", "Polls"], ["elections", "Elections"]], "polls", (v) => (v === "elections" ? "#/club/elections" : "#/club/polls"), "sm")}
      ${ui.view(pe, (rows) => {
        const n = (s) => rows.filter((p) => pollState(p) === s).length;
        const list = rows.filter((p) => pollState(p) === tab && (!cat || p.category === cat) && (!club || p.club_id === club));
        const voted = new Set(ve.value || []);
        return `<nav class="cl-seg">${[["active", "Active", n("active")], ["upcoming", "Upcoming", n("upcoming")], ["closed", "Closed", n("closed")]].map(([v, l, c]) => `<button data-tab="${v}" aria-pressed="${tab === v}">${l} <span class="n">${c}</span></button>`).join("")}</nav>
          <div class="row" style="gap:8px;margin-bottom:12px">${ui.select("cat", [["", "All types"], ...Object.entries(CATS).map(([k, v]) => [k, v[0]])], cat, 'id="pl-cat" style="width:auto"')}
            ${mine.length > 1 ? ui.select("club", [["", "All clubs"], ...mine.map((m) => [m.club_id, m.short_name || m.name])], club, 'id="pl-club" style="width:auto"') : ""}</div>
          ${list.length ? `<div class="cl-list">${list.map((p) => { const st = pollState(p), m = counts[p.club_id]?.members || 0, v = p._voters;
            return `<a class="cl-li" href="#/club/poll?id=${p.id}"><span class="itile ${CATS[p.category]?.[1] || "blue"}">${icon(p.kind === "election" ? "ballot" : p.category === "event" ? "calendar" : p.category === "executive" ? "users" : "bars")}</span>
              <span class="body"><span class="row" style="gap:6px">${ui.st(st === "active" ? ["Active", "green"] : st === "upcoming" ? ["Upcoming", "amber"] : ["Closed", "gray"])}${ui.st(CATS[p.category])}${voted.has(p.id) ? ui.st(["You voted", "purple"], "check") : ""}</span>
                <b style="margin-top:4px">${esc(p.title)}</b><span>${esc(p.description || p.clubs?.short_name || "")}</span></span>
              <span class="end">${st === "active" && p.closes_at ? `Ends in ${left(p.closes_at)}` : st === "upcoming" ? `Starts ${ui.dateShort(p.starts_at)}` : p.closes_at ? `Ended ${ui.dateShort(p.closes_at)}` : ""}${v != null && m ? `<br>${Math.round((v / m) * 100)}% voted` : ""}</span></a>`; }).join("")}</div>`
            : ui.emptyBox("bars", "No polls here", creators.length ? "Ask your members something with Create Poll." : "Polls from your clubs appear here.")}`;
      }, { n: 4, h: 80 })}`;
  };
  pages["club/polls"].mount = (el) => {
    kit.bindRetry(el);
    kit.$$("[data-tab]", el).forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; ctx.rerender(); }));
    kit.$("#pl-cat", el)?.addEventListener("change", (e) => { cat = e.target.value; ctx.rerender(); });
    kit.$("#pl-club", el)?.addEventListener("change", (e) => { club = e.target.value; ctx.rerender(); });
    kit.$("#pl-new", el)?.addEventListener("click", () => newPoll(kit.param("c")));
    if (kit.param("new")) { const c = kit.param("c"); history.replaceState(null, "", "#/club/polls"); newPoll(c); }
  };
  function newPoll(clubId) {
    const clubs = kit.clubsWith("polls.create"); if (!clubs.length) return;
    ui.sheet("New poll", `<form id="np" class="stack">${clubs.length > 1 ? ui.field("Club", ui.select("club", clubs.map((m) => [m.club_id, m.name]), clubId || clubs[0].club_id)) : `<input type="hidden" name="club" value="${clubs[0].club_id}">`}
      ${ui.field("Question", ui.input("title", "", 'required maxlength="160" placeholder="Tech Talk 2026 – Preferred Date"'))}
      ${ui.field("Details", ui.area("description", "", 'maxlength="2000" rows="2"'))}
      ${ui.field("Options (one per line, 2–30)", ui.area("options", "", 'required rows="5" placeholder="25 October (Sunday)\n26 October (Monday)"'))}
      <div class="row" style="gap:8px">${ui.field("Type", ui.select("category", Object.fromEntries(Object.entries(CATS).map(([k, v]) => [k, v[0]])), "general"))}${ui.field("Who votes", ui.select("audience", [["members", "All members"], ["exec", "Executives"]], "members"))}</div>
      <div class="row" style="gap:8px">${ui.field("Opens", '<input class="input" type="datetime-local" name="starts">')}${ui.field("Closes", '<input class="input" type="datetime-local" name="closes">')}</div>
      ${ui.toggle("multi", false, "Allow several choices")}${ui.toggle("anonymous", true, "Anonymous", "Nobody can see who chose what. Votes can't be changed.")}${ui.toggle("live", true, "Show results while voting")}
      <div id="cl-err"></div><button class="btn primary block">${icon("check")} Create poll</button></form>`, (s) => kit.$("#np", s).addEventListener("submit", async (e) => {
      e.preventDefault(); const f = ui.values(e.target), btn = e.target.querySelector("button.primary");
      const options = [...new Set(String(f.options).split("\n").map((x) => x.trim()).filter(Boolean))];
      if (options.length < 2) return ui.fail(s, "Add at least two options, one per line.");
      ctx.busy(btn, true, "Creating…");
      try {
        const p = await api.createPoll({ club_id: f.club, title: f.title.trim(), description: f.description || "", options: options.slice(0, 30), category: f.category, audience: f.audience, multi: !!f.multi, anonymous: !!f.anonymous, results: f.live ? "live" : "after_close",
          starts_at: f.starts ? new Date(f.starts).toISOString() : null, closes_at: f.closes ? new Date(f.closes).toISOString() : null });
        ctx.closeModal(); store.invalidate("me:polls:"); kit.go(`#/club/poll?id=${p.id}`);
      } catch (err) { ctx.busy(btn, false); ui.fail(s, err.message); }
    }));
  }

  pages["club/poll"] = () => {
    const g = kit.gate("this poll"); if (g) return g;
    const id = kit.param("id"), pe = store.use(`club:poll:${id}`, () => api.poll(id), { ttl: 30e3 });
    return kit.back("#/club/polls", "Polls") + ui.view(pe, (p) => {
      if (!p) return ui.emptyBox("lock", "Poll not found", "It may be for executives only.");
      const re = store.use(`club:pres:${id}`, () => api.results(id), { ttl: 20e3 }), res = re.value || [];
      const ve = store.use(`club:pvoted:${id}`, () => api.myVotes([id]), { ttl: 20e3 }), voted = (ve.value || []).includes(id);
      const ce = store.use(`club:pchoice:${id}`, () => (p.anonymous ? Promise.resolve([]) : api.myPollChoice(id)), { ttl: 20e3 }), mine = ce.value || [];
      const members = (store.use("clubs:counts", api.counts, { ttl: 60e3 }).value || {})[p.club_id]?.members || 0;
      const st = pollState(p), total = res.reduce((s, r) => s + r.votes, 0), voters = res[0]?.voters ?? 0, show = res.length > 0;
      const cm = store.use(`club:pcom:${id}`, () => api.pollComments(id), { ttl: 30e3 });
      return `<section class="cl-cover-lg" style="min-height:150px">${p.cover_url ? `<img src="${esc(p.cover_url)}" alt="">` : ""}<span class="cl-disclaimer" style="justify-self:start">${esc(p.clubs?.short_name || p.clubs?.name || "")}</span></section>
        <div class="row mt" style="gap:6px">${ui.st(st === "active" ? ["Active", "green"] : st === "upcoming" ? ["Upcoming", "amber"] : ["Closed", "gray"], st === "active" ? "checkc" : "")}${ui.st(CATS[p.category])}${p.anonymous ? ui.st(["Anonymous", "purple"], "lock") : ""}
          ${p.closes_at && st === "active" ? `<span class="push xs" style="color:var(--error-t)">${icon("clock", "sm")} Ends in ${left(p.closes_at)}</span>` : ""}</div>
        <h1 style="font-size:24px;margin-top:8px">${esc(p.title)}</h1>${p.description ? `<p style="color:var(--text-2)">${ui.rich(p.description)}</p>` : ""}
        <div class="cl-stats mt">${ui.stat("ballot", "purple", voters, "Total votes")}${ui.stat("chart", "blue", members ? `${Math.round((voters / members) * 100)}%` : "–", "Participation")}${ui.stat("calendar", "amber", p.closes_at ? ui.dateShort(p.closes_at) : "Open", "Deadline")}</div>
        <form id="pv" class="stack">${ui.sec("Options")}
          ${p.options.map((o, i) => { const v = res.find((r) => r.choice === i)?.votes || 0, pct = total ? Math.round((v / total) * 100) : 0;
            return `<label class="cl-opt" style="display:grid;grid-template-columns:auto 1fr auto;gap:10px"><input type="${p.multi ? "checkbox" : "radio"}" name="o" value="${i}" ${mine.includes(i) ? "checked" : ""} ${(voted && p.anonymous) || st !== "active" ? "disabled" : ""}>
              <span class="min0"><b style="display:block">${esc(o)}</b>${show ? `<span class="cl-prog" style="margin-top:6px"><i style="width:${pct}%"></i></span>` : ""}</span>${show ? `<span class="xs" style="text-align:right">${v} votes<br><b>${pct}%</b></span>` : ""}</label>`; }).join("")}
          ${!show ? `<p class="xs">Results appear ${p.results === "live" ? "after the first vote" : "when voting closes"}.</p>` : ""}
          ${voted ? `<div class="alert green"><span class="a-ic">${icon("checkc")}</span><div class="grow"><b>Your vote has been recorded!</b>${mine.length ? `<p>You selected: ${mine.map((i) => esc(p.options[i])).join(", ")}</p>` : ""}</div>${!p.anonymous && st === "active" ? `<button class="btn sm outline">${icon("edit", "sm")} Change Vote</button>` : ""}</div>`
            : st === "active" ? `<button class="btn primary block">${icon("check")} Vote</button>` : ""}</form>
        ${ui.sec(`Comments (${(cm.value || []).length})`)}
        <form id="pc" class="row nowrap" style="gap:8px">${ui.input("b", "", 'placeholder="Write a comment…" maxlength="1000" style="flex:1" aria-label="Comment"')}<button class="btn primary" aria-label="Send">${icon("send")}</button></form>
        ${ui.view(cm, (rows) => `<div class="stack mt-s">${rows.map((c) => `<div class="cl-comment">${ui.ava(c.name, "", "sm")}<div><b>${esc(c.name || "Member")}</b> <span class="xs">${ui.ago(c.created_at)}</span><p>${ui.rich(c.body)}</p></div></div>`).join("")}</div>`)}
        ${kit.can(p.club_id, "polls.create") && st === "active" ? `<button class="btn ghost mt" id="pv-close">${icon("lock", "sm")} Close this poll now</button>` : ""}`;
    }, { n: 3, h: 100 });
  };
  pages["club/poll"].mount = (el) => {
    kit.bindRetry(el);
    const id = kit.param("id"), p = store.peek(`club:poll:${id}`); if (!p) return;
    const reload = () => store.invalidate(`club:pres:${id}`, `club:pvoted:${id}`, `club:pchoice:${id}`, "me:voted:", "me:polls:");
    kit.$("#pv", el)?.addEventListener("submit", async (e) => {
      e.preventDefault(); const choices = [...e.target.querySelectorAll('input[name="o"]:checked')].map((x) => Number(x.value));
      if (!choices.length) return kit.toast("Choose an option first", "info");
      const voted = (store.peek(`club:pvoted:${id}`) || []).includes(id);
      try { if (voted) await api.changeVote(id, choices); else await api.vote(id, choices); reload(); kit.toast(voted ? "Vote changed" : "Vote recorded", "success"); } catch (err) { kit.toast(err.message, "error"); }
    });
    kit.$("#pc", el)?.addEventListener("submit", async (e) => { e.preventDefault(); const b = String(new FormData(e.target).get("b") || "").trim(); if (!b) return; try { await api.addPollComment(id, p.club_id, b); store.invalidate(`club:pcom:${id}`); } catch (err) { kit.toast(err.message, "error"); } });
    kit.$("#pv-close", el)?.addEventListener("click", () => ui.confirm("Close this poll?", "Nobody can vote after this. Results become visible to members.", "Close poll", async () => { await api.closePoll(id); store.invalidate(`club:poll:${id}`, "me:polls:"); }));
  };

  /* ═════════ Elections ═════════ */
  let etab = "ongoing";
  pages["club/elections"] = () => {
    const g = kit.gate("elections"); if (g) return g;
    const ids = kit.myClubs().map((m) => m.club_id);
    const ee = store.use(`me:elections:${ids.join(",")}`, () => api.elections(ids), { ttl: 45e3 });
    const runners = kit.myClubs().filter((m) => m.rank <= 3 && kit.can(m.club_id, "elections.manage"));
    return `${ui.ph("Club Elections", "Manage elections, nominations, voting, and executive transitions", runners.length ? `<button class="btn primary" id="el-new">${icon("plus")} New Election</button>` : "")}
      ${ui.seg([["polls", "Polls"], ["elections", "Elections"]], "elections", (v) => (v === "elections" ? "#/club/elections" : "#/club/polls"), "sm")}
      <nav class="cl-seg">${[["ongoing", "Ongoing"], ["upcoming", "Upcoming"], ["past", "Past Elections"]].map(([v, l]) => `<button data-et="${v}" aria-pressed="${etab === v}">${l}</button>`).join("")}</nav>
      ${ui.view(ee, (rows) => {
        const group = (e) => { const ph = phase(e); return ["results", "applied", "cancelled"].includes(ph) ? "past" : ph === "upcoming" || ph === "draft" ? "upcoming" : "ongoing"; };
        const list = rows.filter((e) => group(e) === etab);
        return list.length ? `<div class="stack">${list.map((e) => { const ph = phase(e);
          return `<a class="cl-banner" href="#/club/election?id=${e.id}" style="min-height:140px"><h2>${esc(e.title)}</h2><p style="opacity:.9">${esc(e.clubs?.name || "")}</p>
            <div class="row" style="gap:8px">${ui.st(ph === "voting" ? ["Voting Live", "green"] : [ph[0].toUpperCase() + ph.slice(1), ph === "results" || ph === "applied" ? "blue" : "amber"], ph === "voting" ? "checkc" : "")}<span class="st gray">${icon("calendar")} ${ui.dateShort(e.voting_start)} – ${ui.dateShort(e.voting_end)}</span></div></a>`; }).join("")}</div>`
          : ui.emptyBox("ballot", "No elections here", runners.length ? "Run your committee election with New Election." : "Your clubs' elections appear here.");
      }, { n: 2, h: 140 })}`;
  };
  pages["club/elections"].mount = (el) => {
    kit.bindRetry(el);
    kit.$$("[data-et]", el).forEach((b) => b.addEventListener("click", () => { etab = b.dataset.et; ctx.rerender(); }));
    kit.$("#el-new", el)?.addEventListener("click", () => editElection({}));
  };
  function editElection(e) {
    const runners = kit.myClubs().filter((m) => m.rank <= 3 && kit.can(m.club_id, "elections.manage"));
    const local = (d) => (d ? new Date(new Date(d).getTime() - new Date(d).getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : "");
    const day = 864e5, now = Date.now(), y = new Date().getFullYear();
    ui.sheet(e.id ? "Edit election" : "New election", `<form id="ef" class="stack">
      ${!e.id ? ui.field("Club", ui.select("club", runners.map((m) => [m.club_id, m.name]), runners[0]?.club_id)) : ""}
      ${ui.field("Title", ui.input("title", e.title || `Executive Committee Election ${y}`, 'required maxlength="140"'))}
      ${ui.field("Term", ui.input("term_label", e.term_label || `${y}–${String(y + 1).slice(2)}`, 'maxlength="40"'))}
      <div class="row" style="gap:8px">${ui.field("Nominations open", `<input class="input" type="datetime-local" name="ns" value="${local(e.nomination_start || now)}" required>`)}${ui.field("Nominations close", `<input class="input" type="datetime-local" name="ne" value="${local(e.nomination_end || now + 7 * day)}" required>`)}</div>
      <div class="row" style="gap:8px">${ui.field("Voting opens", `<input class="input" type="datetime-local" name="vs" value="${local(e.voting_start || now + 14 * day)}" required>`)}${ui.field("Voting closes", `<input class="input" type="datetime-local" name="ve" value="${local(e.voting_end || now + 19 * day)}" required>`)}</div>
      ${ui.field("Rules & guidelines", ui.area("rules", e.rules || "Every active member can vote once per position. Candidates must be active members. Campaign respectfully; no posters inside classrooms.", 'rows="4" maxlength="6000"'))}
      <div id="cl-err"></div><button class="btn primary block">${icon("check")} ${e.id ? "Save" : "Create (as draft)"}</button></form>`, (s) => kit.$("#ef", s).addEventListener("submit", async (ev) => {
      ev.preventDefault(); const f = ui.values(ev.target), btn = ev.target.querySelector("button.primary");
      const iso = (v) => new Date(v).toISOString();
      if (!(new Date(f.ne) > new Date(f.ns) && new Date(f.vs) >= new Date(f.ne) && new Date(f.ve) > new Date(f.vs))) return ui.fail(s, "Dates must go: nominations open → close → voting opens → closes.");
      ctx.busy(btn, true, "Saving…");
      try {
        const row = await api.saveElection({ ...(e.id ? { id: e.id } : { club_id: f.club, status: "draft" }), title: f.title.trim(), term_label: f.term_label, rules: f.rules, nomination_start: iso(f.ns), nomination_end: iso(f.ne), voting_start: iso(f.vs), voting_end: iso(f.ve) });
        ctx.closeModal(); store.invalidate("me:elections:", `club:election:${row.id}`); kit.go(`#/club/election?id=${row.id}`);
      } catch (err) { ctx.busy(btn, false); ui.fail(s, err.message); }
    }));
  }

  let ctab = "overview", pos = "";
  pages["club/election"] = () => {
    const g = kit.gate("this election"); if (g) return g;
    const id = kit.param("id"), ee = store.use(`club:election:${id}`, () => api.election(id), { ttl: 30e3 });
    return kit.back("#/club/elections", "Elections") + ui.view(ee, (e) => {
      if (!e) return ui.emptyBox("lock", "Election not found", "");
      const ph = phase(e), manage = kit.can(e.club_id, "elections.manage") && (kit.membership(e.club_id)?.rank <= 3 || kit.isPlatform());
      const pe = store.use(`club:epos:${id}`, () => api.positions(id), { ttl: 60e3 }), positions = pe.value || [];
      const ce = store.use(`club:ecand:${id}`, () => api.candidates(id), { ttl: 30e3 }), cands = ce.value || [];
      const ve = store.use(`club:evoted:${id}:${positions.length}`, () => api.myElectionVotes(positions.map((p) => p.id)), { ttl: 30e3 }), voted = new Set(ve.value || []);
      const re = ["results", "applied"].includes(ph) || manage ? store.use(`club:eres:${id}`, () => api.electionResults(id), { ttl: 30e3 }).value || [] : [];
      if (!pos || !positions.some((p) => p.id === pos)) pos = positions[0]?.id || "";
      const approved = cands.filter((c) => c.status === "approved");
      const tabs = [["overview", "Overview"], ["candidates", "Candidates"], ["vote", "Vote"], ["results", "Results"], ["rules", "Rules & Guidelines"], ...(manage ? [["manage", "Manage"]] : [])];
      return `<section class="cl-banner" style="min-height:150px"><h2>${esc(e.title)}</h2><p style="opacity:.9">${esc(e.clubs?.name || "")}${e.term_label ? ` · Term ${esc(e.term_label)}` : ""}</p>
          <div class="row" style="gap:8px"><span class="st gray">${icon("calendar")} ${ui.dateShort(e.voting_start)} – ${ui.dateShort(e.voting_end)}</span>${ph === "voting" ? ui.st(["Voting Live", "green"], "checkc") : ui.st([ph[0].toUpperCase() + ph.slice(1), "amber"])}</div></section>
        <div class="cl-stats mt">${ui.stat("briefcase", "purple", positions.length, "Positions")}${ui.stat("users", "blue", approved.length, "Candidates")}${ui.stat("checkc", "green", voted.size, "Your votes")}${ui.stat("ballot", "amber", re.length ? Math.max(0, ...re.map((r) => r.voters)) : "–", "Voters (top position)")}</div>
        <nav class="cl-seg sm">${tabs.map(([v, l]) => `<button data-ct="${v}" aria-pressed="${ctab === v}">${l}</button>`).join("")}</nav>
        ${ctab === "rules" ? `<section class="card"><h2>Election Rules & Guidelines</h2><p style="color:var(--text-2)">${ui.rich(e.rules || "No rules written yet.")}</p></section>`
          : ctab === "results" ? results(positions, cands, re, ph, manage)
          : ctab === "manage" && manage ? managePanel(e, positions, cands, ph)
          : ctab === "candidates" || ctab === "vote" ? candidatesTab(e, ph, positions, approved, voted, ctab === "vote")
          : overview(e, ph, positions, cands)}`;
    }, { n: 3, h: 120 });
  };
  function overview(e, ph, positions, cands) {
    const at = ORDER.indexOf(ph);
    const myCands = cands.filter((c) => c.user_id === kit.me()?.id);
    return `${ph === "nomination" && kit.membership(e.club_id) ? `<div class="alert purple"><span class="a-ic">${icon("userpen")}</span><div class="grow"><b>Nominations are open</b><p>Stand for a position until ${ui.dateTime(e.nomination_end)}.</p></div><button class="btn sm primary" id="el-nom">Stand for election</button></div>` : ""}
      ${myCands.length ? `<div class="alert blue mt-s"><span class="a-ic">${icon("info")}</span><div class="grow"><b>Your nomination${myCands.length > 1 ? "s" : ""}</b><p>${myCands.map((c) => `${esc(c.name)}: ${c.status}`).join(" · ")}</p></div></div>` : ""}
      ${ui.sec("Election Timeline")}<section class="card"><div class="cl-vtl">${PHASES.map(([k, label, a, b]) => { const i = ORDER.indexOf(k), done = at > i || ph === "applied", now = ph === k;
        return `<div><span class="dot ${done ? "done" : now ? "now" : ""}">${done ? icon("check") : ""}</span><span><b>${label}</b><span class="xs">${e[a] ? ui.dateShort(e[a]) : ""}${e[b] ? ` – ${ui.dateShort(e[b])}` : ""}</span></span>${ui.st(done ? ["Completed", "green"] : now ? ["Ongoing", "blue"] : ["Upcoming", "gray"])}</div>`; }).join("")}</div></section>
      ${ui.sec("Available Positions")}<div class="cl-list">${positions.map((p) => `<button class="cl-li" data-pos="${p.id}"><span class="itile sm purple">${icon("crown")}</span><span class="body"><b>${esc(p.name)}</b><span>${ui.plural(p.seats, "position")}</span></span><span class="end">${ui.plural(cands.filter((c) => c.position_id === p.id && c.status === "approved").length, "candidate")}</span>${icon("chevR", "sm")}</button>`).join("") || `<p class="small muted" style="padding:12px">No positions yet.</p>`}</div>`;
  }
  function candidatesTab(e, ph, positions, approved, voted, voting) {
    const p = positions.find((x) => x.id === pos);
    if (!p) return ui.emptyBox("users", "No positions yet", "");
    const list = approved.filter((c) => c.position_id === p.id);
    const canVote = ph === "voting" && !voted.has(p.id) && kit.membership(e.club_id);
    return `<div class="row nowrap" style="gap:8px;margin-bottom:12px">${ui.select("pos", positions.map((x) => [x.id, x.name]), pos, 'id="el-pos" aria-label="Position"')}<span class="cl-disclaimer">${icon("info", "sm")} ${ui.plural(p.seats, "seat")} · ${ui.plural(list.length, "candidate")}</span></div>
      ${voted.has(p.id) ? `<div class="alert green"><span class="a-ic">${icon("checkc")}</span><div><b>You've voted for ${esc(p.name)}</b><p>Your ballot is anonymous.</p></div></div>` : voting && ph !== "voting" ? `<div class="alert blue"><span class="a-ic">${icon("clock")}</span><div><b>Voting ${ORDER.indexOf(ph) < ORDER.indexOf("voting") ? `opens ${ui.dateTime(e.voting_start)}` : "has closed"}</b></div></div>` : ""}
      <div class="cl-cands mt-s">${list.map((c, i) => `<div class="cl-cand" data-cand="${c.id}"><span class="photo">${c.photo_url ? `<img src="${esc(c.photo_url)}" alt="">` : esc(ui.initials(c.name))}<span class="no">#P${String(i + 1).padStart(2, "0")}</span></span>
          <b>${esc(c.name)}</b><span class="xs">${esc([c.year_label, c.department].filter(Boolean).join(", "))}</span>${c.statement ? `<q>${esc(c.statement)}</q>` : ""}
          <button class="btn sm ghost" data-profile="${c.id}">View Profile</button>${canVote ? `<button class="btn sm primary" data-vote="${c.id}">Vote for This Candidate</button>` : ""}</div>`).join("") || `<p class="small muted">No approved candidates yet.</p>`}</div>
      <a class="cl-li card mt" href="#" data-ct="rules" style="border-radius:16px">${icon("file")}<span class="body"><b>Election Rules & Guidelines</b><span>Read the eligibility criteria, voting process and code of conduct before voting.</span></span>${icon("chevR")}</a>`;
  }
  function results(positions, cands, re, ph, manage) {
    if (!re.length) return ui.emptyBox("chart", ["results", "applied"].includes(ph) ? "No votes were cast" : "Results after voting closes", manage ? "As an organiser you see live counts once votes come in." : "Come back when voting ends.");
    return positions.map((p) => { const rows = re.filter((r) => r.position_id === p.id).sort((a, b) => b.votes - a.votes), total = rows.reduce((s, r) => s + r.votes, 0);
      return `<section class="card mt"><div class="card-h"><h2>${esc(p.name)}</h2><span class="xs">${rows[0]?.voters || 0} voters</span></div>${rows.map((r) => { const c = cands.find((x) => x.id === r.candidate_id), pct = total ? Math.round((r.votes / total) * 100) : 0;
        return `<div class="stack" style="gap:4px;margin:8px 0"><div class="row between"><b>${esc(c?.name || "Candidate")} ${r.elected ? ui.st(["Elected", "green"], "crown") : ""}</b><span class="xs">${r.votes} · ${pct}%</span></div><div class="cl-prog ${r.elected ? "green" : ""}"><i style="width:${pct}%"></i></div></div>`; }).join("")}</section>`; }).join("")
      + (manage && ph === "results" ? `<div class="alert purple mt"><span class="a-ic">${icon("crown")}</span><div class="grow"><b>Ready to hand over?</b><p>Applying the results gives the elected candidates their positions and moves the current committee to History.</p></div><button class="btn sm primary" id="el-apply">Apply results</button></div>` : "");
  }
  function managePanel(e, positions, cands, ph) {
    const roles = store.use(`club:roles:${e.club_id}`, () => api.roles(e.club_id), { ttl: 5 * 60e3 }).value || [];
    const pending = cands.filter((c) => c.status === "pending");
    return `<div class="row" style="gap:8px;flex-wrap:wrap">${e.status === "draft" ? `<button class="btn primary" id="el-pub">${icon("megaphone")} Publish election</button>` : ""}<button class="btn outline" id="el-edit">${icon("edit")} Edit dates & rules</button>
        ${e.status !== "applied" ? `<button class="btn ghost" id="el-cancel" style="color:var(--error)">Cancel election</button>` : ""}</div>
      ${ui.sec("Positions", `<button class="btn sm outline" id="el-addpos">${icon("plus", "sm")} Add position</button>`)}
      <div class="cl-list">${positions.map((p) => `<div class="cl-li"><span class="body"><b>${esc(p.name)}</b><span>${ui.plural(p.seats, "seat")} · winner becomes ${esc(roles.find((r) => r.id === p.role_id)?.name || "— (no position change)")}</span></span><button class="btn sm ghost" data-delpos="${p.id}" style="color:var(--error)">Remove</button></div>`).join("") || `<p class="small muted" style="padding:12px">Add the positions people can stand for.</p>`}</div>
      ${ui.sec(`Nominations to review (${pending.length})`)}
      <div class="cl-list">${pending.map((c) => `<div class="cl-li">${ui.ava(c.name, c.photo_url)}<span class="body"><b>${esc(c.name)}</b><span>${esc(positions.find((p) => p.id === c.position_id)?.name || "")} · “${esc(c.statement)}”</span></span>
          <button class="btn sm primary" data-ok="${c.id}">Approve</button><button class="btn sm ghost" data-no="${c.id}">Reject</button></div>`).join("") || `<p class="small muted" style="padding:12px">No nominations waiting.</p>`}</div>`;
  }
  pages["club/election"].mount = (el) => {
    kit.bindRetry(el);
    const id = kit.param("id"), e = store.peek(`club:election:${id}`); if (!e) return;
    const reload = () => store.invalidate(`club:election:${id}`, `club:epos:${id}`, `club:ecand:${id}`, `club:evoted:${id}`, `club:eres:${id}`, "me:elections:");
    kit.$$("[data-ct]", el).forEach((b) => b.addEventListener("click", (ev) => { ev.preventDefault(); ctab = b.dataset.ct; ctx.rerender(); }));
    kit.$$("[data-pos]", el).forEach((b) => b.addEventListener("click", () => { pos = b.dataset.pos; ctab = "candidates"; ctx.rerender(); }));
    kit.$("#el-pos", el)?.addEventListener("change", (ev) => { pos = ev.target.value; ctx.rerender(); });
    const positions = store.peek(`club:epos:${id}`) || [], cands = store.peek(`club:ecand:${id}`) || [];
    kit.$$("[data-profile]", el).forEach((b) => b.addEventListener("click", () => { const c = cands.find((x) => x.id === b.dataset.profile);
      ui.sheet(c.name, `<div class="row nowrap" style="gap:12px">${ui.ava(c.name, c.photo_url, "lg")}<div><b>${esc(c.name)}</b><p class="xs">${esc([c.year_label, c.department].filter(Boolean).join(", "))}</p></div></div>${c.statement ? `<p class="mt"><q>${esc(c.statement)}</q></p>` : ""}<h3 class="cl-sec" style="font-size:15px">Manifesto</h3><p style="color:var(--text-2)">${ui.rich(c.manifesto || "No manifesto.")}</p>`); }));
    kit.$$("[data-vote]", el).forEach((b) => b.addEventListener("click", () => { const c = cands.find((x) => x.id === b.dataset.vote), p = positions.find((x) => x.id === c.position_id);
      ui.confirm(`Vote for ${c.name}?`, `For ${esc(p.name)}. Your ballot is anonymous and can't be changed.`, "Cast my vote", async () => { await api.voteElection(p.id, [c.id]); reload(); kit.toast("Vote cast", "success"); }); }));
    kit.$("#el-nom", el)?.addEventListener("click", () => ui.sheet("Stand for election", `<form id="nm" class="stack">${ui.field("Position", ui.select("pos", positions.map((p) => [p.id, p.name]), pos))}
      ${ui.field("One-line statement", ui.input("st", "", 'required maxlength="200" placeholder="A more active, inclusive and impactful club for everyone."'))}
      ${ui.field("Manifesto", ui.area("mani", "", 'rows="6" maxlength="4000"'))}${ui.field("Year (shown on your card)", ui.input("yr", "", 'maxlength="20" placeholder="3rd Year, CSE"'))}
      <div id="cl-err"></div><button class="btn primary block">Submit nomination</button></form>`, (s) => kit.$("#nm", s).addEventListener("submit", async (ev) => {
      ev.preventDefault(); const f = ui.values(ev.target); try { await api.nominate(f.pos, f.st.trim(), f.mani || "", "", f.yr || ""); ctx.closeModal(); reload(); kit.toast("Nomination sent", "success", "The election organisers will review it."); } catch (err) { ui.fail(s, err.message); }
    })));
    kit.$("#el-apply", el)?.addEventListener("click", () => ui.confirm("Apply the results?", "Winners get their positions. The current committee is saved to History and moves to Senior Member.", "Apply results", async () => { const n = await api.applyElection(id); reload(); store.invalidate("me:clubs", "club:members:"); kit.toast(`${n} position(s) handed over`, "success"); }));
    kit.$("#el-pub", el)?.addEventListener("click", () => ui.confirm("Publish this election?", "Members will see it and can stand for election when nominations open.", "Publish", async () => { await api.saveElection({ id, status: "published" }); reload(); }));
    kit.$("#el-cancel", el)?.addEventListener("click", () => ui.confirm("Cancel this election?", "Votes so far are kept but no results are applied.", "Cancel election", async () => { await api.saveElection({ id, status: "cancelled" }); reload(); }, true));
    kit.$("#el-edit", el)?.addEventListener("click", () => editElection(e));
    kit.$("#el-addpos", el)?.addEventListener("click", () => { const roles = (store.peek(`club:roles:${e.club_id}`) || []).filter((r) => r.rank >= 2);
      ui.sheet("Add position", `<form id="ap" class="stack">${ui.field("Position", ui.input("name", "", 'required maxlength="60" placeholder="President"'))}${ui.field("Seats", '<input class="input" type="number" name="seats" min="1" max="20" value="1">')}
        ${ui.field("The winner becomes", ui.select("role", [["", "No change"], ...roles.map((r) => [r.id, r.name])], roles.find((r) => r.rank === 3)?.id || ""))}<button class="btn primary block">Add</button></form>`, (s) => kit.$("#ap", s).addEventListener("submit", async (ev) => {
        ev.preventDefault(); const f = ui.values(ev.target); try { await api.savePosition({ election_id: id, club_id: e.club_id, name: f.name.trim(), seats: Number(f.seats) || 1, role_id: f.role || null, sort: positions.length }); ctx.closeModal(); reload(); } catch (err) { kit.toast(err.message, "error"); }
      })); });
    kit.$$("[data-delpos]", el).forEach((b) => b.addEventListener("click", async () => { try { await api.deletePosition(b.dataset.delpos); reload(); } catch (err) { kit.toast(err.message, "error"); } }));
    kit.$$("[data-ok]", el).forEach((b) => b.addEventListener("click", async () => { try { await api.reviewCandidate(b.dataset.ok, true); reload(); } catch (err) { kit.toast(err.message, "error"); } }));
    kit.$$("[data-no]", el).forEach((b) => b.addEventListener("click", async () => { try { await api.reviewCandidate(b.dataset.no, false); reload(); } catch (err) { kit.toast(err.message, "error"); } }));
  };
}
