/* EWU campus model: blocks, floors, links, directory and room register. Pure data + helpers (no DOM), so it's unit-tested.
   Geometry is traced from the official EWU campus map ("Access route for lift and stair lobbies at ground floor",
   ewubd.edu/access-map, printed in the Spring 2025 newsletter): pixel coordinates below × 0.2 m, origin = courtyard centre,
   +x = east, +z = south. Block footprints are approximate (±3 m); room positions inside a floor are unknown until a
   floor plan is uploaded and the room is pinned on it. */

export const FLOOR_H = 3.6; // metres per storey
const PX = 0.2, CX = 490, CY = 262;
const rect = (x1, y1, x2, y2) => ({ x: (x1 - CX) * PX, z: (y1 - CY) * PX, w: (x2 - x1) * PX, d: (y2 - y1) * PX });
const pt = (x, y) => ({ x: (x - CX) * PX, z: (y - CY) * PX });

/* Floors: -2 = B2, -1 = B1, 0 = ground floor (GF), 1 = 1st floor … (counts from the map's "Block Information" legend). */
export const BLOCKS = [
  { id: "ADMIN", name: "Admin Block", short: "Admin", foot: rect(648, 230, 740, 500), low: -2, top: 5, core: pt(668, 430), lobby: "Lobby #1", color: "#a84a3c" },
  { id: "A", name: "Block A", short: "A", foot: rect(610, 65, 740, 212), low: -2, top: 7, core: pt(640, 85), lobby: "Lobby #2", color: "#b0503f" },
  { id: "B", name: "Block B", short: "B", foot: rect(325, 70, 590, 195), low: -2, top: 5, core: pt(455, 150), color: "#a3473a" },
  { id: "CN", name: "Block C (North)", short: "C-North", foot: rect(160, 80, 275, 200), low: -2, top: 8, core: pt(262, 100), lobby: "Lobby #3", color: "#9e4436" },
  { id: "CM", name: "Block C (Middle)", short: "C-Mid", foot: rect(160, 262, 228, 340), low: -2, top: 6, core: pt(194, 301), color: "#ad4d3d", hex: true },
  { id: "CS", name: "Block C (South)", short: "C-South", foot: rect(198, 345, 345, 492), low: -2, top: 7, core: pt(268, 395), lobby: "Lobby #4", color: "#a54839" },
  { id: "D", name: "Block D", short: "D", foot: rect(385, 360, 598, 485), low: -2, top: 2, core: pt(560, 440), color: "#b25441" },
  { id: "FUB", name: "Farashuddin Bhaban (FUB)", short: "FUB", foot: rect(180, 520, 350, 622), low: -1, top: 9, core: pt(262, 595), lobby: "Lobby #5", color: "#9c4a3b" },
  // Off-campus academic buildings (walking distances from the location map; footprint and floor count approximate).
  { id: "AB1", name: "Academic Building 1", short: "AB1", foot: { x: -12, z: 128, w: 24, d: 18 }, low: 0, top: 9, core: { x: 0, z: 128 }, color: "#8d5a4a", off: 190, via: "E1", approx: true },
  { id: "AB2", name: "Academic Building 2", short: "AB2", foot: { x: 88, z: -40, w: 22, d: 18 }, low: 0, top: 7, core: { x: 88, z: -31 }, color: "#8d5a4a", off: 140, via: "E2", approx: true },
  { id: "AB3", name: "Academic Building 3", short: "AB3", foot: { x: 84, z: 92, w: 24, d: 18 }, low: 0, top: 10, core: { x: 84, z: 101 }, color: "#8d5a4a", off: 210, via: "E1", approx: true }
];
export const COURTYARD = rect(340, 195, 640, 330);
export const blockById = (id) => BLOCKS.find((b) => b.id === id);

/* Block connectivity, exactly as the map's legend states it. `except` = floors (1 = 1st floor) with no link. */
export const LINKS = [
  { a: "ADMIN", b: "A", except: [1, 5] },
  { a: "A", b: "B", except: [7] },
  { a: "B", b: "CN", except: [5] },
  { a: "CN", b: "CM", except: [7, 8] },
  { a: "CM", b: "CS", except: [7] },
  { a: "D", b: "ADMIN", except: [3, 4, 5] },
  { a: "FUB", b: "CS", only: [0] }
  // C-South ↔ D: "No access" on the map.
];

