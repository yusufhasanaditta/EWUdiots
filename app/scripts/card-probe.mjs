// Probe: synthetic (fake) ID card "photos" → the app's card reader. Sideways, small, blurred, on a desk background.
import puppeteer from "puppeteer-core";
import { createServer } from "vite";
import { resolve } from "node:path";
import sharp from "sharp";
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const card = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1012" height="638"><rect width="1012" height="638" rx="30" fill="#fff"/><rect width="1012" height="120" fill="#1e3a8a"/>
  <text x="40" y="80" font-family="Arial" font-size="52" font-weight="700" fill="#fff">EAST WEST UNIVERSITY</text><rect x="40" y="170" width="250" height="300" fill="#cbd5e1"/>
  <text x="330" y="230" font-family="Arial" font-size="40" fill="#111">TANVIR TEST HASAN</text><text x="330" y="310" font-family="Arial" font-size="40" fill="#111">ID: 2026-1-60-001</text>
  <text x="330" y="390" font-family="Arial" font-size="36" fill="#333">B.Sc. in CSE</text></svg>`)).png().toBuffer();
// Portrait layout like a real EWU card (fake details): STUDENT band, logo, photo, name, EWU ID, Unique ID.
const portrait = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="1010"><rect width="640" height="1010" rx="30" fill="#f8f8f6"/><rect width="640" height="130" fill="#1e2a5e"/>
  <text x="320" y="90" text-anchor="middle" font-family="Arial" font-size="72" font-weight="700" fill="#fff">STUDENT</text><text x="230" y="230" font-family="Arial" font-size="44" font-weight="700" fill="#1e2a5e">EAST WEST</text>
  <rect x="180" y="310" width="290" height="350" fill="#dfe3ea" stroke="#111" stroke-width="3"/><text x="320" y="720" text-anchor="middle" font-family="Arial" font-size="40" fill="#111">Md. Tanvir Hasan</text>
  <text x="320" y="790" text-anchor="middle" font-family="Arial" font-size="44" fill="#111">EWU ID: 2026-1-60-001</text><text x="320" y="850" text-anchor="middle" font-family="Arial" font-size="36" fill="#111">Unique ID:  00926105101001</text>
  <text x="320" y="975" text-anchor="middle" font-family="Arial" font-size="32" font-weight="700" fill="#111">Holder's Signature</text></svg>`)).png().toBuffer();
const onDesk = (img, w, h) => sharp({ create: { width: w, height: h, channels: 3, background: "#6b5b4b" } }).composite([{ input: img }]);
const variants = {
  "EWU portrait card": await sharp(portrait).jpeg({ quality: 80 }).toBuffer(),
  "EWU card shot sideways": await sharp(portrait).rotate(90).resize(1000).blur(0.8).jpeg({ quality: 72 }).toBuffer(),
  upright: await sharp(card).jpeg({ quality: 80 }).toBuffer(),
  "photo on desk": await onDesk(await sharp(card).resize(800).toBuffer(), 1200, 900).blur(1.2).jpeg({ quality: 70 }).toBuffer(),
  "sideways (portrait shot)": await onDesk(await sharp(card).resize(800).rotate(90).toBuffer(), 900, 1200).blur(1).jpeg({ quality: 70 }).toBuffer(),
  "upside down": await sharp(card).rotate(180).resize(900).jpeg({ quality: 75 }).toBuffer(),
  "small + blurry": await sharp(card).resize(420).blur(0.8).jpeg({ quality: 60 }).toBuffer()
};
const server = await createServer({ root: resolve("."), logLevel: "silent", server: { port: 5198, strictPort: true }, mode: "test" }); await server.listen();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const p = await browser.newPage(); await p.goto("http://localhost:5198/privacy.html");
let ok = 0;
for (const [name, buf] of Object.entries(variants)) {
  const t0 = Date.now();
  const r = await p.evaluate(async (u) => { const { readCard } = await import("/src/ui-idcard.js"); return readCard(u); }, "data:image/jpeg;base64," + buf.toString("base64")).catch((e) => ({ error: e.message }));
  if (r.id === "2026-1-60-001") ok++;
  if (/portrait|EWU card/.test(name) && !/Tanvir Hasan/.test(r.name || "")) console.log("  (name read as:", r.name, ")");
  console.log(`${r.id === "2026-1-60-001" ? "PASS" : "FAIL"}  ${name}: id=${r.id || "-"} name=${r.name || "-"} (${Date.now() - t0} ms)${r.error ? " " + r.error : ""}`);
}
console.log(`${ok}/${Object.keys(variants).length} cards read`);
await browser.close(); await server.close();
