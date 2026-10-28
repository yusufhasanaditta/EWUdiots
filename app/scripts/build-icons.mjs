// Renders every icon the web app, Play Store and App Store need from brand/logo.png (the red "e" app tile).
// Run: npm run icons   (then: npx @capacitor/assets generate --android  for the Android launcher icons)
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = (p) => { const f = join(root, p); mkdirSync(dirname(f), { recursive: true }); return f; };
const RED = "#B00012";

// The tile without the white margin, and with transparent rounded corners.
const tile = await sharp(join(root, "brand", "logo.png")).trim({ threshold: 30 }).toBuffer();
const { width: T } = await sharp(tile).metadata();
const round = (size) => Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.225}" fill="#fff"/></svg>`);
const rounded = await sharp(tile).resize(T, T).composite([{ input: round(T), blend: "dest-in" }]).png().toBuffer();
// Full-bleed square for maskable / adaptive icons: the inside of the tile, past the rounded corners.
const inset = Math.round(T * 0.08);
const full = await sharp(tile).extract({ left: inset, top: inset, width: T - 2 * inset, height: T - 2 * inset }).png().toBuffer();

const jobs = [
  ["app/public/icons/icon-192.png", rounded, 192], ["app/public/icons/icon-512.png", rounded, 512], ["app/public/icons/maskable-512.png", full, 512],
  ["app/public/icons/apple-touch-icon.png", full, 180], ["app/public/favicon-32.png", rounded, 32], ["app/public/logo-mark.png", rounded, 128],
  ["app/assets/icon-only.png", full, 1024], ["app/assets/icon-foreground.png", full, 1024],
  ["store/graphics/play-icon-512.png", full, 512], ["store/graphics/appstore-icon-1024.png", full, 1024],
  ["extension/icons/icon-16.png", rounded, 16], ["extension/icons/icon-48.png", rounded, 48], ["extension/icons/icon-128.png", rounded, 128]
];
for (const [path, src, size] of jobs) { await sharp(src).resize(size, size).png().toFile(out(path)); console.log("✓", path); }

await sharp({ create: { width: 1024, height: 1024, channels: 4, background: RED } }).png().toFile(out("app/assets/icon-background.png"));
const mark = await sharp(rounded).resize(760, 760).png().toBuffer();
for (const [name, bg] of [["splash.png", "#F6F5FB"], ["splash-dark.png", "#0E0C1D"]]) {
  await sharp({ create: { width: 2732, height: 2732, channels: 4, background: bg } }).composite([{ input: mark, gravity: "center" }]).png().toFile(out(`app/assets/${name}`));
  console.log("✓ app/assets/" + name);
}
