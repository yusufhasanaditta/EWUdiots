/* EWUdiots Club: event ticket rules shared by the views and the unit tests (migration 0024 decides; this only
   chooses what to show). A ticket's QR is "ewud:t:<token>"; the 8-character code is for typing at the door. */

export const QR_PREFIX = "ewud:t:";
export const ticketQR = (token) => `${QR_PREFIX}${token}`;
export const METHODS = { bkash: "bKash", nagad: "Nagad", rocket: "Rocket", cash: "Cash at the door" };

/** What the camera read, or what was typed, in the shape scan_ticket expects. */
export function normaliseScan(text) {
  const s = String(text || "").trim();
  if (/^ewud:t:[0-9a-f]{32,64}$/i.test(s)) return s.toLowerCase();
  if (/^EWUDCLUB:[0-9a-f-]{36}:[0-9A-Z]{6,12}$/i.test(s)) return s;
  return s.replace(/[^0-9A-Za-z]/g, "").toUpperCase().slice(0, 12);
}

/** The big answer the scanner shows: [title, tone, icon, advice]. */
export const SCAN_RESULTS = {
  admitted: ["Valid ticket · Admitted", "green", "checkc", "Let them in."],
  valid: ["Valid ticket", "green", "checkc", "Checked only. Not admitted yet."],
  used: ["Already used", "amber", "alert", "This ticket was checked in before. Ask for ID if someone else used it."],
  invalid: ["Not a ticket", "red", "x", "No ticket with this code. Check the code or ask the organisers."],
  wrong_event: ["Different event", "red", "x", "This ticket is for another event."],
  unpaid: ["Not paid", "red", "wallet", "The payment hasn't been confirmed."],
  cancelled: ["Cancelled ticket", "red", "x", "This ticket was cancelled."],
  waitlisted: ["On the waitlist", "amber", "clock", "This person doesn't have a seat yet."]
};

/** Holder-facing status of a ticket: [label, tone]. */
export function ticketState(t, now = Date.now()) {
  if (!t) return ["", "gray"];
  if (t.status === "cancelled") return ["Cancelled", "red"];
  if (t.status === "waitlisted") return ["Waitlist", "purple"];
  if (t.status === "used") return ["Checked in", "green"];
  if (t.payment === "submitted") return ["Payment being checked", "amber"];
  if (t.payment === "rejected") return ["Payment not found", "red"];
  if (t.payment === "unpaid") return [t.pay_method === "cash" || !t.pay_method ? "Pay at the door" : "Payment needed", "amber"];
  if (t.ends_at || t.starts_at) { if (new Date(t.ends_at || t.starts_at).getTime() < now) return ["Event ended", "gray"]; }
  return ["Valid", "green"];
}

/** Can the holder show this QR at the door? (An unpaid cash ticket can be paid there.) */
export const showsQR = (t) => !!t && t.status === "active" && ["free", "verified", "unpaid"].includes(t.payment);

/** Seats left in a tier, or null when the tier has no limit. */
export const tierLeft = (tier, sold = 0) => (tier?.qty ? Math.max(0, Number(tier.qty) - Number(sold || 0)) : null);

export const priceLabel = (price) => (Number(price) > 0 ? `৳${Math.round(Number(price)).toLocaleString("en-IN")}` : "Free");

/**
 * Clean the organiser's ticket setup before saving (the database checks it again).
 * @param {{ tiers?: any[], methods?: string[], numbers?: Record<string,string>, scanners?: string, door_cash?: boolean, sales_end?: string, enabled?: boolean, note?: string }} t
 * @returns {{ value?: any, error?: string }}
 */
export function cleanTicketing(t) {
  const tiers = (t.tiers || []).filter((x) => String(x.name || "").trim());
  if (t.enabled && !tiers.length) return { error: "Add at least one ticket type." };
  if (tiers.length > 6) return { error: "Up to 6 ticket types." };
  const seen = new Set(), out = [];
  for (const [i, x] of tiers.entries()) {
    const id = String(x.id || `t${i + 1}`).toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24) || `t${i + 1}`;
    if (seen.has(id)) return { error: "Two ticket types have the same id." };
    seen.add(id);
    const price = Math.round(Number(x.price) || 0), qty = x.qty === "" || x.qty == null ? null : Math.round(Number(x.qty));
    if (price < 0 || price > 100000) return { error: "Ticket prices go from 0 to 100000 taka." };
    if (qty != null && (!(qty >= 1) || qty > 20000)) return { error: "Ticket quantity must be 1 to 20000, or empty for no limit." };
    out.push({ id, name: String(x.name).trim().slice(0, 40), price, ...(qty ? { qty } : {}), ...(x.note ? { note: String(x.note).trim().slice(0, 80) } : {}) });
  }
  const paid = out.some((x) => x.price > 0);
  const methods = (t.methods || []).filter((m) => m in METHODS);
  if (t.enabled && paid && !methods.length) return { error: "Choose how people can pay." };
  const numbers = {};
  for (const [k, v] of Object.entries(t.numbers || {})) {
    const n = String(v || "").replace(/[^0-9+]/g, "");
    if (!n) continue;
    if (!/^(\+?88)?01[3-9]\d{8}$/.test(n)) return { error: `The ${METHODS[k] || k} number must be a Bangladeshi mobile number.` };
    numbers[k] = n;
  }
  return { value: { enabled: !!t.enabled, tiers: out, methods, numbers, scanners: t.scanners === "members" ? "members" : "staff", door_cash: t.door_cash !== false, ...(t.sales_end ? { sales_end: t.sales_end } : {}), ...(t.note ? { note: String(t.note).slice(0, 300) } : {}) } };
}
