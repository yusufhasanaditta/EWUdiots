/* EWUdiots Club: form builder logic (pure, no DOM). Field schema, templates, answer validation that mirrors the
   server's checks (public.submit_response), response summaries and a safe CSV export. */

/**
 * @typedef {{ id: string, type: FieldType, label: string, required?: boolean, options?: string[], max?: number, help?: string }} FormField
 * @typedef {"text"|"long"|"choice"|"multi"|"dropdown"|"number"|"email"|"date"|"link"|"note"} FieldType
 * @typedef {{ deadline?: string, limit?: number|null, waitlist?: boolean, allowEdit?: boolean, collectPhone?: boolean, fee?: number|null, feeNote?: string, confirmMsg?: string, ticket?: boolean }} FormSettings
 * @typedef {{ id: string, status: string, name: string, student_id: string, email: string, phone: string, department: string, answers: Record<string, unknown>, payment_ref: string, payment_verified: boolean, ticket: string, checked_in_at: string|null, created_at: string, note: string }} FormResponse
 */

export const FIELD_TYPES = {
  text: { label: "Short answer", icon: "edit" },
  long: { label: "Paragraph", icon: "notes" },
  choice: { label: "Multiple choice", icon: "checkc", options: true },
  multi: { label: "Checkboxes", icon: "checksq", options: true },
  dropdown: { label: "Dropdown", icon: "list", options: true },
  number: { label: "Number", icon: "calc" },
  email: { label: "Email", icon: "mail" },
  date: { label: "Date", icon: "calendar" },
  link: { label: "Link (portfolio, GitHub…)", icon: "link" },
  note: { label: "Text block (no answer)", icon: "info" }
};
export const FORM_KINDS = { membership: "Membership recruitment", event: "Event registration", competition: "Competition sign-up", volunteer: "Volunteer call", survey: "Survey / feedback", other: "Other" };
export const STATUSES = { pending: ["Pending", "amber"], shortlisted: ["Shortlisted", "blue"], accepted: ["Accepted", "green"], waitlisted: ["Waitlisted", "purple"], rejected: ["Rejected", "red"] };
export const MAX_FIELDS = 40;

let seq = 0;
export const fieldId = () => `f${Date.now().toString(36)}${(seq++).toString(36)}`;
/** @returns {FormField} */
export const newField = (type = "text", label = "") => ({ id: fieldId(), type, label: label || FIELD_TYPES[type]?.label || "Question", required: false, ...(FIELD_TYPES[type]?.options ? { options: ["Option 1", "Option 2"] } : {}) });

