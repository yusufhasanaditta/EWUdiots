/* Small SVG charts for any screen (pure, no DOM): vertical bars and horizontal bars with a goal line. The Analytics
   page keeps its richer crosshair versions; these are for the Fees, Deadlines, Degree and course pages where one
   glance is enough. Every chart gets an aria-label and a <title> per mark; pie charts live in pie.ts. */
export interface Bar { label: string; value: number; color?: string; title?: string }

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** Vertical bars, one series; the tallest bar carries its value. `max` fixes the scale (e.g. 100 for percentages). */
export function barsHtml(items: Bar[], { aria = "", fmt = (n: number): string => String(n), max = 0, height = 150 } = {}): string {
  const data = items.filter((i) => Number.isFinite(i.value));
  if (!data.length) return `<p class="small muted">Nothing to chart yet.</p>`;
  const W = 320, H = height, T = 16, B = 24, L = 6, R = 6, top = Math.max(1, max || Math.max(...data.map((d) => d.value)));
  const slot = (W - L - R) / data.length, bw = Math.min(40, slot * 0.6);
  const bars = data.map((d, i) => {
    const h = ((H - T - B) * Math.max(0, d.value)) / top, x = L + slot * (i + 0.5) - bw / 2, y = H - B - h;
    return `<rect class="cb" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="4"${d.color ? ` style="fill:${d.color}"` : ""}><title>${esc(d.title || `${d.label}: ${fmt(d.value)}`)}</title></rect>`
      + `<text class="ax" x="${(L + slot * (i + 0.5)).toFixed(1)}" y="${H - 7}" text-anchor="middle">${esc(d.label)}</text>`;
  });
  const hi = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0), hx = L + slot * (hi + 0.5), hy = H - B - ((H - T - B) * Math.max(0, data[hi].value)) / top;
  return `<div class="chart" data-chart="bars"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}"><line class="base" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>${bars.join("")}`
    + `${data[hi].value > 0 ? `<text class="dl" x="${hx.toFixed(1)}" y="${(hy - 5).toFixed(1)}" text-anchor="middle">${esc(fmt(data[hi].value))}</text>` : ""}</svg></div>`;
}

/** Horizontal bars (0…max, default 100); an optional goal line marks a threshold such as the attendance minimum. */
export function hbarsHtml(items: Bar[], { aria = "", fmt = (n: number): string => `${n}%`, max = 100, goal = 0 } = {}): string {
  const data = items.filter((i) => Number.isFinite(i.value));
  if (!data.length) return `<p class="small muted">Nothing to chart yet.</p>`;
  const W = 320, row = 28, L = Math.min(130, 10 + 6.6 * Math.max(...data.map((d) => d.label.length))), R = 52, T = 4, H = T + data.length * row + (goal ? 16 : 4);
  const x = (v: number): number => L + ((W - L - R) * Math.max(0, Math.min(max, v))) / max;
  const rows = data.map((d, i) => { const y = T + i * row, w = Math.max(0, x(d.value) - L);
    return `<text class="ax" x="${L - 8}" y="${y + 17}" text-anchor="end">${esc(d.label)}</text><rect class="cb h${goal && d.value < goal ? " bad" : ""}" x="${L}" y="${y + 6}" width="${w.toFixed(1)}" height="14" rx="4"${d.color ? ` style="fill:${d.color}"` : ""}><title>${esc(d.title || `${d.label}: ${fmt(d.value)}`)}</title></rect>`
      + `<text class="dl" x="${(x(d.value) + 6).toFixed(1)}" y="${y + 17}">${esc(fmt(d.value))}</text>`; });
  return `<div class="chart" data-chart="hbars"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">${rows.join("")}`
    + `${goal ? `<line class="thr" x1="${x(goal).toFixed(1)}" x2="${x(goal).toFixed(1)}" y1="${T}" y2="${H - 14}"/><text class="ax" x="${x(goal).toFixed(1)}" y="${H - 2}" text-anchor="middle">${esc(fmt(goal))}</text>` : ""}</svg></div>`;
}
