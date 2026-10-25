/* Campus Map: 3D (or 2D) EWU campus, room search + turn-by-turn route, walk / guided tour, places directory,
   and the "Campus data" editor where anyone can add rooms and upload floor plans (kept on the device; exportable). */
import { BLOCKS, COURTYARD, DIRECTORY, ROOMS, CLUBS, LIBRARY_HOURS, CONF, blockById, floorsOf, floorLabel, floorShort, resolveRoom, parseRoom, libraryOpen } from "./campus-data.js";
import { route as findRoute, fmtWalk } from "./campus-nav.js";
import { getBlob, setBlob, delBlob, keysBlob, fileToDataURL } from "./blobstore.js";

export function install(ctx) {
  const { pages, icon, esc, $, $$, toast, openModal, closeModal, modalHead, confirmModal } = ctx;
  const S = () => ctx.S;
  const C = () => (S().campus = S().campus || { rooms: [], from: "E1" });
  let team = { rooms: [], plans: {} }; // shipped with the app in /campus/overrides.json
  const shared = () => [...ctx.content.data.rooms, ...team.rooms];
  const userRooms = () => [...C().rooms.map((r) => ({ ...r, conf: "user" })), ...shared().map((r) => ({ ...r, conf: r.conf || "verified", source: r.source || "EWUdiots campus team" }))];
  const where = (code) => resolveRoom(code, userRooms());
  const plans = new Map(); // "CS|5" → data URL or /campus/… path
  const planKey = (b, f) => `${b}|${f}`;
  const localPlans = new Set();
  let plansLoaded = false, plansP = null;
  const loadPlans = () => (plansP = plansP || loadPlansOnce());
  async function loadPlansOnce() {
    try { const r = await fetch("/campus/overrides.json", { cache: "no-cache" }); if (r.ok) { const j = await r.json(); team = { rooms: j.rooms || [], plans: j.plans || {} }; } } catch { /* no shipped data */ }
    Object.entries(team.plans).forEach(([k, v]) => plans.set(k, v));
    const keys = await keysBlob("plan:"), vals = await Promise.all(keys.map(getBlob));
    keys.forEach((k, i) => { plans.set(k.slice(5), vals[i]); localPlans.add(k.slice(5)); });
    plansLoaded = true;
  }

  /* ── view state (kept across re-renders) ── */
  const V = { tab: "map", to: "", from: null, focus: null, floor: null, view: "3d", r: null, placeQ: "", dataQ: "" };
  let ctrl = null, host3d = null, loading3d = null, ready3d = Promise.resolve();
  const has3d = () => typeof window.WebGLRenderingContext !== "undefined";
  const FROMS = [["gate:E1", "Entry 1 (main gate)"], ["gate:E2", "Entry 2 (east gate)"], ...BLOCKS.filter((b) => !b.off).map((b) => [`block:${b.id}:0`, `${b.name}, ground floor`])];
  const parsePlace = (v) => { if (!v) return null; const [k, a, b] = v.split(":"); return k === "gate" ? { kind: "gate", id: a } : k === "block" ? { kind: "block", block: a, floor: Number(b) } : k === "room" ? { kind: "room", code: a } : null; };
  const placeLabel = (v) => (FROMS.find(([k]) => k === v) || [v, v.startsWith("room:") ? `Room ${v.slice(5)}` : v])[1];

  function compute() {
    V.r = null;
    if (!V.to) return;
    const goal = V.to.startsWith("dir:") ? (() => { const d = DIRECTORY[Number(V.to.slice(4))]; return d && { kind: "block", block: d.block, floor: d.floor }; })() : V.to.startsWith("block:") ? parsePlace(V.to) : { kind: "room", code: V.to };
    V.r = goal && findRoute(parsePlace(V.from || "gate:" + (C().from || "E1")), goal, userRooms());
    if (V.r && V.to.startsWith("dir:")) { const d = DIRECTORY[Number(V.to.slice(4))]; V.r.steps[V.r.steps.length - 1].text = `${d.name} is on the ${floorLabel(d.floor)} of ${blockById(d.block).name}.`; V.r.to.label = d.name; }
  }

  /* ── 2D plan (SVG): fallback when WebGL is missing, and a quick top view on phones ── */
  function svgMap() {
    const pts = V.r?.points || [];
    const off = pts.some((p) => p.z > 80 || p.x > 60) || (V.focus && blockById(V.focus)?.off);
    const vb = off ? [-84, -64, 204, 224] : [-80, -56, 146, 140];
    const poly = (b) => b.hex ? (() => { const cx = b.foot.x + b.foot.w / 2, cz = b.foot.z + b.foot.d / 2, rx = b.foot.w / 1.85, rz = b.foot.d / 1.85; return Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i; return `${(cx + rx * Math.cos(a)).toFixed(1)},${(cz + rz * Math.sin(a)).toFixed(1)}`; }).join(" "); })()
      : `${b.foot.x},${b.foot.z} ${b.foot.x + b.foot.w},${b.foot.z} ${b.foot.x + b.foot.w},${b.foot.z + b.foot.d} ${b.foot.x},${b.foot.z + b.foot.d}`;
    const line = pts.map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(" ");
    const changes = pts.filter((p, i) => i && p.f !== pts[i - 1].f && (pts[i + 1]?.f !== p.f));
    return `<svg class="c2" viewBox="${vb.join(" ")}" role="img" aria-label="Top view of the EWU campus${V.r ? " with your route" : ""}">
      <rect x="-200" y="76" width="420" height="14" class="road"/><rect x="64" y="-170" width="12" height="330" class="road"/><rect x="-75" y="-50" width="150" height="140" class="site"/>
      <rect x="${COURTYARD.x}" y="${COURTYARD.z}" width="${COURTYARD.w}" height="${COURTYARD.d}" class="yard"/>
      ${BLOCKS.map((b) => `<g class="blk${V.focus === b.id ? " sel" : ""}${b.off ? " offb" : ""}" data-blk="${b.id}" tabindex="0" role="button" aria-label="${esc(b.name)}"><polygon points="${poly(b)}"/><text x="${b.foot.x + b.foot.w / 2}" y="${b.foot.z + b.foot.d / 2 + 1.6}">${esc(b.short)}</text></g>`).join("")}
      ${line ? `<polyline points="${line}" class="rt"/>${changes.map((p) => `<g class="fchg"><circle cx="${p.x}" cy="${p.z}" r="3.2"/><text x="${p.x}" y="${p.z + 1.3}">${floorShort(p.f)}</text></g>`).join("")}
        <circle cx="${pts[0].x}" cy="${pts[0].z}" r="2.6" class="st"/><circle cx="${pts[pts.length - 1].x}" cy="${pts[pts.length - 1].z}" r="3" class="go"/>` : ""}
      <text x="${vb[0] + 4}" y="${vb[1] + 8}" class="north">N ↑</text></svg>`;
  }

  /* ── panel renderers ── */
  const confPill = (c) => { const [l, t] = CONF[c] || CONF.guess; return `<span class="pill ${t}">${l}</span>`; };
  function routePanel() {
    const r = V.r;
    if (!V.to) return "";
    if (!r) return `<div class="alert red mt">${icon("alert")}<div><b>We couldn't place "${esc(V.to)}"</b><p>Use a room like 636, AB2-702 or FUB-903, or pick a place from the Places tab.</p></div></div>`;
    const room = r.to.room;
    return `<section class="card mt route-card" aria-live="polite">
      <div class="row nowrap"><span class="itile purple">${icon("map")}</span><div class="grow min0"><b style="font-size:16px">${esc(r.to.label)}</b><p class="xs">${room ? `${esc(blockById(room.block).name)} · ${floorLabel(room.floor)}` : esc(blockById(r.to.block)?.name || "")}</p></div>
        <div style="text-align:right"><b class="rt-time">${fmtWalk(r.seconds)}</b><span class="xs" style="display:block">${r.metres} m walk</span></div></div>
      ${room ? `<div class="row mt-s" style="gap:6px">${confPill(room.conf)}<span class="xs grow">${esc(room.source || "")}</span></div>` : ""}
      <ol class="steps-nav">${r.steps.map((s) => `<li><span class="sn-ic">${icon(s.ic === "up" ? "up" : s.ic, "sm")}</span><span class="grow">${esc(s.text)}</span>${s.s ? `<span class="xs">${s.s < 60 ? s.s + " s" : Math.round(s.s / 60) + " min"}</span>` : ""}</li>`).join("")}</ol>
      <div class="row mt">${has3d() ? `<button class="btn primary grow" id="cm-tour">${icon("play")} Guided 3D walk</button>` : ""}<button class="btn outline grow" id="cm-share">${icon("share")} Share</button><button class="btn ghost" id="cm-clear" aria-label="Clear route">${icon("x")}</button></div>
      ${room && room.conf !== "verified" && room.conf !== "user" ? `<button class="lnk mt-s" id="cm-fix">${icon("edit", "sm")} Know where ${esc(room.code)} really is? Fix it</button>` : ""}</section>`;
  }
  function blockPanel() {
    const b = blockById(V.focus); if (!b) return "";
    const f = V.floor ?? 0, here = DIRECTORY.map((d, i) => ({ ...d, i })).filter((d) => d.block === b.id);
    const rooms = [...new Map([...ROOMS, ...userRooms().reverse()].map((r) => [r.code, r])).values()].filter((r) => r.block === b.id && r.floor === f);
    const plan = plans.get(planKey(b.id, f));
    return `<section class="card mt">
      <div class="row nowrap"><span class="itile orange">${icon("building")}</span><div class="grow min0"><b style="font-size:16px">${esc(b.name)}</b><p class="xs">${floorLabel(b.low)} to ${floorLabel(b.top)}${b.lobby ? ` · lifts at ${b.lobby}` : ""}${b.approx ? " · position approximate" : ""}</p></div><button class="btn ghost icon-only" id="cm-unfocus" aria-label="Close block">${icon("x")}</button></div>
      <div class="fl-chips" role="tablist" aria-label="Floors">${floorsOf(b).slice().reverse().map((x) => `<button role="tab" data-fl="${x}" aria-selected="${x === f}">${floorShort(x)}</button>`).join("")}</div>
      <h3 class="mt">${floorLabel(f)}</h3>
      ${here.filter((d) => d.floor === f).map((d) => `<button class="lrow" data-go="dir:${d.i}"><span class="itile sm ${d.kind === "dept" ? "purple" : d.kind === "gallery" ? "blue" : d.kind === "lab" ? "teal" : "green"}">${icon(d.kind === "dept" ? "school" : d.kind === "gallery" ? "users" : d.kind === "lab" ? "zap" : "pin")}</span><span class="body"><b>${esc(d.name)}</b></span>${icon("chevR", "chev")}</button>`).join("")}
      ${rooms.map((r) => `<button class="lrow" data-go="${esc(r.code)}"><span class="itile sm yellow">${icon("door")}</span><span class="body"><b>Room ${esc(r.code)}</b><span>${esc(r.name || r.kind || "")}</span></span>${confPill(r.conf)}</button>`).join("")}
      ${!here.some((d) => d.floor === f) && !rooms.length ? `<p class="small muted mt-s">Nothing mapped on this floor yet.</p>` : ""}
      <div class="row mt"><button class="btn outline grow" data-go="block:${b.id}:${f}">${icon("map")} Directions here</button><button class="btn ghost grow" id="cm-plan">${icon("image")} ${plan ? "Replace" : "Upload"} floor plan</button></div>
      ${plan ? `<img class="plan-thumb mt-s" src="${esc(plan)}" alt="Floor plan of ${esc(b.name)}, ${floorLabel(f)}">` : ""}</section>`;
  }
  function suggestions() {
    const nc = ctx.nextClass(), mine = [...new Set(S().routine.map((r) => ctx.baseRoom(r.room)).filter(Boolean))];
    const chip = (v, l, ic = "") => `<button class="chip" data-go="${esc(v)}">${ic ? icon(ic, "sm") + " " : ""}${esc(l)}</button>`;
    return `<div class="row mt-s" style="gap:6px">${nc?.room ? chip(ctx.baseRoom(nc.room), `Next: ${ctx.baseRoom(nc.room)}`, "clock") : ""}${mine.filter((r) => r !== ctx.baseRoom(nc?.room)).slice(0, 4).map((r) => chip(r, r)).join("")}
      ${[["dir:" + DIRECTORY.findIndex((d) => d.name.startsWith("Dr. S. R. Lasker")), "Library"], ["dir:" + DIRECTORY.findIndex((d) => d.name === "Canteen"), "Canteen"], ["dir:" + DIRECTORY.findIndex((d) => d.name.startsWith("Accounts")), "Accounts"], ["dir:" + DIRECTORY.findIndex((d) => d.name === "Medical Center"), "Medical"]].map(([v, l]) => chip(v, l)).join("")}</div>`;
  }

  pages.map = () => {
    const qt = ctx.qparam("to"), qb = ctx.qparam("block"), qf = ctx.qparam("from"), tab = ctx.qparam("tab");
    if (qt || qb || qf || tab) {
      if (qt) { V.to = qt; V.tab = "map"; } if (qf) V.from = qf;
      if (qb) { V.focus = qb; V.floor = Number(ctx.qparam("floor") || 0); V.to = ""; V.tab = "map"; }
      if (tab) V.tab = tab;
      history.replaceState(null, "", "#/map");
    }
    compute();
    const tabs = ctx.seg([["map", `${icon("map", "sm")} Map`], ["places", `${icon("pin", "sm")} Places`], ["data", `${icon("database", "sm")} Rooms &amp; plans`]], V.tab, "data-ctab");
    const headHtml = ctx.head("Campus Map", "Find any room, office or lab. Walk the campus in 3D.", "", ctx.art("mascot-thumbs", "Lost? Not anymore"));
    if (V.tab === "places") return `${headHtml}${tabs}${placesView()}`;
    if (V.tab === "data") return `${headHtml}${tabs}${dataView()}`;
    const fromV = V.from || "gate:" + (C().from || "E1");
    return `${headHtml}${tabs}
      <div class="cmap mt">
        <div class="cmap-side">
          <form class="card" id="cm-form" role="search">
            <label class="field">Where to?<span class="searchbar">${icon("search")}<input class="input" id="cm-to" name="to" placeholder="Room (636, AB2-702, FUB-903) or place" value="${esc(V.to.startsWith("dir:") ? DIRECTORY[Number(V.to.slice(4))]?.name || "" : V.to.startsWith("block:") ? "" : V.to)}" autocomplete="off" list="cm-list" aria-describedby="cm-hint"></span></label>
            <datalist id="cm-list">${DIRECTORY.map((d) => `<option value="${esc(d.name)}">`).join("")}${ROOMS.map((r) => `<option value="${esc(r.code)}">${esc(r.name)}</option>`).join("")}</datalist>
            <label class="field mt-s">From<select class="select" id="cm-from">${[...FROMS, ...(fromV.startsWith("room:") ? [[fromV, placeLabel(fromV)]] : [])].map(([v, l]) => `<option value="${v}" ${v === fromV ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
            <button class="btn primary block mt">${icon("arrow")} Show route</button>
            <span class="xs" id="cm-hint" style="display:block;margin-top:6px">Floors come from the room number (1xx = ground floor, 6xx = 5th floor).</span>
            ${suggestions()}
          </form>
          <div id="cm-panel">${V.to ? routePanel() : V.focus ? blockPanel() : `<section class="card mt"><b>Tip</b><p class="small muted mt-s">Tap a building to see its floors, offices and rooms. Drag to rotate, pinch or scroll to zoom.</p></section>`}</div>
        </div>
        <div class="cmap-view card pad0">
          <div class="c3" id="c3-slot">${V.view === "2d" || !has3d() ? svgMap() : `<div class="c3-loading"><span class="spinner"></span> Loading 3D campus…</div>`}</div>
          <div class="c3-tools" role="toolbar" aria-label="Map view">
            ${has3d() ? `<button class="chip" data-view="3d" aria-pressed="${V.view === "3d"}">3D</button><button class="chip" data-view="2d" aria-pressed="${V.view === "2d"}">2D</button>
            <button class="chip" id="c3-walk" ${V.view === "2d" ? "hidden" : ""}>${icon("user", "sm")} Walk</button><button class="chip" id="c3-xray" ${V.view === "2d" ? "hidden" : ""}>${icon("layers", "sm")} X-ray</button>` : ""}
            <button class="chip" id="c3-home" aria-label="Reset view">${icon("home", "sm")}</button></div>
          <div class="c3-walkui" id="c3-walkui" hidden><div class="joy" id="joy" aria-label="Move"><span></span></div><p class="xs grow">You're at Entry 1. WASD, arrow keys or the joystick to move · drag to look</p><button class="btn sm white" id="c3-exit">Exit walk</button></div>
          <div class="c3-tourui" id="c3-tourui" hidden><b id="tour-floor">Ground floor</b><div class="bar"><span id="tour-bar" style="width:0%"></span></div><button class="btn sm white" id="tour-pp">${icon("play", "sm")} Pause</button><button class="btn sm white" id="tour-exit">Exit tour</button></div>
          <p class="c3-note xs">Unofficial model from the public EWU campus map · to scale (±3 m)</p>
        </div>
      </div>`;
  };

  function placesView() {
    const q = V.placeQ.trim().toLowerCase(), lib = libraryOpen();
    const list = DIRECTORY.map((d, i) => ({ ...d, i })).filter((d) => !q || `${d.name} ${blockById(d.block).name}`.toLowerCase().includes(q));
    const byBlock = BLOCKS.filter((b) => list.some((d) => d.block === b.id));
    return `<div class="grid g2 mt" style="align-items:start"><div>
      <div class="searchbar">${icon("search")}<input class="input" id="pl-q" type="search" placeholder="Search offices, departments, labs…" value="${esc(V.placeQ)}" aria-label="Search places"></div>
      ${byBlock.map((b) => `<section class="card mt tight"><div class="card-h"><h3>${icon("building", "sm")} ${esc(b.name)}</h3><button class="lnk" data-blkgo="${b.id}">View in 3D</button></div>
        ${list.filter((d) => d.block === b.id).sort((x, y) => x.floor - y.floor).map((d) => `<button class="lrow" data-go="dir:${d.i}"><span class="fl-badge">${floorShort(d.floor)}</span><span class="body"><b>${esc(d.name)}</b><span>${floorLabel(d.floor)}</span></span>${icon("chevR", "chev")}</button>`).join("")}</section>`).join("") || `<div class="card mt">${ctx.empty("icon:search", "No places match", "Try a department, office or lab name.")}</div>`}
      </div><div>
      <section class="card mt"><div class="row nowrap"><span class="itile ${lib.open ? "green" : "red"}">${icon("library")}</span><div class="grow"><b>Dr. S. R. Lasker Library</b><p class="small ${lib.open ? "" : "muted"}">${lib.open ? `Open now · until ${ctx.fmt12(lib.until)}` : lib.next != null ? `Closed · opens ${ctx.fmt12(lib.next)}` : "Closed for today"}</p></div><button class="btn sm outline" data-go="dir:${DIRECTORY.findIndex((d) => d.name.startsWith("Dr. S. R. Lasker"))}">Directions</button></div>
        <dl class="kv mt-s">${LIBRARY_HOURS.map(([d, h]) => `<dt>${d}</dt><dd>${h}</dd>`).join("")}</dl><p class="xs mt-s">Block B, 5th floor. Hours from the Spring 2025 EWU newsletter; check notices during exams and holidays.</p></section>
      <section class="card mt"><h3>${icon("community", "sm")} Student clubs (${CLUBS.length})</h3><div class="row mt-s" style="gap:6px">${CLUBS.map((c) => `<span class="tag">${esc(c)}</span>`).join("")}</div><p class="xs mt-s">Clubs are run through the Department of Students' Welfare (Admin Block, 2nd floor).</p></section>
      <section class="card mt"><h3>${icon("info", "sm")} How room numbers work</h3><p class="small muted mt-s">The first digit is the floor plus one: 1xx is the ground floor, 2xx the 1st floor, 6xx the 5th floor. AB1-, AB2- and AB3- rooms are in the Academic Buildings off the main campus; FUB- rooms are in Farashuddin Bhaban (FUB-1001 is the 9th floor).</p></section></div></div>`;
  }

  function dataView() {
    const q = V.dataQ.trim().toLowerCase();
    const mine = C().rooms, list = [...mine.map((r) => ({ ...r, conf: "user" })), ...team.rooms.map((r) => ({ ...r, conf: "verified" })), ...ROOMS].filter((r) => !q || `${r.code} ${r.name} ${blockById(r.block)?.name}`.toLowerCase().includes(q));
    const planCount = [...plans.keys()].length, totalFloors = BLOCKS.reduce((n, b) => n + floorsOf(b).length, 0);
    return `<div class="grid g2 mt" style="align-items:start"><div>
      <section class="card"><div class="card-h"><h2>${icon("door", "sm")} Room register</h2><button class="btn primary sm" id="rd-add">${icon("plus")} Add room</button></div>
        <p class="small muted">Rooms you add here win over the app's guesses and show up in search and routes. ${mine.length ? `You've added ${mine.length}.` : ""}</p>
        <div class="searchbar mt-s">${icon("search")}<input class="input" id="rd-q" type="search" placeholder="Search rooms" value="${esc(V.dataQ)}" aria-label="Search rooms"></div>
        <div class="mt-s">${list.map((r) => `<div class="lrow"><span class="itile sm ${r.conf === "user" ? "purple" : "yellow"}">${icon("door")}</span><span class="body"><b>Room ${esc(r.code)}${r.name ? ` · ${esc(r.name)}` : ""}</b><span>${esc(blockById(r.block)?.name || "?")} · ${floorLabel(r.floor)}${r.u != null ? " · pinned" : ""}</span></span>${confPill(r.conf)}
          ${r.conf === "user" ? `<button class="btn sm icon-only ghost" data-redit="${esc(r.code)}" aria-label="Edit room ${esc(r.code)}">${icon("edit")}</button><button class="btn sm icon-only ghost" data-rdel="${esc(r.code)}" aria-label="Delete room ${esc(r.code)}">${icon("trash")}</button>` : `<button class="btn sm icon-only ghost" data-go="${esc(r.code)}" aria-label="Route to ${esc(r.code)}">${icon("map")}</button>`}</div>`).join("") || `<p class="small muted mt-s">No rooms match.</p>`}</div></section>
      <section class="card mt"><h3>${icon("search", "sm")} Check a room number</h3><div class="row nowrap mt-s"><input class="input" id="rd-check" placeholder="e.g. 448 or AB1-305" aria-label="Room number to check"><button class="btn" id="rd-checkgo">Check</button></div><div id="rd-out"></div></section>
      </div><div>
      <section class="card"><div class="card-h"><h2>${icon("image", "sm")} Floor plans</h2><span class="pill ${planCount ? "green" : "blue"}">${planCount} / ${totalFloors} floors</span></div>
        <p class="small muted">Upload a photo or scan of each floor's plan (from the notice board, EMD or your own sketch). Crop it to the building outline with north at the top; then pin rooms on it.</p>
        <div class="plan-grid mt-s">${BLOCKS.map((b) => `<div><b class="small">${esc(b.short)}</b><div class="row" style="gap:4px;margin-top:4px">${floorsOf(b).map((f) => `<button class="fl-dot${plans.has(planKey(b.id, f)) ? " on" : ""}" data-up="${b.id}|${f}" aria-label="${plans.has(planKey(b.id, f)) ? "Replace" : "Upload"} plan for ${esc(b.name)} ${floorLabel(f)}">${floorShort(f)}</button>`).join("")}</div></div>`).join("")}</div></section>
      <section class="card mt"><h3>${icon("share", "sm")} Share your campus data</h3><p class="small muted mt-s">Export rooms and plans as one file. To ship them to every student, put the file in the app at <code>public/campus/overrides.json</code>.</p>
        <div class="row mt"><button class="btn outline grow" id="rd-export">${icon("download")} Export</button><label class="btn outline grow" style="cursor:pointer">${icon("upload")} Import<input type="file" id="rd-import" accept="application/json,.json" hidden></label></div></section>
      <section class="card mt"><h3>${icon("info", "sm")} Where the data comes from</h3><ul class="small muted mt-s" style="padding-left:18px">
        <li>Blocks, floors, lifts and links: the official EWU campus map (ewubd.edu/access-map).</li><li>Named rooms: EWU notices, the CRT site and the CCC brochure.</li>
        <li>Room-number ranges: office rooms on EWU faculty profile pages (CSE 627–648 = C-South 5th floor, English 229–253 = C-North 1st floor…).</li>
        <li>Note: the FUB rooms in the research PDF are one floor off. FUB-903 is on the 8th floor and FUB-1001 on the 9th, because FUB numbers rooms the same way as the main campus.</li></ul></section></div></div>`;
  }

  /* ── room editor (with optional pin on the floor plan) ── */
  function roomModal(existing) {
    const r = existing || { code: "", name: "", block: "CS", floor: 0, kind: "classroom" };
    openModal(modalHead(existing ? `Edit room ${existing.code}` : "Add a room") + `<form id="rm-form" class="grid g2">
      <label class="field">Room number<input class="input" name="code" required value="${esc(r.code)}" placeholder="636, AB2-702, FUB-903" ${existing ? "readonly" : ""}></label>
      <label class="field">Type<select class="select" name="kind">${["classroom", "lab", "office", "gallery", "seminar", "facility"].map((k) => `<option ${r.kind === k ? "selected" : ""}>${k}</option>`).join("")}</select></label>
      <label class="field full-row">Name or use (optional)<input class="input" name="name" value="${esc(r.name || "")}" placeholder="e.g. Database Lab, CSE"></label>
      <label class="field">Block<select class="select" name="block">${BLOCKS.map((b) => `<option value="${b.id}" ${r.block === b.id ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select></label>
      <label class="field">Floor<select class="select" name="floor"></select></label>
      <div class="full-row" id="rm-pin"></div>
      <p class="xs full-row" id="rm-guess"></p>
      <div class="row full-row"><button type="button" class="btn neutral grow" data-close>Cancel</button><button class="btn primary grow">${icon("check")} Save room</button></div></form>`, (m) => {
      const form = $("#rm-form", m); let pin = existing && existing.u != null ? { u: existing.u, v: existing.v } : null;
      const floors = () => { const b = blockById(form.block.value), cur = Number(form.floor.value || r.floor); form.floor.innerHTML = floorsOf(b).map((f) => `<option value="${f}" ${f === cur ? "selected" : ""}>${floorLabel(f)}</option>`).join(""); drawPin(); };
      const drawPin = () => { const p = plans.get(planKey(form.block.value, Number(form.floor.value))); const box = $("#rm-pin", m);
        box.innerHTML = p ? `<p class="xs">Tap the plan to pin the room's spot.</p><div class="pin-plan"><img src="${esc(p)}" alt="Floor plan">${pin ? `<span class="pin-dot" style="left:${pin.u * 100}%;top:${pin.v * 100}%"></span>` : ""}</div>` : `<p class="xs">No floor plan for this floor yet. Upload one in "Floor plans" to pin the exact spot.</p>`;
        const pp = $(".pin-plan", box); pp && pp.addEventListener("click", (e) => { const b = pp.getBoundingClientRect(); pin = { u: +((e.clientX - b.left) / b.width).toFixed(4), v: +((e.clientY - b.top) / b.height).toFixed(4) }; drawPin(); }); };
      let guessed = ""; // only auto-fill once per typed number, so a manual block/floor choice sticks
      const guess = () => { if (form.code.value === guessed) return; guessed = form.code.value; const g = parseRoom(form.code.value) && resolveRoom(form.code.value); $("#rm-guess", m).textContent = g && !existing ? `The app currently guesses: ${blockById(g.block)?.name || "unknown"}, ${floorLabel(g.floor)} (${CONF[g.conf][0].toLowerCase()}).` : ""; if (g && !existing && g.block) { form.block.value = g.block; floors(); form.floor.value = String(g.floor); drawPin(); } };
      form.block.addEventListener("change", floors); form.floor.addEventListener("change", drawPin); form.code.addEventListener("change", guess);
      floors();
      form.addEventListener("submit", (e) => {
        e.preventDefault(); const p = parseRoom(form.code.value);
        if (!p) return toast("That doesn't look like an EWU room number", "error", "Use 636, AB2-702 or FUB-903.");
        const rec = { code: p.code, name: form.name.value.trim(), kind: form.kind.value, block: form.block.value, floor: Number(form.floor.value), ...(pin || {}), at: new Date().toISOString() };
        C().rooms = [rec, ...C().rooms.filter((x) => x.code !== p.code)]; ctx.save(); closeModal(); toast(`Room ${p.code} saved`, "success", `${blockById(rec.block).name}, ${floorLabel(rec.floor)}`); ctx.rerender();
      });
    });
  }

  // Open the editor pre-filled with a room the app only guessed.
  const fixRoom = (code) => { roomModal(null); const f = $("#rm-form"); if (f) { f.code.value = code; f.code.dispatchEvent(new Event("change")); } };

  /* ── floor plan upload (with rotate) ── */
  function planModal(blockId, f) {
    const b = blockById(blockId), key = planKey(blockId, f), cur = plans.get(key);
    let data = null, rot = 0;
    openModal(modalHead(`${b.short} · ${floorLabel(f)} plan`) + `<div class="stack">
      <label class="btn outline block" style="cursor:pointer">${icon("upload")} Choose image or take photo<input type="file" id="pl-file" accept="image/*" hidden></label>
      <div class="plan-prev" id="pl-prev">${cur ? `<img src="${esc(cur)}" alt="Current plan">` : `<p class="xs">PNG or JPG. Crop to the outer walls of the building, north at the top.</p>`}</div>
      <div class="row"><button class="btn sm" id="pl-rot" disabled>${icon("reset", "sm")} Rotate 90°</button><span class="grow"></span>${localPlans.has(key) ? `<button class="btn sm danger-soft" id="pl-del">${icon("trash", "sm")} Remove</button>` : ""}</div>
      <button class="btn primary block" id="pl-save" disabled>${icon("check")} Save plan</button></div>`, (m) => {
      const prev = $("#pl-prev", m), save = $("#pl-save", m), rb = $("#pl-rot", m);
      const show = async () => { prev.innerHTML = `<img src="${data}" alt="New plan preview">`; save.disabled = rb.disabled = false; };
      $("#pl-file", m).addEventListener("change", async (e) => { const fl = e.target.files[0]; if (!fl) return; try { data = await fileToDataURL(fl, 2048); rot = 0; show(); } catch (err) { toast(err.message, "error"); } });
      rb.addEventListener("click", () => { const img = new Image(); img.onload = () => { const c = document.createElement("canvas"); c.width = img.height; c.height = img.width; const g = c.getContext("2d"); g.translate(c.width / 2, c.height / 2); g.rotate(Math.PI / 2); g.drawImage(img, -img.width / 2, -img.height / 2); data = c.toDataURL("image/jpeg", 0.86); rot = (rot + 90) % 360; show(); }; img.src = data; });
      save.addEventListener("click", async () => { await setBlob("plan:" + key, data); plans.set(key, data); localPlans.add(key); closeModal(); ctrl?.refreshPlans(); toast("Floor plan saved", "success", "Open the floor in the map to see it, and pin rooms on it."); ctx.rerender(); });
      $("#pl-del", m)?.addEventListener("click", async () => { await delBlob("plan:" + key); plans.delete(key); localPlans.delete(key); if (team.plans[key]) plans.set(key, team.plans[key]); closeModal(); ctrl?.refreshPlans(); toast("Plan removed", "info"); ctx.rerender(); });
    });
  }

  /* ── 3D lifecycle: one renderer kept alive while you stay on the map ── */
  async function ensure3d(slot) {
    if (V.view !== "3d" || !has3d()) return;
    if (!host3d) { host3d = document.createElement("div"); host3d.className = "c3-host"; }
    slot.innerHTML = ""; slot.appendChild(host3d);
    if (ctrl) { if (ctrl.mode !== "orbit") ctrl.setMode("orbit"); apply3d(); return; } // walk/tour UI is rebuilt hidden, so reset the camera too
    const host = host3d;
    loading3d = loading3d || import("./campus3d.js");
    let m; try { m = await loading3d; } catch { m = null; }
    if (host !== host3d || !host.isConnected) return; // left the map while three.js was loading
    if (!ctrl) {
      if (!m || !m.webglOK()) { V.view = "2d"; loading3d = null; host3d = null; slot.innerHTML = svgMap(); bindSvg(slot); toast("3D isn't available on this device", "info", "Showing the 2D map instead."); return; }
      ctrl = m.mountCampus3D(host, { dark: ctx.isDark(), onPick: (blk, fl) => { V.focus = blk; V.floor = fl ?? 0; if (!V.r) drawPanel(); ctrl.focusOn(blk, V.floor); }, planFor: (b, f) => plans.get(planKey(b, f)) || null });
    }
    apply3d();
  }
  function apply3d() {
    if (!ctrl) return;
    ctrl.setDark(ctx.isDark());
    if (V.r) ctrl.showRoute(V.r.points); else { ctrl.showRoute(null); ctrl.focusOn(V.focus, V.focus ? V.floor ?? 0 : null); }
  }
  const dispose3d = () => { if (ctrl) { ctrl.dispose(); ctrl = null; } host3d = null; loading3d = null; };
  addEventListener("hashchange", () => { if (ctx.route() !== "map") dispose3d(); });

  function drawPanel() { const p = $("#cm-panel"); if (!p) return; p.innerHTML = V.to ? routePanel() : V.focus ? blockPanel() : ""; bindPanel(p); if (V.view === "2d") { const s = $("#c3-slot"); s.innerHTML = svgMap(); bindSvg(s); } }
  function bindSvg(slot) { $$("[data-blk]", slot).forEach((g) => { const go = () => { V.focus = g.dataset.blk; V.floor = 0; V.to = ""; V.r = null; drawPanel(); }; g.addEventListener("click", go); g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } }); }); }
  const goTo = (v) => { V.to = v; V.tab = "map"; if (v.startsWith("block:")) { const [, b, f] = v.split(":"); V.focus = b; V.floor = Number(f); } compute(); if (ctx.route() === "map" && V.tab === "map" && $("#cm-panel")) { drawPanel(); apply3d(); } else ctx.go("#/map"); };
  function bindPanel(el) {
    $$("[data-go]", el).forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); goTo(b.dataset.go); }));
    $$("[data-fl]", el).forEach((b) => b.addEventListener("click", () => { V.floor = Number(b.dataset.fl); drawPanel(); ctrl?.focusOn(V.focus, V.floor); }));
    $("#cm-unfocus", el)?.addEventListener("click", () => { V.focus = null; drawPanel(); ctrl?.focusOn(null); });
    $("#cm-plan", el)?.addEventListener("click", () => planModal(V.focus, V.floor ?? 0));
    $("#cm-clear", el)?.addEventListener("click", () => { V.to = ""; V.r = null; const i = $("#cm-to"); if (i) i.value = ""; drawPanel(); apply3d(); });
    $("#cm-fix", el)?.addEventListener("click", () => fixRoom(V.r.to.room.code));
    $("#cm-share", el)?.addEventListener("click", async () => { const text = `${V.r.to.label}: ${V.r.steps.slice(1).map((s) => s.text).join(" → ")}`; try { await ctx.native.share({ title: `Directions to ${V.r.to.label}`, text }); } catch { try { await navigator.clipboard.writeText(text); toast("Directions copied", "info"); } catch { toast("Couldn't share", "error"); } } });
    $("#cm-tour", el)?.addEventListener("click", startTour);
  }
  async function startTour() {
    if (!V.r) return;
    if (!ctrl && V.view === "2d") { V.view = "3d"; ctx.rerender(); await ready3d; }
    if (!ctrl) return;
    ctrl.setMode("tour"); $("#c3-tourui").hidden = false; $(".c3-tools").hidden = true;
    const pp = $("#tour-pp");
    ctrl.tour.onProgress((t, f) => { const bar = $("#tour-bar"); if (!bar) return; bar.style.width = `${Math.round(t * 100)}%`; $("#tour-floor").textContent = t >= 1 ? "You've arrived" : floorLabel(f); if (t >= 1) pp.innerHTML = `${icon("reset", "sm")} Replay`; });
    pp.onclick = () => { if (ctrl.tour.playing) { ctrl.tour.pause(); pp.innerHTML = `${icon("play", "sm")} Play`; } else { ctrl.tour.play(); pp.innerHTML = `${icon("play", "sm")} Pause`; } };
    $("#tour-exit").onclick = () => { ctrl.setMode("orbit"); ctrl.showRoute(V.r.points); $("#c3-tourui").hidden = true; $(".c3-tools").hidden = false; };
  }

  pages.map.mount = (el) => {
    $$("[data-ctab]", el).forEach((b) => b.addEventListener("click", () => { V.tab = b.dataset.ctab; if (ctrl && ctrl.mode !== "orbit") ctrl.setMode("orbit"); ctx.rerender(); }));
    if (!plansLoaded) loadPlans().then(() => { if (ctx.route() === "map") { ctrl?.refreshPlans(); if (V.tab !== "map" || team.rooms.length) ctx.rerender(); } });
    bindPanel(el);
    if (V.tab === "places") {
      const q = $("#pl-q", el); let t; q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { V.placeQ = q.value; ctx.rerender(); const n = $("#pl-q"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200); });
      $$("[data-blkgo]", el).forEach((b) => b.addEventListener("click", () => { V.tab = "map"; V.focus = b.dataset.blkgo; V.floor = 0; V.to = ""; ctx.rerender(); }));
      return;
    }
    if (V.tab === "data") {
      const q = $("#rd-q", el); let t; q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { V.dataQ = q.value; ctx.rerender(); const n = $("#rd-q"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200); });
      $("#rd-add", el).addEventListener("click", () => roomModal(null));
      $$("[data-redit]", el).forEach((b) => b.addEventListener("click", () => roomModal(C().rooms.find((r) => r.code === b.dataset.redit))));
      $$("[data-rdel]", el).forEach((b) => b.addEventListener("click", () => confirmModal(`Delete room ${b.dataset.rdel}?`, "The app will go back to its own guess for this room.", "Delete", () => { C().rooms = C().rooms.filter((r) => r.code !== b.dataset.rdel); ctx.save(); ctx.rerender(); toast("Room deleted", "info"); }, true)));
      $$("[data-up]", el).forEach((b) => b.addEventListener("click", () => { const [blk, f] = b.dataset.up.split("|"); planModal(blk, Number(f)); }));
      const check = () => { const v = $("#rd-check", el).value, r = where(v), out = $("#rd-out", el);
        out.innerHTML = !r ? `<p class="small mt-s" style="color:var(--error-t)">That isn't an EWU room number. Try 636, AB2-702 or FUB-903.</p>` : `<div class="lrow mt-s"><span class="itile sm blue">${icon("door")}</span><span class="body"><b>Room ${esc(r.code)}: ${esc(blockById(r.block)?.name || "Unknown block")}, ${floorLabel(r.floor)}</b><span>${esc(r.source || "")}</span></span>${confPill(r.conf)}</div><div class="row mt-s"><button class="btn sm outline" id="rd-route">${icon("map", "sm")} Route</button>${r.conf !== "user" ? `<button class="btn sm ghost" id="rd-fix">${icon("edit", "sm")} Correct it</button>` : ""}</div>`;
        $("#rd-route", out)?.addEventListener("click", () => goTo(r.code)); $("#rd-fix", out)?.addEventListener("click", () => fixRoom(r.code)); };
      $("#rd-checkgo", el).addEventListener("click", check); $("#rd-check", el).addEventListener("keydown", (e) => { if (e.key === "Enter") check(); });
      $("#rd-export", el).addEventListener("click", async () => { const out = { app: "EWUdiots campus data", version: 1, exported: new Date().toISOString(), rooms: C().rooms, plans: {} };
        const keys = await keysBlob("plan:"), vals = await Promise.all(keys.map(getBlob)); keys.forEach((k, i) => { out.plans[k.slice(5)] = vals[i]; });
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: "application/json" })); a.download = "ewudiots-campus.json"; a.click(); toast("Campus data exported", "success", `${out.rooms.length} rooms, ${Object.keys(out.plans).length} floor plans`); });
      $("#rd-import", el).addEventListener("change", async (e) => { try { const j = JSON.parse(await e.target.files[0].text()); if (!Array.isArray(j.rooms)) throw new Error("This isn't an EWUdiots campus file.");
        const ok = j.rooms.filter((r) => { const b = blockById(r.block), f = Number(r.floor); return parseRoom(r.code) && b && Number.isInteger(f) && f >= b.low && f <= b.top; }).map((r) => ({ code: parseRoom(r.code).code, name: String(r.name || "").slice(0, 80), kind: String(r.kind || "classroom"), block: r.block, floor: Number(r.floor), ...(r.u != null ? { u: Number(r.u), v: Number(r.v) } : {}) }));
        const codes = new Set(ok.map((r) => r.code)); C().rooms = [...ok, ...C().rooms.filter((r) => !codes.has(r.code))];
        for (const [k, v] of Object.entries(j.plans || {})) if (/^[A-Z0-9]+\|-?\d+$/.test(k) && /^data:image\//.test(v)) { await setBlob("plan:" + k, v); plans.set(k, v); localPlans.add(k); }
        ctx.save(); toast("Campus data imported", "success", `${ok.length} rooms, ${Object.keys(j.plans || {}).length} plans`); ctx.rerender(); } catch (err) { toast("Import failed", "error", err.message); } });
      return;
    }
    const form = $("#cm-form", el);
    form.addEventListener("submit", (e) => { e.preventDefault(); const v = form.to.value.trim(); if (!v) return form.to.focus();
      const lv = v.toLowerCase(), exact = DIRECTORY.findIndex((x) => x.name.toLowerCase() === lv), d = exact >= 0 ? exact : DIRECTORY.findIndex((x) => x.name.toLowerCase().includes(lv));
      goTo(parseRoom(v) ? parseRoom(v).code : d >= 0 ? `dir:${d}` : v); });
    $("#cm-from", el).addEventListener("change", (e) => { V.from = e.target.value; if (V.from.startsWith("gate:")) { C().from = V.from.slice(5); ctx.save({ silent: true }); } compute(); drawPanel(); apply3d(); });
    $$("[data-view]", el).forEach((b) => b.addEventListener("click", () => { V.view = b.dataset.view; if (V.view === "2d") dispose3d(); ctx.rerender(); }));
    $("#c3-home", el).addEventListener("click", () => { V.focus = null; if (!V.r) drawPanel(); ctrl ? (ctrl.mode !== "orbit" && ctrl.setMode("orbit"), ctrl.focusOn(null)) : drawPanel(); });
    let xr = false; $("#c3-xray", el)?.addEventListener("click", (e) => { xr = !xr; e.currentTarget.setAttribute("aria-pressed", xr); ctrl?.setXray(xr); });
    $("#c3-walk", el)?.addEventListener("click", () => { if (!ctrl) return; ctrl.setMode("walk"); $("#c3-walkui").hidden = false; $(".c3-tools").hidden = true; });
    $("#c3-exit", el)?.addEventListener("click", () => { ctrl.setMode("orbit"); $("#c3-walkui").hidden = true; $(".c3-tools").hidden = false; });
    const joy = $("#joy", el);
    if (joy) { let on = false; const knob = joy.firstElementChild;
      const mv = (e) => { if (!on) return; const b = joy.getBoundingClientRect(), x = Math.max(-1, Math.min(1, (e.clientX - b.left - b.width / 2) / (b.width / 2))), y = Math.max(-1, Math.min(1, (e.clientY - b.top - b.height / 2) / (b.height / 2))); knob.style.transform = `translate(${x * 24}px, ${y * 24}px)`; ctrl?.joystick(x, y); };
      joy.addEventListener("pointerdown", (e) => { on = true; joy.setPointerCapture(e.pointerId); mv(e); }); joy.addEventListener("pointermove", mv);
      const end = () => { on = false; knob.style.transform = ""; ctrl?.joystick(0, 0); }; joy.addEventListener("pointerup", end); joy.addEventListener("pointercancel", end); }
    const slot = $("#c3-slot", el);
    if (V.view === "2d" || !has3d()) bindSvg(slot); else ready3d = ensure3d(slot);
  };

  /* Walking time between two rooms (used for back-to-back classes on Home). */
  const walkBetween = (a, b) => { if (!a || !b || ctx.baseRoom(a) === ctx.baseRoom(b)) return null; const r = findRoute({ kind: "room", code: ctx.baseRoom(a) }, { kind: "room", code: ctx.baseRoom(b) }, userRooms()); return r ? r.seconds : null; };
  const placeText = (code) => { const r = where(code); return r && r.block ? `${blockById(r.block).name} · ${floorLabel(r.floor)}` : ""; };
  return { where, walkBetween, goTo, placeText, placesFor: () => DIRECTORY.map((d, i) => ({ name: d.name, hint: `${blockById(d.block).short} · ${floorShort(d.floor)}`, go: `dir:${i}` })) };
}
