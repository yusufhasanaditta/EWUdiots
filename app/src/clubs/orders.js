/* EWUdiots Club: merchandise order rules for the app (pure). The database is the authority: these mirror
   public.order_next_ok() and the store RPCs in 0019_club_store_partners.sql; tests/clubs.test.js keeps them equal. */

export const ORDER_STATUS = {
  pending_payment: ["Pending payment", "amber", "clock"], confirmed: ["Confirmed", "blue", "checkc"], processing: ["Processing", "purple", "settings"],
  ready: ["Ready for pickup", "green", "bag"], completed: ["Completed", "green", "checkc"], cancelled: ["Cancelled", "red", "xc"]
};
export const PAYMENT_STATUS = { unpaid: ["Unpaid", "amber"], submitted: ["To verify", "blue"], verified: ["Paid", "green"], rejected: ["Payment not found", "red"] };
export const METHODS = { bkash: "bKash", nagad: "Nagad", rocket: "Rocket", cash: "Cash at pickup" };
export const RETURN_REASONS = { wrong_size: "Wrong size received", damaged: "Damaged or faulty", wrong_item: "Wrong item", not_as_described: "Not as described", changed_mind: "Changed my mind", other: "Something else", cancelled: "Order cancelled" };
export const RETURN_STATUS = { requested: ["Under review", "amber"], approved: ["Approved", "blue"], rejected: ["Not approved", "red"], refunded: ["Refunded", "green"] };
export const CATEGORIES = { tshirts: "T-shirts", hoodies: "Hoodies", jerseys: "Jerseys", caps: "Caps", accessories: "Accessories", stickers: "Stickers", other: "Other" };
export const BADGES = { popular: ["Popular", "purple"], new: ["New", "green"], limited: ["Limited", "red"] };

/** Allowed status moves (same pairs as order_next_ok). */
export const TRANSITIONS = [["pending_payment", "confirmed"], ["pending_payment", "cancelled"], ["confirmed", "processing"], ["confirmed", "cancelled"],
  ["processing", "ready"], ["processing", "cancelled"], ["processing", "confirmed"], ["ready", "completed"], ["ready", "processing"], ["ready", "cancelled"]];
export const canMove = (from, to) => TRANSITIONS.some(([a, b]) => a === from && b === to);
/** Where a manager can take an order next (payment must be verified before preparing, unless it's cash). */
export function nextSteps(o) {
  return TRANSITIONS.filter(([a]) => a === o.status).map(([, b]) => b)
    .filter((b) => !(["processing", "ready"].includes(b) && o.payment_method !== "cash" && o.payment_status !== "verified"));
}
/** The four-step tracker: which steps are done, which is current. */
export function progress(o) {
  const steps = [["confirmed", "Confirmed", o.confirmed_at], ["processing", "Processing", o.processing_at], ["ready", "Ready for pickup", o.ready_at], ["completed", "Completed", o.completed_at]];
  const order = ["pending_payment", "confirmed", "processing", "ready", "completed"], at = order.indexOf(o.status);
  // A step is done once the order is past it; the step the order is on is "current" (Completed is simply done).
  return steps.map(([k, label, when], i) => ({ key: k, label, when, done: o.status !== "cancelled" && (at > i + 1 || o.status === "completed"), current: at === i + 1 && o.status !== "completed" }));
}
export const buyerCanCancel = (o) => ["pending_payment", "confirmed"].includes(o.status);
/** Return window still open? (days from pickup; 0 = no returns) */
export const canReturn = (o, days = 7, now = Date.now()) => o.status === "completed" && days > 0 && !!o.completed_at && now - new Date(o.completed_at).getTime() < days * 864e5;
export const pickupQr = (o) => `ewud:o:${o.pickup_token}`;
/** Stock key used by the database ("M|Black", "|Black", "M|", or "" for a plain product). */
export function stockKey(p, size, color) {
  const k = `${p.sizes?.length ? size || "" : ""}|${p.colors?.length ? color || "" : ""}`;
  return k === "|" ? "" : k;
}
export const stockOf = (p, size, color) => (p.track_stock && !p.preorder ? Number(p.stock?.[stockKey(p, size, color)] ?? 0) : Infinity);
export const totalStock = (p) => Object.values(p.stock || {}).reduce((s, n) => s + Number(n || 0), 0);
/** Every size/colour combination of a product (for the stock editor). */
export function stockKeys(p) {
  const sizes = p.sizes?.length ? p.sizes : [""], colors = p.colors?.length ? p.colors.map((c) => c.name) : [""];
  return sizes.flatMap((s) => colors.map((c) => stockKey(p, s, c)));
}
export const lineTotal = (items) => items.reduce((s, i) => s + Number(i.price) * Number(i.qty), 0);
/** Same rounding as place_order / check_coupon. */
export const couponDiscount = (sub, c) => (!c ? 0 : Math.min(sub, c.percent ? Math.round(sub * c.percent) / 100 : Number(c.amount)));