/* Ground-floor walking network ("ACCESS ROUTE" dashed lines; step counts are the map's). */
export const WAYPOINTS = {
  E1: { ...pt(660, 548), name: "Entry 1 (main gate)" }, E2: { ...pt(748, 430), name: "Entry 2 (east)" },
  L1: { ...pt(668, 430), name: "Lobby #1" }, L2: { ...pt(640, 85), name: "Lobby #2" }, L3: { ...pt(262, 100), name: "Lobby #3" }, L4: { ...pt(268, 395), name: "Lobby #4" }, L5: { ...pt(300, 595), name: "Lobby #5" },
  P1: pt(330, 100), P2: pt(330, 345), P3: pt(268, 345), P4: pt(668, 345), P5: pt(668, 85), P6: pt(668, 470), P7: pt(330, 470), P8: pt(330, 595), P9: pt(330, 300),
  YARD: { ...pt(490, 262), name: "EWU Courtyard" }, BDOOR: pt(455, 195), DDOOR: pt(490, 360), DSOUTH: pt(560, 470), CMDOOR: pt(228, 300)
};
export const PATHS = [["L3", "P1"], ["P1", "P9"], ["P9", "P2"], ["P2", "P3"], ["P3", "L4"], ["P2", "P4"], ["L2", "P5"], ["P5", "P4"], ["P4", "L1"], ["L1", "E2"], ["L1", "P6"], ["P6", "E1"], ["P6", "DSOUTH"], ["DSOUTH", "P7"], ["P6", "P7"], ["P7", "P8"], ["P8", "L5"],
  ["P9", "CMDOOR"], ["YARD", "P2"], ["YARD", "P4"], ["YARD", "BDOOR"], ["YARD", "DDOOR"], ["DDOOR", "P2"], ["DDOOR", "P4"]];
/* Where each ground floor meets the outdoor network. */
export const DOORS = { ADMIN: ["L1"], A: ["L2"], B: ["BDOOR"], CN: ["L3"], CM: ["CMDOOR"], CS: ["L4"], D: ["DDOOR"], FUB: ["L5"] };

export const floorLabel = (f) => (f === 0 ? "Ground floor" : f < 0 ? `B${-f} (basement)` : `${f}${["th", "st", "nd", "rd"][(f % 100 > 10 && f % 100 < 14) || f % 10 > 3 ? 0 : f % 10]} floor`);
export const floorShort = (f) => (f === 0 ? "GF" : f < 0 ? `B${-f}` : String(f));
export const floorsOf = (b) => Array.from({ length: b.top - b.low + 1 }, (_, i) => b.low + i);

/* Offices and facilities from the official map's directory (block + floor). */
export const DIRECTORY = [
  ["Chairperson, Board of Trustees", "ADMIN", 5, "office"], ["Chief Advisor", "ADMIN", 5, "office"], ["Vice Chancellor", "ADMIN", 4, "office"], ["Pro Vice Chancellor", "ADMIN", 4, "office"],
  ["Treasurer", "ADMIN", 2, "office"], ["Registrar", "ADMIN", 3, "office"], ["Reception", "ADMIN", 0, "service"],
  ["M. A. Mumin Admission Office", "ADMIN", 1, "service"], ["Accounts Office", "ADMIN", 1, "service"], ["Bank Booth", "ADMIN", 1, "service"], ["Center for Research & Training (CRT)", "ADMIN", 1, "service"],
  ["Controller of Examinations", "ADMIN", 2, "service"], ["Director of Finance", "ADMIN", 2, "service"], ["Internal Audit", "ADMIN", 2, "service"], ["Students' Welfare (DSW)", "ADMIN", 2, "service"],
  ["Career Counseling Center (lobby)", "ADMIN", 2, "service"], ["Information & Communication Services (ICS)", "ADMIN", 3, "service"], ["HR & Logistics", "ADMIN", 4, "service"], ["Engineering & Maintenance Dept.", "ADMIN", -1, "service"],
  ["Dean's Office", "CN", 0, "dept"], ["MBA & EMBA", "CN", 0, "dept"], ["Dept. of English", "CN", 1, "dept"], ["Dept. of Economics", "CN", 2, "dept"], ["Dept. of Law", "CN", 7, "dept"], ["Dept. of Social Relations", "CN", 8, "dept"],
  ["Dept. of Business Administration", "A", 3, "dept"], ["Dept. of Sociology", "A", 6, "dept"], ["Dept. of Information Studies", "A", 6, "dept"], ["Dept. of Genetic Eng. & Biotechnology", "A", 7, "dept"],
  ["Dept. of Civil Engineering", "CS", 3, "dept"], ["Dept. of EEE", "CS", 4, "dept"], ["Dept. of CSE", "CS", 5, "dept"], ["Dept. of Pharmacy", "CS", 6, "dept"], ["Faculty Lounge", "CS", 0, "facility"],
  ["Dept. of Mathematical & Physical Sciences", "FUB", 9, "dept"],
  ["IQAC", "D", 1, "office"], ["Proctor Office", "D", 2, "office"], ["Manzur Elahi Auditorium", "D", 0, "facility"], ["Canteen", "D", -1, "facility"], ["Common Room", "D", -2, "facility"], ["Playground", "D", -2, "facility"], ["Medical Center", "D", 1, "facility"],
  ["Survey Laboratory (Civil)", "D", 2, "lab"],
  ["Computer Practice Lab", "A", 5, "lab"], ["Reading Room", "A", 5, "facility"], ["Prayer Room", "A", 0, "facility"], ["Green Shop", "A", 0, "facility"],
  ["Dr. S. R. Lasker Library", "B", 5, "facility"], ["ICS Computer Lab", "B", 4, "lab"], ["AutoCAD Laboratory (Civil)", "B", 4, "lab"], ["Engineering Drawing Lab (Civil)", "CN", 2, "lab"],
  ["S. M. Nousher Ali Lecture Gallery", "CM", 0, "gallery"], ["Razia Samad Lecture Gallery", "CM", 1, "gallery"], ["Jalaluddin Ahmed Lecture Gallery", "CM", 2, "gallery"], ["Shelley A. Mubdi Lecture Gallery", "CM", 4, "gallery"]
].map(([name, block, floor, kind]) => ({ name, block, floor, kind }));

