/* Tide and start clock: the creative "time" animations (pure, no DOM; tested in tests/tide.test.ts).
   - Tide: a liquid with two moving waves and rising bubbles that fills a card as time passes (a class in progress,
     a focus session). Height comes from --fill (0…1), so a once-a-second tick only changes one number.
   - Start clock: an analog clock with the current time and an arc that closes as a class start gets near,
     plus a marker where the minute hand will be when class starts. */

export interface Bubble { x: number; size: number; dur: number; delay: number }

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** How far through [start, end] `now` is, 0…1 (times in ms). */
export function fillOf(now: number, start: number, end: number): number {
  return end > start ? clamp01((now - start) / (end - start)) : 0;
}

/** How close a start time is within the last `windowMs` before it: 0 an hour (or more) away, 1 at the start. */
export function nearness(now: number, start: number, windowMs = 3600e3): number {
  return windowMs > 0 ? clamp01(1 - (start - now) / windowMs) : 0;
}

/** Hand angles in degrees for a local time. They only grow through the day, so a hand never sweeps backwards
    on the minute or hour boundary (kept small enough for the compositor: at most 518,400° by midnight). */
export function hands(d: Date): { h: number; m: number; s: number } {
  const sec = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
  return { h: sec / 120, m: sec / 10, s: sec * 6 };
}

/** The same bubbles every time for a seed (a small LCG), so re-rendering doesn't reshuffle them. */
export function bubbles(n: number, seed = 7): Bubble[] {
  let x = seed >>> 0 || 1;
  const rnd = (): number => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 2 ** 32; };
  return Array.from({ length: Math.max(0, Math.floor(n)) }, (_, i) => ({
    x: Math.round(((i + rnd()) / n) * 100 * 10) / 10,
    size: Math.round(4 + rnd() * 9),
    dur: Math.round((3.5 + rnd() * 4) * 10) / 10,
    delay: -Math.round(rnd() * 70) / 10
  }));
}

const WAVE = "M0 8 Q 12.5 0 25 8 T 50 8 T 75 8 T 100 8 T 125 8 T 150 8 T 175 8 T 200 8 V 20 H 0 Z";

/** Liquid markup. `fill` 0…1; decorative only (aria-hidden), the text next to it carries the meaning. */
export function tideHtml(fill: number, { bubbles: n = 9, seed = 7, id = "", cls = "" } = {}): string {
  const b = bubbles(n, seed).map((v) => `<i style="--x:${v.x}%;--s:${v.size}px;--d:${v.dur}s;--dl:${v.delay}s"></i>`).join("");
  return `<span class="tide ${cls}"${id ? ` id="${id}"` : ""} style="--fill:${clamp01(fill).toFixed(3)}" aria-hidden="true"><span class="tide-body">`
    + `<svg class="wave w1" viewBox="0 0 200 20" preserveAspectRatio="none"><path d="${WAVE}"/></svg>`
    + `<svg class="wave w2" viewBox="0 0 200 20" preserveAspectRatio="none"><path d="${WAVE}"/></svg>`
    + `<span class="tide-bub">${b}</span></span></span>`;
}

/** Start clock markup: current time on the hands, an arc that closes as the start nears, a dot at the start minute. */
export function clockHtml(now: Date, start: Date): string {
  const a = hands(now), near = nearness(now.getTime(), start.getTime());
  const sm = (start.getMinutes() + start.getSeconds() / 60) * 6 * (Math.PI / 180);
  const dot = { x: (50 + 41 * Math.sin(sm)).toFixed(1), y: (50 - 41 * Math.cos(sm)).toFixed(1) };
  const ticks = Array.from({ length: 12 }, (_, i) => `<line x1="50" y1="${i % 3 ? 8.5 : 7}" x2="50" y2="12" transform="rotate(${i * 30} 50 50)"/>`).join("");
  return `<svg class="cclock" viewBox="0 0 100 100" aria-hidden="true" style="--near:${near.toFixed(3)}">`
    + `<circle class="cc-face" cx="50" cy="50" r="46"/><circle class="cc-track" cx="50" cy="50" r="46" pathLength="100"/>`
    + `<circle class="cc-arc" cx="50" cy="50" r="46" pathLength="100" transform="rotate(-90 50 50)"/>`
    + `<g class="cc-ticks">${ticks}</g><circle class="cc-start" cx="${dot.x}" cy="${dot.y}" r="3.2"/>`
    + `<line class="cc-h" x1="50" y1="50" x2="50" y2="29" style="transform:rotate(${a.h}deg)"/>`
    + `<line class="cc-m" x1="50" y1="50" x2="50" y2="17" style="transform:rotate(${a.m}deg)"/>`
    + `<line class="cc-s" x1="50" y1="56" x2="50" y2="14" style="transform:rotate(${a.s}deg)"/>`
    + `<circle class="cc-pin" cx="50" cy="50" r="2.6"/></svg>`;
}

/* ── Hourglass ─────────────────────────────────────────────────────────────── */
/** Sand left in the top bulb (0…1) for a class that starts at `start`: full until the last `windowMs`, empty at the start. */
export function sandLeft(now: number, start: number, windowMs = 3600e3): number {
  return 1 - nearness(now, start, windowMs);
}

/** A glass hourglass: the top bulb empties and the bottom fills as `sand` (0…1) falls; a stream shows while it runs.
    Decorative (aria-hidden); CSS drives the levels from --sand so a tick only changes one number. */
export function hourglassHtml(sand: number, { id = "" } = {}): string {
  const s = clamp01(sand);
  return `<svg class="hglass${s > 0 && s < 1 ? " is-flowing" : ""}"${id ? ` id="${id}"` : ""} viewBox="0 0 100 140" aria-hidden="true" style="--sand:${s.toFixed(3)}">`
    + `<defs><clipPath id="hg-top"><path d="M22 18 H78 V36 C78 50 60 60 52 70 H48 C40 60 22 50 22 36 Z"/></clipPath>`
    + `<clipPath id="hg-bot"><path d="M48 70 H52 C60 80 78 90 78 104 V122 H22 V104 C22 90 40 80 48 70 Z"/></clipPath></defs>`
    + `<rect class="hg-cap" x="14" y="8" width="72" height="10" rx="4"/><rect class="hg-cap" x="14" y="122" width="72" height="10" rx="4"/>`
    + `<path class="hg-glass" d="M22 18 H78 V36 C78 50 60 60 52 70 C60 80 78 90 78 104 V122 H22 V104 C22 90 40 80 48 70 C40 60 22 50 22 36 Z"/>`
    + `<g clip-path="url(#hg-top)"><rect class="hg-sand hg-sand-top" x="18" y="18" width="64" height="52"/></g>`
    + `<g clip-path="url(#hg-bot)"><rect class="hg-sand hg-sand-bot" x="18" y="70" width="64" height="52"/></g>`
    + `<g class="hg-grains">${[0, 1, 2, 3, 4, 5].map((i) => `<circle class="hg-grain" cx="${50 + ((i % 3) - 1) * 1.6}" cy="68" r="1.3" style="--i:${i}"/>`).join("")}</g>`
    + `<ellipse class="hg-pile" cx="50" cy="121" rx="22" ry="7"/>`
    + `<path class="hg-shine" d="M27 22 V36 C27 46 36 54 42 60" />`
    + `</svg>`;
}
