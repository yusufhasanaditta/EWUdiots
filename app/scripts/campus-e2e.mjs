// End-to-end test of the campus map (3D + 2D, routes, walk, tour, places, room register, floor plans) and the ID card.
// Usage: npm run build && node scripts/campus-e2e.mjs   (SHOTS=<dir> also saves screenshots)
// The ID card is a synthetic image drawn by this script; never use a real card here.
import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { preview } from "vite";
import { resolve, join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 4179, BASE = `http://localhost:${PORT}`, SHOTS = process.env.SHOTS;
const errors = [], results = [];
const check = (name, ok, extra = "") => { results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); if (!ok) process.exitCode = 1; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

// Synthetic test card + floor plan.
const tmp = join(tmpdir(), "ewudiots-campus-e2e"); mkdirSync(tmp, { recursive: true });
const cardPng = join(tmp, "card.png"), planPng = join(tmp, "plan.png");
await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1012" height="638"><rect width="1012" height="638" fill="#fff"/><rect width="1012" height="120" fill="#1e3a8a"/>
  <text x="40" y="80" font-family="Arial" font-size="52" font-weight="700" fill="#fff">EAST WEST UNIVERSITY</text><rect x="40" y="170" width="250" height="300" fill="#cbd5e1"/>
  <text x="330" y="230" font-family="Arial" font-size="44" fill="#000">Name: Tanvir Test Hasan</text><text x="330" y="310" font-family="Arial" font-size="44" fill="#000">ID: 2026-1-60-001</text>
  <text x="330" y="390" font-family="Arial" font-size="44" fill="#000">Dept: CSE</text></svg>`)).png().toFile(cardPng);
await sharp({ create: { width: 600, height: 600, channels: 3, background: "#f1f5f9" } }).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect x="20" y="20" width="560" height="560" fill="none" stroke="#000" stroke-width="8"/><line x1="300" y1="20" x2="300" y2="580" stroke="#000" stroke-width="4"/><text x="60" y="120" font-size="40" font-family="Arial">636</text></svg>`) }]).png().toFile(planPng);

