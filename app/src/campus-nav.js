/* Campus routing: a graph of every block floor (lift/stair core + floor centre), the inter-block links from the map
   legend, the ground-floor access routes and the walks to the off-campus academic buildings. Dijkstra on seconds. */
import { BLOCKS, LINKS, WAYPOINTS, PATHS, DOORS, blockById, floorsOf, floorLabel, resolveRoom } from "./campus-data.js";

const WALK = 1.25; // m/s
const PER_FLOOR = 14; // s per storey by lift or stairs, including the wait
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const centre = (b) => ({ x: b.foot.x + b.foot.w / 2, z: b.foot.z + b.foot.d / 2 });
const clampTo = (p, f) => ({ x: Math.min(Math.max(p.x, f.x), f.x + f.w), z: Math.min(Math.max(p.z, f.z), f.z + f.d) });
/* Room spot inside a floor: pinned position (u, v ∈ 0..1 across the footprint) or the floor centre. */
export const roomSpot = (b, room) => (room && room.u != null ? { x: b.foot.x + room.u * b.foot.w, z: b.foot.z + room.v * b.foot.d } : centre(b));

export function buildGraph() {
  const nodes = new Map(), adj = new Map();
  const node = (id, n) => { nodes.set(id, { id, ...n }); adj.set(id, []); return id; };
  const edge = (a, b, kind, secs) => { const s = secs ?? dist(nodes.get(a), nodes.get(b)) / WALK; adj.get(a).push({ to: b, kind, s }); adj.get(b).push({ to: a, kind, s }); };
  for (const b of BLOCKS) {
    const c = centre(b);
    for (const f of floorsOf(b)) {
      node(`${b.id}|${f}|core`, { ...b.core, f, block: b.id, kind: "core" });
      node(`${b.id}|${f}|hall`, { ...c, f, block: b.id, kind: "hall" });
      edge(`${b.id}|${f}|core`, `${b.id}|${f}|hall`, "inside");
      if (f > b.low) edge(`${b.id}|${f - 1}|core`, `${b.id}|${f}|core`, "vert", PER_FLOOR);
    }
  }
  for (const l of LINKS) {
    const A = blockById(l.a), B = blockById(l.b);
    const ca = clampTo(centre(B), A.foot), cb = clampTo(centre(A), B.foot), mid = { x: (ca.x + cb.x) / 2, z: (ca.z + cb.z) / 2 };
    for (let f = Math.max(A.low, B.low); f <= Math.min(A.top, B.top); f++) {
      if (l.only ? !l.only.includes(f) : (l.except || []).includes(f)) continue;
      const id = node(`L|${l.a}|${l.b}|${f}`, { ...mid, f, block: null, kind: "link", between: [l.a, l.b] });
      edge(`${l.a}|${f}|hall`, id, "cross"); edge(id, `${l.b}|${f}|hall`, "cross");
    }
  }
  for (const [k, w] of Object.entries(WAYPOINTS)) node(`W|${k}`, { x: w.x, z: w.z, f: 0, block: null, kind: "out", name: w.name });
  PATHS.forEach(([a, b]) => edge(`W|${a}`, `W|${b}`, "out"));
  for (const [blk, ws] of Object.entries(DOORS)) ws.forEach((w) => edge(`W|${w}`, `${blk}|0|core`, "enter"));
  BLOCKS.filter((b) => b.off).forEach((b) => edge(`W|${b.via}`, `${b.id}|0|core`, "street", b.off / WALK));
  return { nodes, adj };
}

let G = null;
const graph = () => (G = G || buildGraph());

/* Start/goal "places": { kind: "gate", id: "E1" } | { kind: "room", code } | { kind: "block", block, floor }. */
export function placeNode(place, userRooms = []) {
  const g = graph();
  if (!place) return null;
  if (place.kind === "gate") return g.nodes.has(`W|${place.id}`) ? { id: `W|${place.id}`, label: WAYPOINTS[place.id].name } : null;
  if (place.kind === "block") { const b = blockById(place.block); if (!b) return null; const f = Math.min(Math.max(place.floor ?? 0, b.low), b.top); return { id: `${b.id}|${f}|hall`, label: `${b.name}, ${floorLabel(f)}`, block: b.id, floor: f }; }
  const r = resolveRoom(place.code, userRooms);
  if (!r || !r.block) return null;
  const b = blockById(r.block);
  if (!b || r.floor < b.low || r.floor > b.top) return null;
  return { id: `${b.id}|${r.floor}|hall`, label: `Room ${r.code}`, room: r, block: b.id, floor: r.floor, spot: roomSpot(b, r) };
}

