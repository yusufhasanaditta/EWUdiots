/* Brand colour chosen in the admin panel (Website → Theme). Applied as CSS variables, so no rebuild is needed.
   Shared by the app, the landing page and the admin preview. */
export const PRESETS = [
  ["purple", "Purple (classic)", "#7c3aed"],
  ["red", "EWUdiots red (logo)", "#c8102e"],
  ["blue", "Ocean blue", "#2563eb"],
  ["teal", "Teal", "#0d9488"],
  ["green", "Forest green", "#15803d"]
];
const HEX = /^#[0-9a-f]{6}$/i;
export function themeColor(t = {}) {
  if (HEX.test(t.primary || "")) return t.primary.toLowerCase();
  return (PRESETS.find((p) => p[0] === t.preset) || PRESETS[0])[2];
}
export function applyBrand(t = {}, root = document.documentElement) {
  const c = themeColor(t);
  if (c === PRESETS[0][2]) { ["--primary", "--primary-d", "--primary-l", "--primary-ll", "--grad", "--glow"].forEach((v) => root.style.removeProperty(v)); return c; }
  const n = parseInt(c.slice(1), 16), rgb = `${n >> 16}, ${(n >> 8) & 255}, ${n & 255}`;
  root.style.setProperty("--primary", c);
  root.style.setProperty("--primary-d", `color-mix(in srgb, ${c} 78%, #000)`);
  root.style.setProperty("--primary-l", `color-mix(in srgb, ${c} 16%, var(--surface, #fff))`);
  root.style.setProperty("--primary-ll", `color-mix(in srgb, ${c} 8%, var(--surface, #fff))`);
  root.style.setProperty("--grad", `linear-gradient(135deg, color-mix(in srgb, ${c} 75%, #fff) 0%, ${c} 45%, color-mix(in srgb, ${c} 80%, #000) 100%)`);
  root.style.setProperty("--glow", `0 10px 28px rgba(${rgb}, .35)`);
  return c;
}