/** Starting points for the builder. Name, student ID, email and department are filled from the account automatically. */
export function template(kind, wings = []) {
  const f = (type, label, extra = {}) => ({ ...newField(type, label), ...extra });
  switch (kind) {
    case "membership": return [
      f("long", "Why do you want to join?", { required: true, max: 800 }),
      ...(wings.length ? [f("choice", "Which wing would you like to work in?", { required: true, options: wings })] : []),
      f("long", "Any experience, skills or past club work?", { max: 800 }),
      f("link", "Portfolio, GitHub or LinkedIn (optional)")];
    case "event": return [f("dropdown", "Your semester", { required: true, options: ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th+"] }), f("long", "Anything we should know? (dietary needs, accessibility…)")];
    case "competition": return [f("text", "Team name", { required: true, max: 60 }), f("long", "Team members (name and student ID, one per line)", { required: true, max: 800 }), f("choice", "Category", { required: true, options: ["Beginner", "Advanced"] })];
    case "volunteer": return [f("multi", "When can you help?", { required: true, options: ["Before the event (setup)", "During the event", "After the event (pack-up)"] }), f("choice", "T-shirt size", { options: ["S", "M", "L", "XL", "XXL"] })];
    case "survey": return [f("choice", "How would you rate the event?", { required: true, options: ["Excellent", "Good", "Okay", "Poor"] }), f("long", "What should we do better next time?")];
    default: return [f("text", "Your question", { required: true })];
  }
}

/** Tidy a field list from the builder (or the database) into something safe to save. */
export function cleanFields(fields) {
  return (Array.isArray(fields) ? fields : []).slice(0, MAX_FIELDS).filter((x) => x && FIELD_TYPES[x.type]).map((x) => {
    // Ids become HTML names and CSS selectors: keep them to safe characters whatever is stored.
    const out = { id: String(x.id || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || fieldId(), type: x.type, label: String(x.label || "").trim().slice(0, 200) || FIELD_TYPES[x.type].label, required: x.type !== "note" && !!x.required };
    if (FIELD_TYPES[x.type].options) out.options = [...new Set((x.options || []).map((o) => String(o).trim().slice(0, 100)).filter(Boolean))].slice(0, 30);
    if (x.max) out.max = Math.max(1, Math.min(4000, Number(x.max) || 0));
    if (x.help) out.help = String(x.help).slice(0, 300);
    return out;
  }).filter((x) => !FIELD_TYPES[x.type].options || x.options.length >= 2);
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** Bangladeshi mobile number (the server checks the same). Returns the digits or "". */
export const normPhone = (p) => { const d = String(p || "").replace(/[^0-9+]/g, ""); return /^(\+?88)?01[3-9]\d{8}$/.test(d) ? d : ""; };
const blank = (v) => v == null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);

/**
 * Check answers before sending. Mirrors the server (required fields) and adds friendly type checks.
 * @param {FormField[]} fields @param {Record<string, unknown>} answers @param {FormSettings} [settings] @param {string} [phone]
 * @returns {{ ok: boolean, errors: Record<string, string> }}
 */
export function validate(fields, answers, settings = {}, phone = "") {
  const errors = {};
  for (const x of fields) {
    const v = answers[x.id];
    if (x.type === "note") continue;
    if (blank(v)) { if (x.required) errors[x.id] = "This question needs an answer."; continue; }
    const s = Array.isArray(v) ? v : String(v);
    if (x.max && typeof s === "string" && s.length > x.max) errors[x.id] = `Keep it under ${x.max} characters.`;
    else if (x.type === "email" && !EMAIL.test(s)) errors[x.id] = "Enter a valid email.";
    else if (x.type === "number" && !Number.isFinite(Number(s))) errors[x.id] = "Enter a number.";
    else if (x.type === "link" && !/^https?:\/\/\S+\.\S+/.test(s)) errors[x.id] = "Enter a full link starting with https://";
    else if (["choice", "dropdown"].includes(x.type) && !x.options?.includes(s)) errors[x.id] = "Choose one of the options.";
    else if (x.type === "multi" && (!Array.isArray(v) || v.some((o) => !x.options?.includes(o)))) errors[x.id] = "Choose from the options.";
  }
  if (settings.collectPhone && !normPhone(phone)) errors._phone = "Enter a Bangladeshi mobile number like 01712345678.";
  return { ok: !Object.keys(errors).length, errors };
}

/** Is the form taking answers right now? */
export function openState(form, now = Date.now()) {
  if (!form || form.status === "draft") return { open: false, why: "Not published yet" };
  if (form.status === "closed") return { open: false, why: "Closed" };
  const dl = form.settings?.deadline ? new Date(form.settings.deadline).getTime() : null;
  if (dl && now > dl) return { open: false, why: "The deadline has passed" };
  return { open: true, why: "", deadline: dl };
}

/** Counts for the responses dashboard: by status, by department and per day. @param {FormResponse[]} rows */
export function summarize(rows) {
  const by = (key) => rows.reduce((m, r) => { const k = (typeof key === "function" ? key(r) : r[key]) || "—"; m[k] = (m[k] || 0) + 1; return m; }, {});
  const day = (r) => new Date(r.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
  const perDay = Object.entries(by(day)).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, n]) => ({ day: k, n }));
  return { total: rows.length, status: by("status"), department: by((r) => r.department || deptFromId(r.student_id)), perDay, checkedIn: rows.filter((r) => r.checked_in_at).length, paid: rows.filter((r) => r.payment_verified).length };
}
// EWU IDs carry the program code in the third part (2024-1-60-123). Only codes we're sure of (same as ui-idcard.js).
const PROGRAMS = { 60: "CSE" };
export const deptFromId = (id) => PROGRAMS[String(id || "").split("-")[2]] || "";

/** Spreadsheet text that can't run as a formula when opened in Excel (CSV injection). */
const cell = (v) => {
  let s = Array.isArray(v) ? v.join("; ") : v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** @param {{ fields: FormField[] }} form @param {FormResponse[]} rows */
export function toCSV(form, rows) {
  const qs = (form.fields || []).filter((x) => x.type !== "note");
  const head = ["Name", "Student ID", "Email", "Phone", "Department", "Status", "Payment ref", "Paid", "Ticket", "Checked in", "Submitted", ...qs.map((x) => x.label)];
  const body = rows.map((r) => [r.name, r.student_id, r.email, r.phone, r.department || deptFromId(r.student_id), STATUSES[r.status]?.[0] || r.status, r.payment_ref, r.payment_verified ? "Yes" : "",
    r.ticket, r.checked_in_at ? new Date(r.checked_in_at).toISOString() : "", new Date(r.created_at).toISOString(), ...qs.map((x) => r.answers?.[x.id])]);
  return "﻿" + [head, ...body].map((line) => line.map(cell).join(",")).join("\r\n"); // BOM so Excel reads Bangla names
}
