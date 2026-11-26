/* Offices & officers (#/offices): who to see at EWU's offices (Proctor, Deans, Registrar, Controller of Examinations,
   department offices…), where they sit and how to reach them, plus the proctor on duty today. Data: public/data/offices.json
   (built from ewubd.edu by scripts/offices.mjs); logic in offices.ts. */
import { searchOffices, onDuty, DAYS } from "./offices.ts";
import { DIRECTORY, blockById, floorLabel, parseRoom } from "./campus-data.js";

const MAIN_LINE = "09666775577";
const GROUPS = [["student", "For students"], ["dept", "Departments"], ["admin", "Administration"]];
const ICON = { "Proctor's Office": "shield", "Dean's Office": "school", "Registrar's Office": "file", "Controller of Examinations": "exam", "Students' Welfare (DSW)": "users", "Finance & Accounts": "wallet", "ICS (IT services)": "globe", Library: "library", "Medical Centre": "heart" };

export function install(ctx) {
  const { pages, icon, esc, $, $$ } = ctx;
  let data = null, loading = null, tab = "student", q = "";
  const wake = () => ["offices", "map"].includes(ctx.route()) && ctx.rerender();
  const load = () => loading || (loading = fetch("/data/offices.json").then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status)))).then((j) => { data = j; wake(); })
    .catch(() => { loading = null; data = { offices: [], duty: [], failed: true }; wake(); }));
  // Shared with the campus map: every office person (with their office name), so a searched room can show whose office it is.
  ctx.officeStaff = () => { if (!data && !loading) load(); return (data?.offices || []).flatMap((o) => o.people.map((p) => ({ name: p.name, roles: p.roles, room: p.room, ext: p.ext, email: p.email, photo: p.photo, office: o.name }))); };

  // Extensions dial through the main line: "tel:09666775577,256" waits for the call to connect, then dials 256.
  const tel = (ext) => { const e = String(ext || "").split(/[,/ ]/)[0].replace(/\D/g, ""); return e.length >= 3 && e.length <= 4 ? `tel:${MAIN_LINE},${e}` : e.length >= 10 ? `tel:${e}` : ""; };
  const where = (o) => { const i = DIRECTORY.findIndex((d) => d.name === o.map), d = DIRECTORY[i]; return d ? { i, text: `${blockById(d.block).name} · ${floorLabel(d.floor)}` } : null; };
  // A link when there's an href, plain text otherwise (never href="", which reloads the app).
  const chipL = (href, ic, text, label = "") => href ? `<a class="of-chip" href="${href}"${label ? ` aria-label="${esc(label)}"` : ""}>${icon(ic, "sm")} ${text}</a>` : `<span class="of-chip">${icon(ic, "sm")} ${text}</span>`;

  const contact = (p) => {
    const t = tel(p.ext || p.phone), room = parseRoom(String(p.room || "").split(/[,/]/)[0]);
    return `<div class="of-acts">${p.room ? chipL(room ? `#/map?to=${encodeURIComponent(room.code)}` : "", "pin", room ? `Room ${esc(p.room)}` : esc(p.room), room ? `Directions to room ${p.room}` : "") : ""}
      ${p.ext || p.phone ? chipL(t, "phone", p.ext ? `Ext ${esc(p.ext)}` : esc(p.phone), p.ext ? `Call extension ${p.ext}` : "") : ""}
      ${p.email ? chipL(`mailto:${esc(p.email)}`, "mail", `<span class="ellipsis">${esc(p.email)}</span>`, `Email ${p.name}`) : ""}</div>`;
  };
  // Initials, with the person's official photo on top when the office page had one (it falls back to the initials if it fails to load).
  const avatar = (name, photo, cls = "sm") => `<span class="avatar face ${cls}" style="background:${ctx.colorFor(name)}" aria-hidden="true">${esc(ctx.initials(String(name).replace(/^(Professor|Prof\.|Dr\.|Mr\.|Ms\.|Mrs\.|Air Cdre \(Retd\))\s*/gi, "")))}${photo ? `<img src="${esc(photo)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}</span>`;
  const nn = (s) => String(s || "").toLowerCase().replace(/[.,]/g, " ").replace(/\b(dr|mr|mrs|ms|prof|professor|engr|md)\b/g, " ").replace(/\s+/g, " ").trim();
  let photoByName = null; // every office person's photo, keyed by normalised name, for the duty roster (which has no photo of its own)
  const photoFor = (name) => (photoByName = photoByName || new Map(data.offices.flatMap((o) => o.people).filter((p) => p.photo).map((p) => [nn(p.name), p.photo]))).get(nn(name)) || "";
  const person = (p) => `<li class="of-p">${avatar(p.name, p.photo)}
      <div class="min0 grow"><b>${esc(p.name)}</b><span class="xs">${esc(p.roles.filter((r) => r.length < 90).slice(0, 2).join(" · "))}</span>${contact(p)}</div></li>`;
  const office = (o, open) => {
    const w = where(o);
    return `<details class="card of-card" ${open ? "open" : ""}><summary><span class="itile ${o.group === "dept" ? "blue" : o.group === "admin" ? "purple" : "orange"}">${icon(ICON[o.name] || (o.group === "dept" ? "building" : "briefcase"))}</span>
        <span class="min0 grow"><b>${esc(o.name)}</b><span class="xs">${w ? esc(w.text) : `${o.people.length} ${o.people.length === 1 ? "person" : "people"}`}</span></span>${icon("chevD", "of-chev")}</summary>
      <p class="small muted">${esc(o.help)}</p>
      ${w ? `<a class="btn sm outline mt-s" href="#/map?to=dir:${w.i}">${icon("map", "sm")} Directions to the office</a>` : ""}
      <ul class="of-people">${o.people.map(person).join("")}</ul>
      <a class="xs lnk" href="https://www.ewubd.edu/${esc(o.path)}" target="_blank" rel="noopener">On ewubd.edu ${icon("external", "sm")}</a></details>`;
  };
  const list = () => {
    const found = searchOffices(data.offices, q), shown = q ? found : found.filter((o) => o.group === tab);
    const mine = String(ctx.S.profile?.department || "").toLowerCase();
    shown.sort((a, b) => (b.dept && mine && b.dept.toLowerCase().startsWith(mine)) - (a.dept && mine && a.dept.toLowerCase().startsWith(mine)));
    return shown.length ? shown.map((o, i) => office(o, !!q || (i === 0 && tab !== "admin"))).join("")
      : `<div class="card">${ctx.empty("icon:search", "No office or officer matches", `Try "proctor", "transcript", a name or a room number.`)}</div>`;
  };
  const dutyCard = () => {
    const d = onDuty(data.duty), proctor = data.offices.find((o) => o.name === "Proctor's Office")?.people[0];
    const who = d && !/proxy/i.test(d.name) ? d : null;
    return `<section class="card of-duty"><div class="card-h"><h2>${icon("shield", "sm")} Proctor on duty today</h2>${data.term ? `<span class="pill">${esc(data.term.replace("-", " "))}</span>` : ""}</div>
      ${who ? `<div class="of-p">${avatar(who.name, who.photo || photoFor(who.name), "")}<div class="min0 grow"><b>${esc(who.name)}</b><span class="xs">Assistant Proctor · ${esc(who.about)}</span>${contact({ ...who, phone: "" })}</div></div>`
        : `<p class="small">${d ? "Today the Proctor's Office covers duty (proxy)." : `No assistant proctor is rostered on ${DAYS[new Date().getDay()]}.`} For an emergency contact the Proctor's Office${proctor ? `: ${esc(proctor.name)}` : ""}.</p>${proctor ? contact(proctor) : ""}`}
      ${data.duty.length ? `<details class="mt-s"><summary class="xs lnk">Whole week's roster</summary><ul class="of-week">${data.duty.map((x) => `<li${x.day === new Date().getDay() ? ' class="on"' : ""}><b>${DAYS[x.day].slice(0, 3)}</b><span class="min0">${esc(/proxy/i.test(x.name) ? "Proctor's Office (proxy)" : x.name)}</span><span class="xs num">Rm ${esc(x.room)}</span></li>`).join("")}</ul></details>` : ""}</section>`;
  };

  pages.offices = () => {
    const qp = ctx.qparam("q"); if (qp) { q = qp; history.replaceState(null, "", "#/offices"); }
    const head = ctx.subHead("Offices & Officers", "Proctor, Deans, Registrar and every office", "#/more");
    if (!data) { load(); return `${head}<div class="card">${ctx.empty("icon:building", "Loading EWU's offices…", "Names, rooms, extensions and emails.")}</div>`; }
    if (data.failed) return `${head}<div class="card">${ctx.empty("icon:cloudoff", "Couldn't load the offices", "Check your connection, then try again.", `<button class="btn primary" id="of-retry">${icon("sync")} Try again</button>`)}</div>`;
    return `${head}<div style="max-width:860px;margin:0 auto">${dutyCard()}
      <div class="searchbar mt">${icon("search")}<input class="input" id="of-q" type="search" value="${esc(q)}" placeholder="Search: proctor, transcript, a name, room 629" aria-label="Search offices and officers"></div>
      <div class="mt" id="of-tabs" ${q ? "hidden" : ""}>${ctx.seg(GROUPS, tab, "data-oft")}</div>
      <div class="mt stack" id="of-list">${list()}</div>
      <p class="xs mt">From EWU's office pages on ewubd.edu (checked ${esc(data.at || "")}). Extensions dial through the main line ${MAIN_LINE}. Unofficial · not affiliated with EWU.</p></div>`;
  };
  pages.offices.mount = (el) => {
    $("#of-retry", el)?.addEventListener("click", () => { data = null; ctx.rerender(); });
    if (!data || data.failed) return;
    $$("[data-oft]", el).forEach((b) => b.addEventListener("click", () => { tab = b.dataset.oft; ctx.rerender(); }));
    let t;
    $("#of-q", el)?.addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { q = e.target.value; $("#of-list", el).innerHTML = list(); $("#of-tabs", el).hidden = !!q; }, 150); });
  };
}