/* Rooms whose block + floor an EWU source states (or the official map implies). conf: verified | likely. */
const SRC = { map: "Official EWU campus map", crt: "crt.ewubd.edu (seminar rooms / contact)", note: "EWU notices & seminar pages", ccc: "EWU CCC brochure 2025", proc: "EWU procurement notice", res: "result.ewubd.edu (Spring 2026)" };
export const ROOMS = [
  ["126", "S. M. Nousher Ali Lecture Gallery", "CM", 0, "gallery", "verified", "map+note"],
  ["127", "Faculty Lounge", "CS", 0, "facility", "likely", "map+note"],
  ["207", "CRT office · East West Journal of Humanities", "A", 1, "office", "verified", "crt"],
  ["210", "CRT (address in procurement notice)", "A", 1, "office", "verified", "proc"],
  ["238", "English Dept. Seminar Room (CRT Seminar Room-II)", "CN", 1, "seminar", "likely", "crt"],
  ["242", "Razia Samad Lecture Gallery", "CM", 1, "gallery", "verified", "map+note"],
  ["301", "Career Counseling Center", "A", 2, "office", "verified", "ccc"],
  ["354", "Jalaluddin Ahmed Lecture Gallery", "CM", 2, "gallery", "likely", "map+note"],
  ["550", "Shelley A. Mubdi Lecture Gallery", "CM", 4, "gallery", "likely", "map+note"],
  ["560", "CRT Seminar Room-I", "CS", 4, "seminar", "likely", "crt"],
  ["615", "CRT Research Hub", "B", 5, "facility", "likely", "proc"],
  ["FUB-1001", "Viva board room", "FUB", 9, "classroom", "verified", "res"]
].map(([code, name, block, floor, kind, conf, src]) => ({ code, name, block, floor, kind, conf, source: src.split("+").map((s) => SRC[s]).join(" + ") }));

/* Office-room number ranges per block and floor, from the room numbers on EWU faculty profile pages
   (CSE, EEE, Civil, GEB, BBA, English, Law, Sociology, Social Relations; collected 24 Oct 2026). Used to infer the block of a
   room no source names. `n` = last two digits, so 6xx rooms 27–48 on C-South's 5th floor = CSE offices. */
export const RANGES = [
  ["A", 1, 13, 14], ["A", 2, 19, 25], ["A", 3, 19, 27], ["A", 4, 16, 27], ["A", 6, 2, 8], ["A", 7, 5, 10],
  ["CN", 1, 29, 53], ["CN", 7, 14, 31], ["CN", 8, 4, 10],
  ["CS", 3, 53, 59], ["CS", 4, 40, 56], ["CS", 5, 27, 48]
].map(([block, floor, from, to]) => ({ block, floor, from, to }));

