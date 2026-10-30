/* EWUdiots Club: small SVG charts (no library). Line/area, grouped bars, donut, progress ring, horizontal bars and
   sparklines. Colours come from --viz-1…5 in clubs.css (validated for colour-blind separation in light and dark).
   Every chart ships a legend with values and a screen-reader table; bindTips() adds the hover/tap tooltip. */

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
/** 1234 → "1.2K", 1500000 → "1.5M". */
export const compact = (n) => { const a = Math.abs(n); return a >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : a >= 1e4 ? `${Math.round(n / 1e3)}K` : a >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : `${+(+n).toFixed(1)}`; };
export const taka = (n) => `৳${Math.round(n).toLocaleString("en-IN")}`;
/** "2026-10" → "Oct". */
export const monthLabel = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
/** A "nice" axis top and step (0, 100, 200…) for a maximum. */
export function niceScale(max) {
  if (!(max > 0)) return { top: 4, step: 1 };
  // Try 3–5 gridlines and keep the tightest top (420 → 500 in steps of 100, not 800).
  return [4, 5, 3].map((ticks) => {
    const raw = max / ticks, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw);
    return { top: step * ticks, step };
  }).reduce((a, b) => (b.top < a.top ? b : a));
}
const table = (caption, head, rows) => `<table class="sr-only"><caption>${esc(caption)}</caption><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table>`;
const legend = (items) => `<div class="viz-legend">${items.map((it, i) => `<span><i style="background:var(--viz-${(it.slot ?? i) + 1})"></i>${esc(it.name)}${it.value != null ? ` <b>${esc(it.value)}</b>` : ""}</span>`).join("")}</div>`;
const empty = (msg) => `<div class="viz-empty">${esc(msg || "No data yet")}</div>`;

/**
 * Line chart (optionally filled) for one or two series over the same labels.
 * @param {{ title: string, labels: string[], series: { name: string, values: number[], area?: boolean }[], fmt?: (n: number) => string, height?: number }} o
 */