process.env.NOTICES_FIXTURE = resolve("tests/fixtures/ewu-notice-board.html"); // /api/notices serves a saved copy of the board
const server = await preview({ root: resolve("."), logLevel: "silent", preview: { port: PORT, strictPort: true } });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await browser.newPage();
p.on("pageerror", (e) => errors.push(e.message));
p.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|favicon|Failed to load resource|overrides\.json/.test(m.text())) errors.push(m.text()); });
// Screen changes animate (View Transitions), so wait until the new screen is painted before reading it.
const painted = (h) => p.waitForFunction((x) => { const id = x.replace(/^#\/?/, "").split("?")[0] || "home"; const pg = document.querySelector("[data-page]")?.dataset.page; return pg === id || ["off", "welcome", "notfound", "profile"].includes(pg); }, { timeout: 4000 }, h).catch(() => {});
const go = async (h, ms = 450) => { await p.evaluate((x) => { location.hash = x; }, h); await painted(h); await wait(ms); };
const click = async (sel, ms = 350) => { await p.$eval(sel, (el) => el.click()); await wait(ms); };
const text = () => p.$eval("body", (b) => b.innerText);
const state = () => p.evaluate(() => JSON.parse(localStorage.getItem("ewudiots.v2") || "{}"));
const noHScroll = () => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const shot = async (name) => { if (SHOTS) await p.screenshot({ path: join(SHOTS, name + ".png") }); };
const today = "SMTWRFA"[new Date().getDay()];

try {
  for (const [vp, label] of [[{ width: 1440, height: 900 }, "desk"], [{ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, "phone"]]) {
    await p.setViewport(vp);
    await p.goto(BASE + "/app.html", { waitUntil: "networkidle2" });
    await p.evaluate((d) => { localStorage.clear(); localStorage.setItem("ewudiots.v2", JSON.stringify({ onboarded: true, role: "student", profile: { name: "Tanvir Test", id: "2026-1-60-001" }, routineSem: "Fall-2026",
      routine: [{ id: "a", code: "CSE106", days: d, start: "00:01", end: "00:02", room: "AB2-702" }, { id: "b", code: "CSE207", days: d, start: "23:57", end: "23:59", room: "636" }] })); }, today);
    await p.reload({ waitUntil: "networkidle2" }); await wait(300);

    if (label === "desk") {
      // Home: directions strip for the next class.
      check("home shows directions to next class", /Directions to 636/.test(await text()));
      await go("#/map", 2500);
      check("map page renders", /Campus Map/.test(await text()) && !!(await p.$("#cm-form")));
      const has3d = await p.evaluate(() => !!document.querySelector(".c3-host canvas"));
      check("3D campus canvas mounted (WebGL)", has3d);
      const painted = await p.evaluate(() => { const c = document.querySelector(".c3-host canvas"); if (!c) return false; const g = document.createElement("canvas"); g.width = 40; g.height = 40; const x = g.getContext("2d"); x.drawImage(c, 0, 0, 40, 40); const d = x.getImageData(0, 0, 40, 40).data; const set = new Set(); for (let i = 0; i < d.length; i += 4) set.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`); return set.size > 12; });
      check("3D scene actually draws buildings", painted);
      check("block labels rendered", (await p.$$eval(".c3-tag", (t) => t.length)) >= 8);
      await shot("map-desk-3d");

      // Route by room number.
      await p.$eval("#cm-to", (i) => { i.value = "636"; }); await click("#cm-form button.primary", 900);
      let t = await text();
      check("route to 636 found", /Room 636/.test(t) && /min/.test(t));
      check("route says C-South 5th floor", /Block C \(South\)/.test(t) && /5th floor/.test(t));
      check("route uses a lift lobby", /Lobby #4/.test(t));
      await shot("map-desk-route");

      // Off-campus building + FUB.
      await p.$eval("#cm-to", (i) => { i.value = "AB2-702"; }); await click("#cm-form button.primary", 700);
      check("route to AB2-702 goes off campus", /Academic Building 2/.test(await text()) && /140 m|outside the main campus/.test(await text()));
      await p.$eval("#cm-to", (i) => { i.value = "Canteen"; }); await click("#cm-form button.primary", 700);
      check("route to a directory place (Canteen → Block D B1)", /Canteen is on the B1/.test(await text()));
      await p.$eval("#cm-to", (i) => { i.value = "zzz"; }); await click("#cm-form button.primary", 500);
      check("unknown place shows a helpful error", /couldn't place/.test(await text()));

      // Guided tour.
      await p.$eval("#cm-to", (i) => { i.value = "805"; }); await click("#cm-form button.primary", 800);
      await click("#cm-tour", 2500);
      const prog = await p.$eval("#tour-bar", (b) => parseFloat(b.style.width) || 0);
      check("guided 3D tour moves along the route", prog > 0, `${prog}%`);
      await shot("map-desk-tour");
      await click("#tour-exit", 400);
      check("tour exit restores tools", await p.$eval(".c3-tools", (e) => !e.hidden));

      // Walk mode.
      await click("#c3-walk", 400);
      check("walk mode UI visible", await p.$eval("#c3-walkui", (e) => !e.hidden));
      await p.keyboard.down("w"); await wait(700); await p.keyboard.up("w");
      await shot("map-desk-walk");
      await click("#c3-exit", 300);

      // Block picking via 2D, floor chips.
      await click('[data-view="2d"]', 600);
      check("2D map renders", !!(await p.$("svg.c2")));
      await p.$eval('[data-blk="CS"]', (g) => g.dispatchEvent(new MouseEvent("click", { bubbles: true }))); await wait(300);
      check("block panel lists CSE on 5th floor", /Block C \(South\)/.test(await text()));
      await click('[data-fl="5"]', 300);
      check("floor chip shows Dept. of CSE", /Dept\. of CSE/.test(await text()));
      await shot("map-desk-2d-block");
      await click('[data-view="3d"]', 1800);

      // Places tab.
      await click('[data-ctab="places"]', 500);
      t = await text();
      check("places: directory + library hours + clubs", /Lasker Library/.test(t) && /Sunday – Thursday/.test(t) && /Robotics Club/.test(t));
      await p.type("#pl-q", "registrar"); await wait(500);
      check("places search filters", /Registrar/.test(await text()) && !/Canteen/.test(await text()));
      await shot("map-desk-places");

      // Rooms & plans: add room, check room, upload plan.
      await click('[data-ctab="data"]', 500);
      await p.$eval("#rd-check", (i) => { i.value = "448"; }); await click("#rd-checkgo", 300);
      check("room checker explains its guess", /Room 448/.test(await text()));
      await click("#rd-add", 400);
      await p.type('#rm-form [name="code"]', "322"); await p.$eval('#rm-form [name="code"]', (i) => i.dispatchEvent(new Event("change"))); await wait(200);
      await p.select('#rm-form [name="block"]', "B"); await p.$eval('#rm-form [name="block"]', (s) => s.dispatchEvent(new Event("change"))); await wait(100);
      await p.select('#rm-form [name="floor"]', "2"); await p.type('#rm-form [name="name"]', "Test Lab");
      await click("#rm-form button.primary", 500);
      let S = await state();
      check("user room saved", S.campus?.rooms?.some((r) => r.code === "322" && r.block === "B" && r.floor === 2));
      await p.$eval("#rd-check", (i) => { i.value = "322"; }); await click("#rd-checkgo", 300);
      check("user room overrides the guess", /Room 322: Block B, 2nd floor/.test(await text()) && /Added by you/.test(await text()));
      await click('[data-up="CS|5"]', 400);
      await (await p.$("#pl-file")).uploadFile(planPng); await wait(900);
      await click("#pl-rot", 500); await click("#pl-save", 700);
      check("floor plan saved", /1 \/ \d+ floors/.test(await text()));
      await shot("map-desk-data");
      // Pin a room on the uploaded plan.
      await click("#rd-add", 400);
      await p.type('#rm-form [name="code"]', "640"); await p.$eval('#rm-form [name="code"]', (i) => i.dispatchEvent(new Event("change"))); await wait(300);
      const pp = await p.$(".pin-plan");
      check("pin-on-plan appears for a floor with a plan", !!pp);
      if (pp) { const b = await pp.boundingBox(); await p.mouse.click(b.x + b.width * 0.3, b.y + b.height * 0.4); await wait(200); }
      await click("#rm-form button.primary", 400);
      S = await state();
      const r640 = S.campus.rooms.find((r) => r.code === "640");
      check("pinned room stores its spot", r640 && r640.u > 0.2 && r640.u < 0.4 && r640.v > 0.3 && r640.v < 0.5);
      check("map has no JS errors so far", errors.length === 0, errors.join(" | "));

      // Official faculty directory with photos.
      await go("#/faculty", 1800);
      t = await text();
      check("faculty directory lists the official faculty", /\d{3} faculty members/.test(t) && (await p.$$eval(".lcard", (c) => c.length)) >= 60);
      const photos = await p.$$eval(".lcard .face img", (i) => i.length);
      check("faculty cards show photos", photos >= 30, `${photos} photos`);
      await p.type("#fac-q", "Hosney"); await wait(700);
      check("faculty search finds by name", /Hosney Jahan/.test(await text()));
      await click(".lcard", 900);
      t = await text();
      check("faculty profile: title, office, directions, official link", /Assistant Professor/.test(t) && /Room 636/.test(t) && /Directions/.test(t) && /Full profile on ewubd\.edu/.test(t));
      await shot("faculty-profile");
      await go("#/faculty", 600); await p.$eval("#fac-q", (i) => { i.value = ""; i.dispatchEvent(new Event("input")); }); await wait(600);
      await shot("faculty-list");

      // Notice board from the official site.
      await go("#/notices", 1500);
      check("notice board lists official EWU notices", (await p.$$eval(".nb-item", (n) => n.length)) >= 10);
      check("recent notices marked New", (await p.$$eval(".nb-item.new", (n) => n.length)) >= 1);
      await click('[data-ncat="Advising"]', 400);
      check("notice category filter", /Pre-advising/i.test(await text()) && !/RFID/.test(await text()));
      await shot("notices");
      await go("#/home", 600);
      check("home shows the EWU notice board card", /EWU Notice Board/.test(await text()));
      await go("#/notifications", 500);
      check("new notices appear in Notifications", /New EWU notice/.test(await text()));

      // Palette: typing a room offers directions.
      await go("#/home", 300);
      await p.keyboard.down("Control"); await p.keyboard.press("k"); await p.keyboard.up("Control"); await wait(300);
      await p.type("#pal-q", "560"); await wait(200);
      check("search offers 'Directions to room 560'", /Directions to room 560/.test(await text()));
      await p.keyboard.press("Enter"); await wait(1500);
      check("palette opens the route", /Room 560/.test(await text()) && (await p.evaluate(() => location.hash)) === "#/map");
    }

    if (label === "phone") {
      await go("#/map", 2500);
      check("phone: map fits the screen", await noHScroll());
      await p.$eval("#cm-to", (i) => { i.value = "FUB-1001"; }); await click("#cm-form button.primary", 900);
      check("phone: route to FUB-1001 (9th floor)", /9th floor/.test(await text()));
      await shot("map-phone");
      await click("#c3-walk", 400);
      check("phone: joystick shown in walk mode", await p.$eval("#joy", (j) => j.getBoundingClientRect().width > 40));
      await click("#c3-exit", 300);

      // ID card: front + back (both required) → OCR → confirm → crop → pass.
      await go("#/idcard", 500);
      check("ID card empty state", /Add your ID card/.test(await text()));
      await click("#idc-scan", 400);
      check("asks for the front side first", /Photo of the front side/.test(await p.$eval("#modal", (m) => m.innerText)) && !(await p.$("#id-form")));
      await (await p.$('input[data-side="front"]:not([capture])')).uploadFile(cardPng);
      await p.waitForSelector('input[data-side="back"]', { timeout: 10000 });
      check("then requires the back side", /Now the back side/.test(await p.$eval("#modal", (m) => m.innerText)) && !(await p.$("#id-form")));
      await (await p.$('input[data-side="back"]:not([capture])')).uploadFile(cardPng);
      await p.waitForSelector("#id-form", { timeout: 90000 });
      const got = await p.$eval('#id-form [name="id"]', (i) => i.value);
      check("OCR reads the student ID from the card", got === "2026-1-60-001", got);
      const nm = await p.$eval('#id-form [name="name"]', (i) => i.value);
      check("OCR reads the name", /Tanvir/.test(nm), nm);
      await shot("id-confirm");
      await click('#id-form button.primary', 500);
      check("crop step shown", !!(await p.$("#cb-ok")));
      await click("#cb-ok", 900);
      const S = await state();
      check("ID card saved to account", S.idcard?.id === "2026-1-60-001" && S.idcard.hasScan && S.idcard.hasBack && S.idcard.hasPhoto);
      check("3D pass renders with QR + unofficial label", !!(await p.$(".idc .idc-qr svg")) && /Unofficial · not an EWU-issued ID/.test(await text()));
      await click("#idc-flip", 600);
      check("card flips to the scan side", await p.$eval("#idc", (c) => c.classList.contains("flipped")));
      await shot("id-back");
      await click("#idc-flip", 600);
      await shot("id-front");
      check("phone: ID page fits the screen", await noHScroll());
      await go("#/more", 300);
      check("More has Campus Map + My ID Card", /Campus Map/.test(await text()) && /My ID Card/.test(await text()));
      await go("#/profile", 300);
      check("profile shows ID card row", /My ID Card/.test(await text()) && /2026-1-60-001/.test(await text()));

      // Dark mode render.
      await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("ewudiots.v2")); s.theme = "dark"; localStorage.setItem("ewudiots.v2", JSON.stringify(s)); });
      await p.reload({ waitUntil: "networkidle2" }); await go("#/map", 2500); await shot("map-phone-dark");
      await go("#/idcard", 600); await shot("id-dark");

      // Clearing the device must also delete the card scan + photo (IndexedDB), not just localStorage.
      const idKeys = () => p.evaluate(() => new Promise((res) => { const r = indexedDB.open("ewudiots-blobs", 1); r.onsuccess = () => { const q = r.result.transaction("b").objectStore("b").getAllKeys(); q.onsuccess = () => res(q.result.filter((k) => String(k).startsWith("id:"))); }; }));
      check("card images (front, back, photo) stored on device", (await idKeys()).length === 3);
      await go("#/profile", 400); await click("#pf-wipe", 400); await click("#cf-go", 900);
      check("Clear Local Data deletes the card scan and photo", (await idKeys()).length === 0);
    }
  }
  check("no JS errors", errors.length === 0, errors.join(" | "));
} catch (e) { check("run completed", false, e.stack); }
finally {
  console.log(results.join("\n"));
  console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
  await browser.close(); await server.close();
}
