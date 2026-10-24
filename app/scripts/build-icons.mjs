// Renders every icon the web app, Play Store and App Store need from brand/logo.svg.
// Run: npm run icons
import sharp from "sharp";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const logo = readFileSync(join(root, "brand", "logo.svg"));
const out = (p) => { const f = join(root, p); mkdirSync(dirname(f), { recursive: true }); return f; };
const BG = "#5B3DF5";

// Full-bleed square (no rounded corners) for maskable / adaptive icons: logo art inset on a solid field.
const square = Buffer.from(readFileSync(join(root, "brand", "logo.svg"), "utf8").replace(/rx="232"/, 'rx="0"'));

const jobs = [
  // Web / PWA
  ["app/public/icons/icon-192.png", logo, 192],
  ["app/public/icons/icon-512.png", logo, 512],
  ["app/public/icons/maskable-512.png", square, 512],
  ["app/public/icons/apple-touch-icon.png", square, 180],
  ["app/public/favicon-32.png", logo, 32],
  // Capacitor asset sources (npx @capacitor/assets generate)
  ["app/assets/icon-only.png", square, 1024],
  ["app/assets/icon-foreground.png", logo, 1024],
  // Store listings
  ["store/graphics/play-icon-512.png", square, 512],
  ["store/graphics/appstore-icon-1024.png", square, 1024]
];

for (const [path, src, size] of jobs) {
  await sharp(src, { density: 384 }).resize(size, size).png().toFile(out(path));
  console.log("✓", path);
}

// Adaptive-icon background + splash (logo centred on brand colour)
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: BG } }).png().toFile(out("app/assets/icon-background.png"));
const mark = await sharp(logo, { density: 384 }).resize(820, 820).png().toBuffer();
for (const [name, bg] of [["splash.png", "#F6F5FB"], ["splash-dark.png", "#0E0C1D"]]) {
  await sharp({ create: { width: 2732, height: 2732, channels: 4, background: bg } })
    .composite([{ input: mark, gravity: "center" }]).png().toFile(out("app/assets/" + name));
  console.log("✓ app/assets/" + name);
}

// Android notification small icon (white silhouette)
await sharp(readFileSync(join(root, "brand", "mark-mono.svg")), { density: 384 }).resize(96, 96).png().toFile(out("app/assets/ic_stat_notify.png"));
console.log("✓ app/assets/ic_stat_notify.png");

// Chrome extension icons
for (const s of [16, 48, 128]) await sharp(logo, { density: 384 }).resize(s, s).png().toFile(out(`extension/icons/icon-${s}.png`));
console.log("✓ extension/icons");

// Play Store feature graphic (1024×500)
const fg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5B3DF5"/><stop offset="1" stop-color="#9B45D6"/></linearGradient></defs>
<rect width="1024" height="500" fill="url(#g)"/><circle cx="930" cy="40" r="190" fill="#C8F04A" opacity=".16"/>
<text x="330" y="215" font-family="Segoe UI, Arial, sans-serif" font-size="78" font-weight="800" fill="#fff">EWUdiots</text>
<text x="333" y="275" font-family="Segoe UI, Arial, sans-serif" font-size="30" font-weight="600" fill="#ffffff" opacity=".92">Your whole EWU semester, in one app.</text>
<text x="333" y="325" font-family="Segoe UI, Arial, sans-serif" font-size="22" fill="#C8F04A">Routine · Advising · CGPA · Faculty · Fees</text></svg>`);
const mark2 = await sharp(logo, { density: 384 }).resize(230, 230).png().toBuffer();
await sharp(fg).composite([{ input: mark2, left: 70, top: 135 }]).png().toFile(out("store/graphics/feature-graphic-1024x500.png"));
console.log("✓ store/graphics/feature-graphic-1024x500.png");
// Social share image
await sharp(fg).resize(1200, 586).extend({ top: 22, bottom: 22, background: "#5B3DF5" }).composite([{ input: await sharp(logo, { density: 384 }).resize(270, 270).png().toBuffer(), left: 82, top: 170 }]).png().toFile(out("app/public/og-image.png"));
console.log("✓ app/public/og-image.png");