export function line({ title, labels, series, fmt = compact, height = 180 }) {
  if (!labels.length || series.every((s) => s.values.every((v) => !v))) return empty("No data for this period yet");
  const W = 340, H = height, L = 34, R = 10, T = 12, B = 24, n = labels.length;
  const { top, step } = niceScale(Math.max(...series.flatMap((s) => s.values)));
  const x = (i) => L + (n === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1)), y = (v) => T + (H - T - B) * (1 - v / top);
  const grid = Array.from({ length: Math.round(top / step) + 1 }, (_, k) => k * step).map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="viz-grid"/><text x="${L - 6}" y="${y(v) + 4}" class="viz-tick" text-anchor="end">${fmt(v)}</text>`).join("");
  const every = Math.ceil(n / 6);
  const xl = labels.map((l, i) => (i % every === 0 || i === n - 1 ? `<text x="${x(i)}" y="${H - 6}" class="viz-tick" text-anchor="middle">${esc(l)}</text>` : "")).join("");
  const paths = series.map((s, si) => {
    const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    const area = s.area ? `<path d="M${pts[0]} L${pts.join(" L")} L${x(n - 1)},${y(0)} L${x(0)},${y(0)}Z" fill="var(--viz-${si + 1})" class="viz-area"/>` : "";
    return `${area}<polyline points="${pts.join(" ")}" fill="none" stroke="var(--viz-${si + 1})" class="viz-line"/>
      <circle cx="${x(n - 1)}" cy="${y(s.values[n - 1])}" r="4.5" fill="var(--viz-${si + 1})" class="viz-dot"/>`;
  }).join("");
  // One tall hit area per label, so the tooltip works anywhere above it (and on touch).
  const hits = labels.map((l, i) => `<rect x="${x(i) - (W - L - R) / Math.max(n - 1, 1) / 2}" y="${T}" width="${(W - L - R) / Math.max(n - 1, 1)}" height="${H - T - B}" class="viz-hit"
    data-tip="${esc(`<b>${esc(l)}</b>${series.map((s, si) => `<span><i style="background:var(--viz-${si + 1})"></i>${esc(s.name)} <b>${esc(fmt(s.values[i]))}</b></span>`).join("")}`)}" data-x="${x(i)}"/>`).join("");
  const last = series.map((s, si) => ({ name: s.name, value: fmt(s.values[n - 1]), slot: si }));
  return `<figure class="viz" aria-label="${esc(title)}"><svg viewBox="0 0 ${W} ${H}" class="viz-svg" role="img" aria-hidden="true">${grid}${paths}<line class="viz-cross" y1="${T}" y2="${H - B}" x1="0" x2="0"/>${xl}${hits}</svg>
    ${series.length > 1 ? legend(last) : ""}${table(title, ["", ...series.map((s) => s.name)], labels.map((l, i) => [l, ...series.map((s) => fmt(s.values[i]))]))}</figure>`;
}

/** Grouped vertical bars (one or two series). */
export function bars({ title, labels, series, fmt = compact, height = 170 }) {
  if (!labels.length || series.every((s) => s.values.every((v) => !v))) return empty("No data for this period yet");
  const W = 340, H = height, L = 30, R = 6, T = 14, B = 24, n = labels.length, k = series.length;
  const { top, step } = niceScale(Math.max(...series.flatMap((s) => s.values)));
  const y = (v) => T + (H - T - B) * (1 - v / top), slot = (W - L - R) / n, bw = Math.min(22, (slot - 8) / k - 2);
  const grid = Array.from({ length: Math.round(top / step) + 1 }, (_, j) => j * step).map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="viz-grid"/><text x="${L - 6}" y="${y(v) + 4}" class="viz-tick" text-anchor="end">${fmt(v)}</text>`).join("");
  const body = labels.map((l, i) => {
    const cx = L + slot * i + slot / 2, x0 = cx - (k * (bw + 2)) / 2;
    const rects = series.map((s, si) => { const v = s.values[i] || 0, h = Math.max(v ? 2 : 0, y(0) - y(v)); return `<path d="${roundTop(x0 + si * (bw + 2), y(0) - h, bw, h)}" fill="var(--viz-${si + 1})"/>`; }).join("");
    const tip = `<b>${esc(l)}</b>${series.map((s, si) => `<span><i style="background:var(--viz-${si + 1})"></i>${esc(s.name)} <b>${esc(fmt(s.values[i] || 0))}</b></span>`).join("")}`;
    return `${rects}<text x="${cx}" y="${H - 6}" class="viz-tick" text-anchor="middle">${esc(l)}</text><rect x="${cx - slot / 2}" y="${T}" width="${slot}" height="${H - T - B}" class="viz-hit" data-tip="${esc(tip)}"/>`;
  }).join("");
  return `<figure class="viz" aria-label="${esc(title)}"><svg viewBox="0 0 ${W} ${H}" class="viz-svg" role="img" aria-hidden="true">${grid}${body}</svg>
    ${k > 1 ? legend(series.map((s, si) => ({ name: s.name, slot: si }))) : ""}${table(title, ["", ...series.map((s) => s.name)], labels.map((l, i) => [l, ...series.map((s) => fmt(s.values[i] || 0))]))}</figure>`;
}
// Bar with 4px rounded top, flat on the baseline.
function roundTop(x, y, w, h) { const r = Math.min(4, w / 2, h); return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`; }

/** Donut with a centre number. Items past five fold into "Other". */
export function donut({ title, items, center, sub = "", fmt = (n) => String(n) }) {
  let list = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  if (list.length > 5) list = [...list.slice(0, 4), { label: "Other", value: list.slice(4).reduce((s, i) => s + i.value, 0) }];
  const total = list.reduce((s, i) => s + i.value, 0);
  if (!total) return empty("Nothing to show yet");
  const R = 52, C = 2 * Math.PI * R, gap = list.length > 1 ? 2 : 0;
  let off = 0;
  const arcs = list.map((it, i) => { const len = (it.value / total) * C; const s = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="var(--viz-${i + 1})" stroke-width="18" stroke-dasharray="${Math.max(len - gap, 0.1)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"
      class="viz-hit-arc" data-tip="${esc(`<b>${esc(it.label)}</b><span>${esc(fmt(it.value))} · ${Math.round((it.value / total) * 100)}%</span>`)}"/>`; off += len; return s; }).join("");
  return `<figure class="viz viz-donut" aria-label="${esc(title)}"><svg viewBox="0 0 140 140" class="viz-svg" role="img" aria-hidden="true">${arcs}
      <text x="70" y="70" text-anchor="middle" class="viz-center">${esc(center ?? fmt(total))}</text><text x="70" y="88" text-anchor="middle" class="viz-tick">${esc(sub)}</text></svg>
    <div class="viz-legend col">${list.map((it, i) => `<span><i style="background:var(--viz-${i + 1})"></i>${esc(it.label)} <b>${Math.round((it.value / total) * 100)}%</b></span>`).join("")}</div>
    ${table(title, ["", "Value", "Share"], list.map((it) => [it.label, fmt(it.value), `${Math.round((it.value / total) * 100)}%`]))}</figure>`;
}