const MAIN = BLOCKS.filter((b) => !b.off && b.id !== "FUB");
/* Parse "AB2-702", "FUB 903", "Room 642", "642 (Lab)" → { building?, num, floor }. EWU numbers rooms <floor+1><nn>, so 1xx = GF. */
export function parseRoom(raw) {
  const s = String(raw || "").toUpperCase().replace(/\(.*?\)/g, "").replace(/\bROOM\b|\bNO\.?|#/g, "").replace(/\s+/g, "").trim();
  let m = s.match(/^(AB[1-3]|FUB)-?(\d{3,4})$/);
  if (m) { const num = Number(m[2]); return { code: `${m[1]}-${m[2]}`, building: m[1], num, floor: Math.floor(num / 100) - 1, n: num % 100 }; }
  m = s.match(/^(\d{3,4})$/);
  if (m && Number(m[1]) < 1100) { const num = Number(m[1]); return { code: m[1], building: null, num, floor: Math.floor(num / 100) - 1, n: num % 100 }; }
  return null;
}

/* Where is a room? User-added rooms win, then sourced rooms, then the office-number ranges, then a best guess. */
export function resolveRoom(raw, userRooms = []) {
  const p = parseRoom(raw);
  if (!p) return null;
  const hit = userRooms.find((r) => parseRoom(r.code)?.code === p.code) || ROOMS.find((r) => r.code === p.code);
  if (hit) return { ...p, ...hit, code: p.code, conf: hit.conf || "user" };
  if (p.building) {
    const b = blockById(p.building);
    if (p.floor < b.low || p.floor > b.top) return { ...p, block: b.id, floor: Math.min(Math.max(p.floor, b.low), b.top), conf: "guess", source: "Room number is outside this building's known floors" };
    return { ...p, block: b.id, conf: b.approx ? "likely" : "verified", source: "Building from the room code; floor from the room number" };
  }
  const onFloor = MAIN.filter((b) => p.floor >= b.low && p.floor <= b.top);
  if (!onFloor.length) return { ...p, block: null, conf: "unknown", source: "No main-campus block has this floor" };
  const dist = (r) => (p.n < r.from ? r.from - p.n : p.n > r.to ? p.n - r.to : 0);
  const near = RANGES.filter((r) => r.floor === p.floor && onFloor.some((b) => b.id === r.block)).sort((a, b) => dist(a) - dist(b))[0];
  if (near && dist(near) <= 3) return { ...p, block: near.block, conf: "likely", source: `Matches the office numbers on ${blockById(near.block).name}, ${floorLabel(p.floor)} (EWU faculty pages)` };
  const any = RANGES.filter((r) => onFloor.some((b) => b.id === r.block)).sort((a, b) => dist(a) - dist(b))[0];
  if (onFloor.length === 1) return { ...p, block: onFloor[0].id, conf: "likely", source: `Only ${onFloor[0].name} has a ${floorLabel(p.floor)}` };
  return { ...p, block: any ? any.block : onFloor[0].id, conf: "guess", source: "Best guess from similar room numbers. Add it in Campus data if you know the block." };
}
export const CONF = { verified: ["Verified", "green"], user: ["Added by you", "purple"], likely: ["Likely", "blue"], guess: ["Best guess", "amber"], unknown: ["Unknown", "red"] };

/* Dr. S. R. Lasker Library hours (Spring 2025 newsletter). */
export const LIBRARY_HOURS = [["Sunday – Thursday", "8:30 AM – 10:00 PM"], ["Friday", "8:30 AM – 5:00 PM (1–2 PM break)"], ["Saturday", "5:00 PM – 10:00 PM"]];
export function libraryOpen(d = new Date()) {
  const m = d.getHours() * 60 + d.getMinutes(), day = d.getDay();
  const spans = day === 5 ? [[510, 780], [840, 1020]] : day === 6 ? [[1020, 1320]] : [[510, 1320]];
  const now = spans.find(([s, e]) => m >= s && m < e);
  if (now) return { open: true, until: now[1] };
  const next = spans.find(([s]) => m < s);
  return { open: false, next: next ? next[0] : null };
}

/* Student clubs (DSW club fair list, Spring 2025). */
export const CLUBS = ["Agro-Industrialization Club", "Business Club", "Club for Performing Arts", "Computer Programming Club", "Creative Marketing Club", "Cyber Security Club", "Debating Club", "Economics Club",
  "Electronics Club", "English Conversation Club", "Environmental & Social Club", "Health and Well-Being Club", "IEEE Student Branch", "Investment and Finance Club", "Model United Nations Club",
  "Photography Club", "Robotics Club", "Rotaract Club", "Science Club", "Sociology Club", "Sports Club", "Telecommunication Club"];