export function route(from, to, userRooms = []) {
  const g = graph(), a = placeNode(from, userRooms), b = placeNode(to, userRooms);
  if (!a || !b || !g.nodes.has(a.id) || !g.nodes.has(b.id)) return null;
  const best = new Map([[a.id, 0]]), prev = new Map(), done = new Set();
  const open = [a.id];
  while (open.length) {
    open.sort((x, y) => best.get(x) - best.get(y));
    const u = open.shift();
    if (done.has(u)) continue;
    done.add(u);
    if (u === b.id) break;
    for (const e of g.adj.get(u)) {
      const s = best.get(u) + e.s;
      if (s < (best.get(e.to) ?? Infinity)) { best.set(e.to, s); prev.set(e.to, { from: u, kind: e.kind, s: e.s }); open.push(e.to); }
    }
  }
  if (!best.has(b.id)) return null;
  const hops = [];
  for (let v = b.id; v !== a.id; v = prev.get(v).from) hops.unshift({ ...prev.get(v), to: v });
  const pts = [a.spot || g.nodes.get(a.id), ...hops.map((h) => g.nodes.get(h.to))].map((n, i) => ({ x: n.x, z: n.z, f: i === 0 ? (a.floor ?? g.nodes.get(a.id).f) : n.f }));
  if (b.spot) pts.push({ ...b.spot, f: b.floor });
  const metres = hops.filter((h) => h.kind !== "vert").reduce((m, h) => m + h.s * WALK, 0);
  return { from: a, to: b, hops, points: pts, seconds: Math.round(best.get(b.id)), metres: Math.round(metres), steps: describe(a, b, hops, g) };
}

/* Turn hops into short instructions. */
function describe(a, b, hops, g) {
  const steps = [], add = (ic, text, s) => { const last = steps[steps.length - 1]; if (last && last.merge && last.merge === text) { last.s += s; return; } steps.push({ ic, text, s, merge: text }); };
  const startNode = g.nodes.get(a.id);
  steps.push({ ic: "pin", text: `Start at ${a.label}`, s: 0 });
  for (let i = 0; i < hops.length; i++) {
    const h = hops[i], n = g.nodes.get(h.to), p = g.nodes.get(h.from);
    if (h.kind === "vert") {
      let j = i; while (hops[j + 1]?.kind === "vert") j++;
      const fNode = g.nodes.get(hops[j].to), blk = blockById(fNode.block);
      add("up", `Take the lift or stairs${blk.lobby ? ` at ${blk.lobby}` : ""} in ${blk.name} ${fNode.f > p.f ? "up" : "down"} to the ${floorLabel(fNode.f)}`, hops.slice(i, j + 1).reduce((x, y) => x + y.s, 0));
      i = j;
    } else if (h.kind === "cross" && n.kind === "link") {
      const into = n.between.find((x) => x !== p.block);
      add("arrow", `Cross into ${blockById(into).name} on the ${floorLabel(n.f)}`, h.s + (hops[i + 1]?.s || 0)); i++;
    } else if (h.kind === "street") add("map", `Walk about ${Math.round(h.s * WALK)} m to ${blockById(n.block).name} (outside the main campus)`, h.s);
    else if (h.kind === "enter") add("door", n.kind === "core" ? `Enter ${blockById(n.block).name}${blockById(n.block).lobby ? ` at ${blockById(n.block).lobby}` : ""}` : `Leave ${blockById(p.block).name} to the courtyard routes`, h.s);
    else if (h.kind === "out") add("map", "Walk along the campus access route", h.s);
    else if (h.kind === "inside" && i === hops.length - 1) add("door", `Walk to the ${b.room ? "room" : "floor centre"}`, h.s);
  }
  const r = b.room;
  steps.push({ ic: "flag", text: r ? `Room ${r.code}${r.name ? ` · ${r.name}` : ""} is on the ${floorLabel(r.floor)} of ${blockById(r.block).name}${r.u == null ? ". Its exact spot on the floor isn't mapped yet; follow the room signs." : "."}` : `You've reached ${b.label}`, s: 0 });
  if (startNode.kind === "out" && steps[1]?.text.startsWith("Walk along") && steps.length > 3) steps[1].text = `From ${a.label}, walk along the access route`;
  return steps.map(({ merge, ...s }) => ({ ...s, s: Math.round(s.s) }));
}

export const fmtWalk = (secs) => (secs < 60 ? "under 1 min" : `${Math.round(secs / 60)} min`);
