/* Pie (donut) chart markup: pure, no DOM, shared by the student Analytics page and the admin console. Slices are
   stroked circles with pathLength=100, so each slice is "dasharray: share gap" and an offset; a legend lists every
   slice with its value (the chart alone never carries the meaning). Styles: v232.css (.pie). */
export interface Slice { label: string; value: number; color?: string }

/** Categorical palette, in the order slices get them (brand violet first, then its partners). */
export const PIE_COLORS: readonly string[] = ["#7c3aed", "#0891b2", "#16a34a", "#f97316", "#ec4899", "#ca8a04", "#64748b", "#ef4444"];

const escape = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export function pieHtml(items: Slice[], { center = "", sub = "", fmt = (n: number): string => String(n), aria = "" } = {}): string {
  const data = items.filter((i) => Number.isFinite(i.value) && i.value > 0);
  const total = data.reduce((a, i) => a + i.value, 0);
  if (!total) return `<p class="small muted">Nothing to chart yet.</p>`;
  let at = 0;
  const slices = data.map((i, k) => {
    const share = (100 * i.value) / total, color = i.color || PIE_COLORS[k % PIE_COLORS.length];
    const el = `<circle class="slice" cx="50" cy="50" r="38" pathLength="100" stroke="${color}" stroke-dasharray="${share.toFixed(2)} ${(100 - share).toFixed(2)}" stroke-dashoffset="${(25 - at).toFixed(2)}"><title>${escape(i.label)}: ${escape(fmt(i.value))}</title></circle>`;
    at += share;
    return { el, color };
  });
  return `<div class="pie"><svg viewBox="0 0 100 100" role="img" aria-label="${escape(aria || `${center} ${sub}`.trim())}">${slices.map((s) => s.el).join("")}`
    + `${center ? `<text class="pie-c" x="50" y="${sub ? 49 : 54}" text-anchor="middle">${escape(center)}</text>` : ""}${sub ? `<text class="pie-s" x="50" y="64" text-anchor="middle">${escape(sub)}</text>` : ""}</svg>`
    + `<div class="pie-legend">${data.map((i, k) => `<span><i style="background:${slices[k].color}"></i>${escape(i.label)}<b>${escape(fmt(i.value))} · ${Math.round((100 * i.value) / total)}%</b></span>`).join("")}</div></div>`;
}