/** Progress ring: 0–1. tone: "good" (green) or the brand colour. */
export function ring({ value, label = "", sub = "", tone = "brand", size = 110 }) {
  const v = Math.max(0, Math.min(1, value || 0)), R = 44, C = 2 * Math.PI * R;
  return `<div class="viz-ring" style="width:${size}px;height:${size}px" role="img" aria-label="${esc(label || `${Math.round(v * 100)}%`)}${sub ? `, ${esc(sub)}` : ""}">
    <svg viewBox="0 0 110 110"><circle r="${R}" cx="55" cy="55" class="viz-ring-bg"/><circle r="${R}" cx="55" cy="55" class="viz-ring-fg ${tone}" stroke-dasharray="${C * v} ${C}" transform="rotate(-90 55 55)"/></svg>
    <span><b>${esc(label || `${Math.round(v * 100)}%`)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span></div>`;
}

/** Horizontal bars with a value label (budgets, "what members like most"). */
export function hbars({ title, items, fmt = (n) => String(n), max = null }) {
  if (!items.length) return empty("Nothing to show yet");
  const m = max ?? Math.max(...items.map((i) => i.max ?? i.value), 1);
  return `<div class="viz-hbars" aria-label="${esc(title)}">${items.map((it, i) => `<div class="viz-hbar"><span class="min0 ellipsis">${esc(it.label)}</span>
      <span class="viz-hbar-track" title="${esc(fmt(it.value))}"><i style="width:${Math.min(100, (it.value / (it.max ?? m)) * 100)}%;background:var(--viz-${(it.slot ?? 0) + 1})"></i></span><b>${esc(it.text ?? fmt(it.value))}</b></div>`).join("")}
    ${table(title, ["", "Value"], items.map((it) => [it.label, it.text ?? fmt(it.value)]))}</div>`;
}

/** Tiny trend line for stat cards (decorative; the number beside it carries the meaning). */
export function spark(values, slot = 0) {
  if (values.length < 2 || values.every((v) => v === values[0])) return "";
  const W = 64, H = 22, mx = Math.max(...values), mn = Math.min(...values), sp = mx - mn || 1;
  const pts = values.map((v, i) => `${((i * W) / (values.length - 1)).toFixed(1)},${(H - 2 - ((v - mn) / sp) * (H - 4)).toFixed(1)}`).join(" ");
  return `<svg class="viz-spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(--viz-${slot + 1})" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** "↑ 12%" against an earlier value (null when there's nothing to compare). */
export function delta(now, before) {
  if (!before) return null;
  const p = Math.round(((now - before) / before) * 100);
  return { pct: p, up: p >= 0, text: `${p >= 0 ? "↑" : "↓"} ${Math.abs(p)}%` };
}

/** Hover / tap tooltips for every [data-tip] inside root. One floating box, keyboard-free (the table covers that). */
export function bindTips(root) {
  const tips = root.querySelectorAll("[data-tip]");
  if (!tips.length) return;
  let box = document.getElementById("viz-tip");
  if (!box) { box = Object.assign(document.createElement("div"), { id: "viz-tip", className: "viz-tip", role: "status" }); document.body.append(box); }
  const show = (e) => {
    const t = e.currentTarget; box.innerHTML = t.dataset.tip; box.hidden = false;
    const svg = t.ownerSVGElement, cross = svg?.querySelector(".viz-cross");
    if (cross && t.dataset.x) { cross.setAttribute("x1", t.dataset.x); cross.setAttribute("x2", t.dataset.x); cross.classList.add("on"); }
    const px = e.clientX ?? t.getBoundingClientRect().left, py = e.clientY ?? t.getBoundingClientRect().top;
    const w = box.offsetWidth, h = box.offsetHeight;
    box.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, px - w / 2))}px`; box.style.top = `${Math.max(8, py - h - 14)}px`;
  };
  const hide = (e) => { box.hidden = true; e.currentTarget.ownerSVGElement?.querySelector(".viz-cross")?.classList.remove("on"); };
  tips.forEach((t) => { t.addEventListener("pointermove", show); t.addEventListener("pointerdown", show); t.addEventListener("pointerleave", hide); });
}
