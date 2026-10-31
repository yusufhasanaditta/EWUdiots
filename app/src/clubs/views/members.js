/* Members (#/club/members?c=), a member's profile (#/club/member?c=&u=) and the Executive Committee with its
   handover (#/club/committee?c=&tab=). From the "Member Management" and "Executive Handover" boards.
   Positions: the Club Admin (and anyone with members.promote) gives President, Vice President, General Secretary,
   Treasurer, Executive Member, Merch Manager… The list only offers positions below your own, with permissions you
   hold (perms.assignableRoles); public.set_member_role enforces the same. */
import { assignableRoles, RANK_GROUPS, rankTone } from "../perms.js";

const HANDOVER_ITEMS = ["Transfer ongoing projects and tasks", "Submit financial reports and receipts", "Share event files and design assets", "Hand over social media accounts", "Update member list and contact info", "Write final report and recommendations"];

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store, ctx } = kit;
  const cid = () => kit.param("c") || "";
  const clubE = (id) => store.use(`clubid:${id}`, () => api.clubById(id), { ttl: 2 * 60e3 });
  const membersE = (id) => store.use(`club:members:${id}`, () => api.members(id), { ttl: 45e3 });
  const rolesE = (id) => store.use(`club:roles:${id}`, () => api.roles(id), { ttl: 5 * 60e3 });
  let q = "", grp = "all", dept = "", batch = "", role = "", status = "active";

  /* ═════════ Directory ═════════ */
  pages["club/members"] = () => {
    const id = cid(), g = kit.memberGate(id, "the member directory"); if (g) return g;
    const club = clubE(id).value, me = membersE(id);
    const total = (me.value || []).filter((r) => r.status === "active").length;
    return `${kit.back(`#/club/space?c=${id}`, club?.short_name || club?.name || "Club")}
      ${ui.ph("Club Members", "", `<span class="cl-disclaimer">${icon("users", "sm")} ${ui.plural(total, "Member")}</span>`)}
      <div class="row nowrap" style="gap:8px"><div class="searchbar cl-search grow">${icon("search")}<input class="input" id="mb-q" type="search" placeholder="Search members by name, department, batch…" value="${esc(q)}" autocomplete="off"></div>${kit.can(id, "members.invite") ? `<a class="cl-sqbtn" href="#/club/manage?c=${id}&tab=invites" aria-label="Invite members" title="Invite members">${icon("userpen")}</a>` : ""}</div>
      <nav class="cl-seg mt-s">${[["all", "All Members"], ["exec", "Executives"], ["senior", "Senior Members"], ["general", "General Members"]].map(([v, l]) => `<button data-g="${v}" aria-pressed="${grp === v}">${l}</button>`).join("")}</nav>
      ${ui.view(me, (rows) => {
        const depts = [...new Set(rows.map((r) => r.department).filter(Boolean))].sort(), batches = [...new Set(rows.map((r) => r.batch).filter(Boolean))].sort();
        const words = q.toLowerCase().split(/\s+/).filter(Boolean);
        const list = rows.filter((r) => (status === "all" || r.status === status) && (grp === "all" || (grp === "exec" ? r.rank <= 4 : grp === "senior" ? r.rank === 6 : r.rank >= 5 && r.rank !== 6))
          && (!dept || r.department === dept) && (!batch || r.batch === batch) && (!role || r.role_name === role)
          && (!words.length || words.every((w) => `${r.display_name} ${r.department} ${r.batch} ${r.role_name} ${r.title} ${r.wing}`.toLowerCase().includes(w))));
        const roles = [...new Set(rows.map((r) => r.role_name).filter(Boolean))];
        return `<div class="cl-filters">
            ${ui.select("dept", [["", "Department"], ...depts.map((d) => [d, d])], dept, 'id="mb-dept" aria-label="Department"')}
            ${ui.select("batch", [["", "Batch"], ...batches.map((b) => [b, `Batch ${b}`])], batch, 'id="mb-batch" aria-label="Batch"')}
            ${ui.select("role", [["", "Role"], ...roles.map((x) => [x, x])], role, 'id="mb-role" aria-label="Role"')}
            ${ui.select("status", [["active", "Status"], ["alumni", "Club alumni"], ["all", "Everyone"]], status, 'id="mb-status" aria-label="Status"')}</div>
          ${list.length ? `<div class="cl-list">${list.map((r) => `<a class="cl-li" href="#/club/member?c=${id}&u=${r.user_id}">${ui.ava(r.display_name, r.photo_url)}
            <span class="body"><b>${esc(r.display_name || "Member")}</b><span>${esc([r.department, r.batch && `Batch ${r.batch}`, r.wing && `${r.wing} wing`].filter(Boolean).join(" · ") || "Member")}</span></span>
            <span class="end">${ui.rolePill(r.rank, r.title || r.role_name)}</span><span class="cl-more" aria-hidden="true">${icon("more")}</span></a>`).join("")}</div>` : ui.emptyBox("users", "No one matches", "Try other filters.")}`;
      }, { n: 6, h: 64 })}`;
  };
  pages["club/members"].mount = (el) => {
    kit.bindRetry(el);
    const input = kit.$("#mb-q", el);
    input?.addEventListener("input", () => { q = input.value; const pos = input.selectionStart; ctx.rerender(); const i = kit.$("#mb-q"); if (i) { i.focus(); i.setSelectionRange(pos, pos); } });
    kit.$$("[data-g]", el).forEach((b) => b.addEventListener("click", () => { grp = b.dataset.g; ctx.rerender(); }));
    kit.$("#mb-dept", el)?.addEventListener("change", (e) => { dept = e.target.value; ctx.rerender(); });
    kit.$("#mb-batch", el)?.addEventListener("change", (e) => { batch = e.target.value; ctx.rerender(); });
    kit.$("#mb-role", el)?.addEventListener("change", (e) => { role = e.target.value; ctx.rerender(); });
    kit.$("#mb-status", el)?.addEventListener("change", (e) => { status = e.target.value; ctx.rerender(); });
  };

  /* ═════════ A member ═════════ */
  let mtab = "overview";
  pages["club/member"] = () => {
    const id = cid(), u = kit.param("u"), g = kit.memberGate(id, "member profiles"); if (g) return g;
    const de = store.use(`club:member:${id}:${u}`, () => api.memberDetail(id, u), { ttl: 45e3 });
    const self = u === kit.me()?.id;
    return kit.back(`#/club/members?c=${id}`, "Club members") + ui.view(de, (m) => {
      const soc = Object.entries(m.socials || {}).map(([k, v]) => `<a href="${esc(v)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(k)}">${icon(k === "linkedin" ? "linkedin" : k === "github" ? "github" : "link", "sm")}</a>`).join(" ");
      const canNotes = kit.can(id, "members.promote");
      const tabs = [["overview", "Overview"], ["activity", "Activity"], ...(canNotes ? [["notes", "Notes"]] : [])];
      return `<section class="cl-greet" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">${ui.ava(m.display_name, m.photo_url, "xl")}
          <div class="min0 grow"><h1 style="margin:0">${esc(m.display_name)}${m.rank <= 3 ? ` ${icon("crown", "sm")}` : ""}</h1>
            <p class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap"><span class="cl-role t-${rankTone(m.rank)}" style="background:rgba(255,255,255,.2);color:#fff">${esc(m.title || m.role_name)}</span><span class="st green">${icon("checkc")} ${m.status === "active" ? "Active member" : "Club alumni"}</span></p>
            <p style="margin-top:8px">${esc([m.department, m.student_id && m.student_id.slice(0, 4) && `Batch ${m.student_id.slice(0, 4)}`].filter(Boolean).join(" · "))}</p>
            ${m.email ? `<p style="margin-top:4px">${icon("mail", "sm")} ${esc(m.email)}</p>` : ""}</div></section>
        <div class="cl-stats c4">${ui.stat("calendar", "purple", m.events || 0, "Events joined")}${ui.stat("layers", "blue", m.projects || 0, "Projects")}${ui.stat("award", "amber", Math.max(0, new Date().getFullYear() - new Date(m.joined_at).getFullYear()) || "<1", "Years in club")}${ui.stat("checkc", "green", m.attendance_pct == null ? "–" : `${m.attendance_pct}%`, "Attendance")}</div>
        <nav class="cl-seg">${tabs.map(([v, l]) => `<button data-mt="${v}" aria-pressed="${mtab === v}">${l}</button>`).join("")}</nav>
        ${mtab === "activity" ? activity(m) : mtab === "notes" && canNotes ? notes(id, u) : overview(m, soc, self)}
        <div class="cl-actions3">
          ${!self ? `<button class="btn outline" id="mb-dm">${icon("chat")} Message</button>` : `<button class="btn outline" id="mb-edit">${icon("edit")} Edit my club profile</button>`}
          ${!self && kit.can(id, "members.promote") ? `<button class="btn outline" id="mb-role">${icon("userpen")} Assign Role</button>` : ""}
          ${!self && kit.can(id, "members.remove") ? `<button class="btn outline danger-line" id="mb-remove">${icon("trash")} Remove</button>` : ""}</div>`;
    }, { n: 3, h: 110 });
  };
  const overview = (m, soc, self) => `<section class="card"><div class="card-h"><h2>About</h2>${self ? `<button class="btn sm ghost" id="mb-edit2">${icon("edit", "sm")} Edit</button>` : ""}</div>
      <p style="color:var(--text-2)">${m.bio ? ui.rich(m.bio) : `<i>${self ? "Tell your club about yourself." : "No bio yet."}</i>`}</p>
      <div class="cl-facts">${[["building", "Department", m.department || "—"], ["calendar", "Batch", m.student_id?.slice(0, 4) || "—"], ["user", "Position", m.title || m.role_name], ["clock", "Join date", ui.dateLong(m.joined_at)], ["checkc", "Status", m.status === "active" ? "Active" : "Alumni"], ["layers", "Wing", m.wing || "—"]]
        .map(([ic, l, v]) => `<div class="cl-fact">${icon(ic)}<div><span>${l}</span><b>${esc(v)}</b></div></div>`).join("")}</div>
      ${m.skills?.length ? `<h3 class="cl-sec" style="font-size:15px;margin-top:6px">Skills & Interests</h3><div class="chips">${m.skills.map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</div>` : ""}
      ${soc ? `<p class="row mt-s" style="gap:10px">${soc}</p>` : ""}</section>`;
  const activity = (m) => (m.activity?.length ? `<div class="cl-list">${m.activity.map((a) => `<div class="cl-li"><span class="itile sm ${a.k === "task" ? "orange" : a.k === "post" ? "pink" : "purple"}">${icon(a.k === "task" ? "checksq" : a.k === "post" ? "megaphone" : "calendar")}</span>
      <span class="body"><b>${esc(a.k === "task" ? `Completed: ${a.title}` : a.k === "post" ? `Posted: ${a.title}` : `Attended: ${a.title}`)}</b><span>${a.at ? ui.dateLong(a.at) : ""}</span></span>${ui.st([a.k === "task" ? "Task" : a.k === "post" ? "Post" : "Event", a.k === "task" ? "amber" : a.k === "post" ? "purple" : "blue"])}</div>`).join("")}</div>`
    : ui.emptyBox("clock", "No activity yet", "Attendance, finished tasks and posts show here."));
  function notes(id, u) {
    const ne = store.use(`club:notes:${id}:${u}`, () => api.memberNotes(id, u), { ttl: 30e3 });
    return `<form id="mb-note" class="row nowrap" style="gap:8px;margin-bottom:10px">${ui.input("b", "", 'placeholder="Private note for organisers (not shown to the member)" maxlength="1000" style="flex:1"')}<button class="btn primary">Add</button></form>
      ${ui.view(ne, (rows) => (rows.length ? `<div class="cl-list">${rows.map((n) => `<div class="cl-li"><span class="body"><b style="font-weight:500">${ui.rich(n.body)}</b><span>${esc(n.author_name || "Organiser")} · ${ui.ago(n.created_at)}</span></span></div>`).join("")}</div>` : `<p class="small muted">No notes.</p>`))}`;
  }
  pages["club/member"].mount = (el) => {
    kit.bindRetry(el);
    const id = cid(), u = kit.param("u"), m = store.peek(`club:member:${id}:${u}`); if (!m) return;
    kit.$$("[data-mt]", el).forEach((b) => b.addEventListener("click", () => { mtab = b.dataset.mt; ctx.rerender(); }));
    kit.$("#mb-dm", el)?.addEventListener("click", async () => { try { kit.go(`#/club/chat?id=${await api.openDm(id, u)}`); } catch (e) { kit.toast(e.message, "error"); } });
    [kit.$("#mb-edit", el), kit.$("#mb-edit2", el)].forEach((b) => b?.addEventListener("click", () => editProfile(id, m)));
    kit.$("#mb-role", el)?.addEventListener("click", () => assignRole(id, m));
    kit.$("#mb-remove", el)?.addEventListener("click", () => ui.confirm(`Remove ${m.display_name}?`, "They lose access to the workspace. Their past messages stay.", "Remove", async () => { await api.setMemberRole(id, u, { status: "removed" }); store.invalidate(`club:member:${id}`, `club:members:${id}`); kit.go(`#/club/members?c=${id}`); }, true));
    kit.$("#mb-note", el)?.addEventListener("submit", async (e) => { e.preventDefault(); const b = String(new FormData(e.target).get("b") || "").trim(); if (!b) return; try { await api.addMemberNote(id, u, b); store.invalidate(`club:notes:${id}:${u}`); } catch (err) { kit.toast(err.message, "error"); } });
  };

  /** Give a position (role), title and wing. Only roles you may hand out are listed. */
  function assignRole(id, m) {
    const roles = rolesE(id).value || [], my = kit.membership(id) || (kit.isPlatform() ? { rank: 1, perms: ["*"] } : null);
    const can = assignableRoles(my, roles);
    if (!can.length) return kit.toast("There's no position you can give", "info");
    const club = clubE(id).value;
    ui.sheet(`Position for ${m.display_name}`, `<form id="ar" class="stack">
      ${ui.field("Position", `<select class="select" name="role">${Object.entries(can.reduce((g, r) => { (g[r.rank] ||= []).push(r); return g; }, {})).map(([rk, rs]) => `<optgroup label="${RANK_GROUPS[rk] || `Rank ${rk}`}">${rs.map((r) => `<option value="${r.id}" ${r.id === m.role_id ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</optgroup>`).join("")}</select>`, "Each position comes with its permissions. Change them in Manage → Roles.")}
      ${ui.field("Title shown on the profile (optional)", ui.input("title", m.title, 'maxlength="60" placeholder="Head of PR, Event & Program Head…"'))}
      ${club?.wings?.length ? ui.field("Wing", ui.select("wing", [["", "No wing"], ...club.wings.map((w) => [w, w])], m.wing)) : ""}
      <div id="cl-err"></div><button class="btn primary block">${icon("check")} Save</button></form>`, (s) => kit.$("#ar", s).addEventListener("submit", async (e) => {
      e.preventDefault(); const f = ui.values(e.target), btn = e.target.querySelector("button.primary"); ctx.busy(btn, true, "Saving…");
      try { await api.setMemberRole(id, m.user_id, { role: f.role, title: String(f.title || "").trim(), wing: f.wing ?? null }); ctx.closeModal(); store.invalidate(`club:member:${id}`, `club:members:${id}`); kit.toast("Position saved", "success", "They get a notification."); }
      catch (err) { ctx.busy(btn, false); ui.fail(s, err.message); }
    }));
  }
  /** A member's own club profile: bio, skills, links, photo, privacy. */
  function editProfile(id, m) {
    ui.sheet("My club profile", `<form id="ep" class="stack">
      ${ui.field("Name shown in the club", ui.input("display_name", m.display_name, 'maxlength="80"'))}
      ${ui.field("Department", ui.input("department", m.department, 'maxlength="60" placeholder="CSE"'))}
      ${ui.field("About me", ui.area("bio", m.bio, 'maxlength="600" rows="3"'))}
      ${ui.field("Skills (comma separated)", ui.input("skills", (m.skills || []).join(", "), 'maxlength="300" placeholder="Web development, Public speaking"'))}
      ${["linkedin", "github", "website"].map((k) => ui.field(k === "website" ? "Portfolio / website" : k[0].toUpperCase() + k.slice(1), ui.input(k, m.socials?.[k] || "", `type="url" placeholder="https://"`))).join("")}
      <div class="row" style="gap:10px;align-items:center">${ui.ava(m.display_name, m.photo_url, "lg")}<button type="button" class="btn outline" id="ep-photo">${icon("image")} Change photo</button></div>
      <div id="cl-err"></div><button class="btn primary block">${icon("check")} Save</button><a class="small" href="#/club/privacy">Privacy: who can see this →</a></form>`, (s) => {
      let photo = m.photo_url;
      kit.$("#ep-photo", s).addEventListener("click", async () => {
        const f = await ui.pickFile("image/*"); if (!f) return;
        try { photo = await api.uploadPublic(id, await ui.shrink(f, 640), `people/${kit.me().id}`); s.querySelector(".cl-ava").innerHTML = `<img src="${esc(photo)}" alt="">`; } catch (e) { ui.fail(s, e.message); }
      });
      kit.$("#ep", s).addEventListener("submit", async (e) => {
        e.preventDefault(); const f = ui.values(e.target), btn = e.target.querySelector("button.primary"); ctx.busy(btn, true, "Saving…");
        const socials = Object.fromEntries(["linkedin", "github", "website"].map((k) => [k, String(f[k] || "").trim()]).filter(([, v]) => /^https:\/\//.test(v)));
        try {
          await api.updateMyProfile(id, { display_name: f.display_name, department: f.department, bio: f.bio, skills: String(f.skills || "").split(",").map((x) => x.trim()).filter(Boolean), socials, photo_url: photo });
          ctx.closeModal(); store.invalidate(`club:member:${id}`, `club:members:${id}`); kit.toast("Profile saved", "success");
        } catch (err) { ctx.busy(btn, false); ui.fail(s, err.message); }
      });
    });
  }

  /* ═════════ Executive Committee + handover ═════════ */
  pages["club/committee"] = () => {
    const id = cid(); if (!id) return ui.emptyBox("users", "Choose a club", "");
    const club = clubE(id).value, t = kit.param("tab") || "current", inner = kit.membership(id)?.rank <= 4 || kit.isPlatform();
    const ce = store.use(`club:committee:${id}`, () => api.committee(id), { ttl: 60e3 });
    const te = store.use(`club:terms:${id}`, () => api.terms(id), { ttl: 5 * 60e3 });
    const year = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1, label = `${year} - ${year + 1}`;
    const edit = kit.can(id, "settings.edit") || kit.isPlatform();
    const tabs = [["current", "Current Committee"], ["previous", "Previous Committees"], ...(inner ? [["handover", "Handover"]] : [])];
    return `${kit.back(club ? `#/club/c?slug=${encodeURIComponent(club.slug)}` : "#/club/explore", club?.name || "Club")}
      ${ui.ph("Executive Committee", "Meet the current team and explore past committees", `<span class="cl-disclaimer">${label}</span>`)}
      ${ui.seg(tabs, t, (v) => `#/club/committee?c=${id}&tab=${v}`)}
      ${t === "previous" ? (edit ? `<button class="btn primary mt" id="term-add">${icon("plus", "sm")} Add a past committee</button>` : "") + ui.view(te, (rows) => (rows.length ? rows.map((x) => `<section class="card mt"><div class="row between nowrap" style="gap:8px"><h2 class="min0">${esc(x.label)}</h2>${edit ? `<span class="row nowrap" style="gap:4px"><button class="btn sm ghost" data-term="${x.id}">${icon("edit", "sm")} Edit</button><button class="btn sm ghost" data-tdel="${x.id}" aria-label="Delete ${esc(x.label)}">${icon("trash", "sm")}</button></span>` : ""}</div><div class="cl-list mt-s">${(x.committee || []).map((p) => `<div class="cl-li">${ui.ava(p.name, "", "sm")}<span class="body"><b>${esc(p.name)}</b><span>${esc(p.title || p.role)}</span></span></div>`).join("")}</div></section>`).join("")
          : ui.emptyBox("clock", "No past committees yet", "When the club hands over to a new committee, the old one is kept here.")))
        : t === "handover" && inner ? handover(id)
        : `<section class="cl-banner" style="min-height:120px;text-align:center;justify-items:center"><h2>Executive Committee</h2><h2 style="color:var(--lime)">${label}</h2><p style="opacity:.9">Lead · Collaborate · Create Impact</p></section>
          ${ui.view(ce, (rows) => (rows.length ? `<div class="cl-pcards mt">${rows.filter((r) => r.rank >= 2).map((r) => `<div class="cl-pcard"><span class="photo">${r.photo_url ? `<img src="${esc(r.photo_url)}" alt="" loading="lazy">` : esc(ui.initials(r.display_name))}</span>
              <b>${esc(r.display_name)}</b>${ui.rolePill(r.rank, r.title || r.role_name)}<span class="xs">${esc(r.department || "")}</span>
              <span class="soc">${Object.entries(r.socials || {}).map(([k, v]) => `<a href="${esc(v)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(k)}">${icon(k === "linkedin" ? "linkedin" : k === "github" ? "github" : "link", "sm")}</a>`).join("")}</span></div>`).join("")}</div>`
            : ui.emptyBox("users", "No committee listed yet", "The club admin adds the committee by giving members their positions.")), { n: 3, h: 160 })}`}`;
  };
  function handover(id) {
    const he = store.use(`club:handover:${id}`, () => api.handovers(id), { ttl: 60e3 });
    return ui.view(he, (rows) => {
      const h = rows[0];
      if (!h) return ui.emptyBox("sync", "Plan the handover", "A checklist for passing the club to the next committee.", `<button class="btn primary" id="ho-start">${icon("plus")} Start a handover checklist</button>`);
      const items = h.items || [], done = items.reduce((s, i) => s + Math.min(i.done || 0, i.total || 1), 0), total = items.reduce((s, i) => s + (i.total || 1), 0), pct = total ? Math.round((done / total) * 100) : 0;
      return `<section class="cl-banner" style="grid-template-columns:1fr auto;align-items:center"><div><h2>From One Chapter to the Next</h2><p style="opacity:.9">Preserve progress. Empower the future.</p></div>
          <div class="card" style="color:var(--text);min-width:150px"><b class="xs">Handover progress</b><b style="font-size:26px;display:block">${pct}%</b><div class="cl-prog green"><i style="width:${pct}%"></i></div><span class="xs">${done} of ${total} items</span></div></section>
        ${ui.sec(`Handover Checklist · ${esc(h.label)}`)}
        <div class="cl-list">${items.map((it, i) => { const st = (it.done || 0) >= (it.total || 1) ? ["Completed", "green"] : (it.done || 0) > 0 ? ["In progress", "amber"] : ["Pending", "red"];
          return `<div class="cl-li"><span class="itile sm ${st[1] === "green" ? "green" : "orange"}">${icon(st[1] === "green" ? "checkc" : "clock")}</span><span class="body"><b>${esc(it.title)}</b></span>
            <span class="row nowrap" style="gap:6px"><button class="btn sm ghost" data-ho="${i}" data-d="-1" aria-label="Less done">−</button><b class="xs">${it.done || 0}/${it.total || 1}</b><button class="btn sm ghost" data-ho="${i}" data-d="1" aria-label="More done">+</button></span>${ui.st(st)}</div>`; }).join("")}</div>
        <p class="xs mt">When everything's ready, the Club Admin hands over in Manage → Handover (new positions for the incoming committee; the outgoing one moves to History).</p>`;
    });
  }
  pages["club/committee"].mount = (el) => {
    kit.bindRetry(el);
    const id = cid();
    // Past committees by hand: label, end date and one "Name, Position" per line.
    const termForm = (x) => kit.ctx.openModal(kit.ctx.modalHead(x ? "Edit past committee" : "Add a past committee") + `<form id="tf" class="stack">
        <div class="grid g2"><label class="field">Term<input class="input" name="label" required minlength="2" maxlength="40" placeholder="2024 - 2025" value="${esc(x?.label || "")}"></label>
          <label class="field">Ended on<input class="input" type="date" name="ended_on" required value="${esc(x?.ended_on || new Date().toISOString().slice(0, 10))}"></label></div>
        <label class="field">Committee (one per line: Name, Position)<textarea class="input" name="list" rows="8" placeholder="Rafi Ahmed, President&#10;Nusrat Jahan, General Secretary">${esc((x?.committee || []).map((p) => `${p.name}, ${p.title || p.role || ""}`).join("\n"))}</textarea></label>
        <button class="btn primary block">${icon("check", "sm")} Save</button></form>`, (m) => kit.$("#tf", m).addEventListener("submit", async (e) => {
        e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
        const committee = String(f.list).split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [name, ...r] = l.split(","); return { name: name.trim().slice(0, 80), title: r.join(",").trim().slice(0, 60), role: r.join(",").trim().slice(0, 60) }; });
        if (!committee.length) return kit.toast("Add at least one person", "error");
        try { await api.saveTerm({ ...(x ? { id: x.id } : { club_id: id }), label: f.label.trim(), ended_on: f.ended_on, committee }); kit.ctx.closeModal(); store.invalidate(`club:terms:${id}`); kit.toast("Saved", "success"); } catch (err) { kit.toast(err.message, "error"); }
      }));
    kit.$("#term-add", el)?.addEventListener("click", () => termForm(null));
    kit.$$("[data-term]", el).forEach((b) => b.addEventListener("click", () => termForm((store.peek(`club:terms:${id}`) || []).find((x) => x.id === b.dataset.term))));
    kit.$$("[data-tdel]", el).forEach((b) => b.addEventListener("click", () => kit.ctx.confirmModal("Delete this past committee?", "It disappears from the club's history.", "Delete", async () => { try { await api.deleteTerm(b.dataset.tdel); store.invalidate(`club:terms:${id}`); } catch (err) { kit.toast(err.message, "error"); } }, true)));
    kit.$("#ho-start", el)?.addEventListener("click", async () => {
      const year = new Date().getFullYear(), items = HANDOVER_ITEMS.map((title) => ({ title, done: 0, total: 1 }));
      try { await api.saveHandover({ club_id: id, label: `${year} → ${year + 1}`, items }); store.invalidate(`club:handover:${id}`); } catch (e) { kit.toast(e.message, "error"); }
    });
    kit.$$("[data-ho]", el).forEach((b) => b.addEventListener("click", async () => {
      const h = (store.peek(`club:handover:${id}`) || [])[0]; if (!h) return;
      const items = h.items.map((it, i) => (i === Number(b.dataset.ho) ? { ...it, done: Math.max(0, Math.min(it.total || 1, (it.done || 0) + Number(b.dataset.d))) } : it));
      try { await api.saveHandover({ id: h.id, items }); store.invalidate(`club:handover:${id}`); } catch (e) { kit.toast(e.message, "error"); }
    }));
  };
}
