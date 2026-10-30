/* EWUdiots Club: the merch cart, kept on this device (localStorage). Prices shown here are a preview only: the
   database recomputes prices, stock and coupons when the order is placed. Orders are per club, so the cart groups
   lines by club and checkout handles one club at a time. */

const KEY = "ewud.club.cart.v1";
const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const write = (lines) => { try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch { /* private mode: cart lasts this page only */ } };

/** @typedef {{ product_id: string, club_id: string, club_name: string, name: string, price: number, image: string, size: string, color: string, qty: number, selected?: boolean }} CartLine */
export const same = (a, b) => a.product_id === b.product_id && a.size === b.size && a.color === b.color;

/** Pure helpers (tested). */
export function addLine(lines, line, max = 10) {
  const i = lines.findIndex((l) => same(l, line));
  if (i < 0) return [...lines, { ...line, qty: Math.min(max, Math.max(1, line.qty || 1)), selected: true }];
  return lines.map((l, j) => (j === i ? { ...l, qty: Math.min(max, l.qty + (line.qty || 1)) } : l));
}
export const setQty = (lines, line, qty) => (qty < 1 ? lines.filter((l) => !same(l, line)) : lines.map((l) => (same(l, line) ? { ...l, qty: Math.min(10, qty) } : l)));
export const byClub = (lines) => Object.values(lines.reduce((m, l) => { (m[l.club_id] ||= { club_id: l.club_id, club_name: l.club_name, lines: [] }).lines.push(l); return m; }, {}));
export const count = (lines) => lines.reduce((s, l) => s + l.qty, 0);
export const subtotal = (lines) => lines.reduce((s, l) => s + l.price * l.qty, 0);

/** The device cart, with change listeners (the cart badge redraws). */
export function createCart() {
  let lines = read();
  const subs = new Set();
  const save = (next) => { lines = next; write(lines); subs.forEach((f) => f(lines)); };
  return {
    lines: () => lines,
    add: (line) => save(addLine(lines, line)),
    setQty: (line, q) => save(setQty(lines, line, q)),
    toggle: (line) => save(lines.map((l) => (same(l, line) ? { ...l, selected: l.selected === false } : l))),
    remove: (pred) => save(lines.filter((l) => !pred(l))),
    clearClub: (clubId) => save(lines.filter((l) => l.club_id !== clubId || l.selected === false)),
    count: () => count(lines),
    onChange: (f) => { subs.add(f); return () => subs.delete(f); }
  };
}
