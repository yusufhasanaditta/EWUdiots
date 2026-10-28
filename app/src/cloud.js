/* Supabase connection. The app is local-first: everything works offline and
   without an account; signing in adds backup/sync across devices and unlocks
   the shared features (faculty directory, reviews, vault, free rooms, smart scan). */
import { createClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const enabled = Boolean(URL && KEY);
export const sb = enabled ? createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }) : null;

export const EWU_EMAIL = /^\d{4}-\d-\d{2}-\d{3}@std\.ewubd\.edu$/i;
const need = () => { if (!sb) throw new Error("Cloud features aren't configured in this build."); };
const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

/* ---------- Auth: 6-digit code sent to the EWU student email ---------- */
export async function sendCode(email) {
  need();
  if (!EWU_EMAIL.test(email.trim())) throw new Error("Use your EWU student email, e.g. 2026-2-60-123@std.ewubd.edu");
  ok(await sb.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } }));
}
export async function verifyCode(email, token) {
  need();
  return ok(await sb.auth.verifyOtp({ email: email.trim().toLowerCase(), token: token.trim(), type: "email" })).user;
}
/* ---------- Password accounts ----------
   Students sign up with their EWU student email (after scanning both sides of the ID card); alumni and faculty with
   any email. Every new account proves its email with a 6-digit code. Signing in afterwards is ID/email + password,
   and the session stays on the device until you log out. "Forgot password" emails a code to set a new one. */
export const STUDENT_ID = /^\d{4}-\d-\d{2}-\d{3}$/;
export const emailFor = (idOrEmail) => { const v = String(idOrEmail || "").trim().toLowerCase(); return STUDENT_ID.test(v) ? `${v}@std.ewubd.edu` : v; };
const friendly = (m) => /invalid login/i.test(m) ? "Wrong ID/email or password." : /signups? not allowed|user not found/i.test(m) ? "There's no account with that ID or email yet. Create one first." : /not confirmed/i.test(m) ? "Please verify your email first. We can send a new code." :
  /expired|invalid.*(otp|token)|token.*(expired|invalid)/i.test(m) ? "That code is wrong or expired." : /rate|seconds|too many/i.test(m) ? "Please wait a minute and try again." :
  /weak|at least|characters/i.test(m) ? "Use at least 8 characters with letters and numbers." : m;
const authOk = ({ data, error }) => { if (error) throw Object.assign(new Error(friendly(error.message)), { raw: error.message }); return data; };
export async function signUp({ email, password, role = "student", name = "" }) {
  need();
  email = emailFor(email);
  if (role === "student" && !EWU_EMAIL.test(email)) throw new Error("Students sign up with their EWU student email, e.g. 2026-2-60-123@std.ewubd.edu");
  const d = authOk(await sb.auth.signUp({ email, password, options: { data: { role, name: name.trim() } } }));
  // Supabase answers an existing, verified email with an empty identity list instead of an error.
  if (d.user && Array.isArray(d.user.identities) && !d.user.identities.length) throw Object.assign(new Error("An account with this email already exists. Sign in, or use Forgot password."), { exists: true });
  return email;
}
export async function verifySignup(email, token) {
  need();
  const r = await sb.auth.verifyOtp({ email: emailFor(email), token: token.trim(), type: "signup" });
  if (!r.error) return r.data.user;
  return authOk(await sb.auth.verifyOtp({ email: emailFor(email), token: token.trim(), type: "email" })).user;
}
export async function resendSignup(email) { need(); authOk(await sb.auth.resend({ type: "signup", email: emailFor(email) })); }
export async function signInPassword(idOrEmail, password) { need(); return authOk(await sb.auth.signInWithPassword({ email: emailFor(idOrEmail), password })).user; }
export async function forgotPassword(idOrEmail) { need(); authOk(await sb.auth.resetPasswordForEmail(emailFor(idOrEmail))); return emailFor(idOrEmail); }
export async function resetPassword(email, token, password) {
  need();
  authOk(await sb.auth.verifyOtp({ email: emailFor(email), token: token.trim(), type: "recovery" }));
  return authOk(await sb.auth.updateUser({ password })).user;
}
export async function changePassword(password) { need(); authOk(await sb.auth.updateUser({ password })); }
export const roleOf = (user) => user?.app_metadata?.role || "";
// Set only by the server (public.verify_my_card / admins), so the phone can't claim it.
export const cardVerified = (user) => user?.app_metadata?.card_verified === true;
export async function verifyMyCard(cardId) { need(); ok(await sb.rpc("verify_my_card", { card_id: cardId })); await sb.auth.refreshSession(); }
/* Passwordless sign-in for existing accounts (e.g. after scanning the ID card): a 6-digit code to the account's email. */
export async function sendLoginCode(idOrEmail) {
  need(); const email = emailFor(idOrEmail);
  authOk(await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } }));
  return email;
}
export async function verifyLoginCode(email, token) { need(); return authOk(await sb.auth.verifyOtp({ email: emailFor(email), token: token.trim(), type: "email" })).user; }

/* ---------- Messages from the team, and feedback to the team ---------- */
export async function fetchMessages() { if (!sb) return []; return ok(await sb.from("user_messages").select("id, title, body, link, created_at").order("created_at", { ascending: false }).limit(30)) || []; }
export async function sendFeedback(kind, body, version) { need(); ok(await sb.from("feedback").insert({ kind, body: body.trim(), app_version: version })); }

export async function currentUser() { if (!sb) return null; const { data } = await sb.auth.getUser(); return data.user || null; }
export const onAuth = (fn) => sb && sb.auth.onAuthStateChange((_e, session) => fn(session?.user || null));
export async function signOut() { if (sb) await sb.auth.signOut(); }

/* ---------- Private data backup (one JSON document per student) ---------- */
export async function pullData(userId) {
  need();
  return ok(await sb.from("user_data").select("data, updated_at").eq("user_id", userId).maybeSingle());
}
export async function pushData(userId, data) {
  need();
  const updated_at = new Date().toISOString();
  ok(await sb.from("user_data").upsert({ user_id: userId, data, updated_at }));
  return updated_at;
}

/* ---------- ID card pictures (private bucket "idcards", one folder per student, owner-only) ---------- */
const CARD_FILES = ["front", "back", "photo"];
export async function uploadCard(userId, side, dataUrl) {
  need();
  const blob = await (await fetch(dataUrl)).blob();
  ok(await sb.storage.from("idcards").upload(`${userId}/${side}.jpg`, blob, { contentType: blob.type || "image/jpeg", upsert: true }));
}
export async function downloadCard(userId, side) {
  need();
  const { data, error } = await sb.storage.from("idcards").download(`${userId}/${side}.jpg`);
  if (error || !data) return null;
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(data); });
}
export async function deleteCards(userId) { need(); ok(await sb.storage.from("idcards").remove(CARD_FILES.map((s) => `${userId}/${s}.jpg`))); }

/* ---------- Alumni profile (reviewed by an admin before it shows) ---------- */
export async function submitAlumni(p) {
  need();
  const { data } = await sb.auth.getUser(); if (!data.user) throw new Error("Sign in first.");
  const row = { user_id: data.user.id, status: "pending", name: p.name.trim(), role: p.role.trim(), org: p.org.trim(), country: (p.country || "Bangladesh").trim(), dept: (p.dept || "").trim(), grad_year: p.grad_year || null, sector: p.sector || "", note: (p.note || "").trim(), linkedin: (p.linkedin || "").trim() };
  ok(await sb.from("alumni_profiles").upsert(row, { onConflict: "user_id" }));
}

/* ---------- Portal pages sent by the Chrome extension (table portal_inbox, own rows only) ---------- */
export async function fetchInbox() {
  if (!sb) return [];
  return ok(await sb.from("portal_inbox").select("id, pages, created_at").order("created_at").limit(20)) || [];
}
export async function clearInbox(ids) { if (sb && ids.length) ok(await sb.from("portal_inbox").delete().in("id", ids)); }

/* ---------- Crowd-sourced timetable + faculty ---------- */
export async function contribute({ semester, rows = [], faculty = [] }) {
  if (!sb || !semester) return;
  const fac = faculty.filter((f) => /^[A-Z]{2,8}$/.test(f.init) && (f.name || f.email))
    .map((f) => ({ init: f.init, name: f.name || "", email: /@ewubd\.edu$/i.test(f.email || "") ? f.email : "", updated_at: new Date().toISOString() }));
  if (fac.length) await sb.from("faculty").upsert(fac, { onConflict: "init" });
  const secs = rows.filter((r) => r.code && r.days && r.start && r.end).map((r) => ({
    semester, course: r.code, sec: r.sec || "?", kind: r.lab ? "lab" : "class", title: r.title || "", days: r.days,
    start_time: r.start, end_time: r.end, room: r.room || "", faculty: r.faculty || "",
    capacity: r.capacity ?? null, enrolled: r.enrolled ?? null, updated_at: new Date().toISOString()
  }));
  if (secs.length) await sb.from("sections").upsert(secs, { onConflict: "semester,course,sec,kind" });
}
export async function fetchSections(semester) {
  need();
  return ok(await sb.from("sections").select("*").eq("semester", semester).limit(5000));
}
export async function fetchFaculty() {
  need();
  const [fac, rat] = await Promise.all([sb.from("faculty").select("*").order("name").limit(2000), sb.from("faculty_ratings").select("*")]);
  const ratings = Object.fromEntries((ok(rat) || []).map((r) => [r.faculty_init, r]));
  return (ok(fac) || []).map((f) => ({ ...f, rating: ratings[f.init]?.rating ? Number(ratings[f.init].rating) : null, reviews: ratings[f.init]?.reviews || 0 }));
}

/* ---------- Reviews ---------- */
export async function fetchReviews(init) {
  need();
  return ok(await sb.from("reviews_public").select("*").eq("faculty_init", init).order("created_at", { ascending: false }).limit(50));
}
export async function postReview(userId, r) {
  need();
  // Directory-only faculty ("@SLUG") need their faculty row before a review can reference it.
  if (r.init.startsWith("@")) ok(await sb.from("faculty").upsert({ init: r.init, name: r.name || "", email: /@ewubd\.edu$/i.test(r.email || "") ? r.email : "", updated_at: new Date().toISOString() }, { onConflict: "init", ignoreDuplicates: true }));
  ok(await sb.from("reviews").upsert({ user_id: userId, faculty_init: r.init, stars: r.stars, tags: r.tags, course: r.course || "", body: r.text || "" }, { onConflict: "faculty_init,user_id" }));
}
export async function report(userId, type, id, reason = "") {
  need();
  ok(await sb.from("reports").upsert({ user_id: userId, target_type: type, target_id: id, reason }, { onConflict: "target_type,target_id,user_id" }));
}

/* ---------- Study vault ---------- */
export async function listResources() {
  need();
  return ok(await sb.from("resources_ranked").select("*").order("votes", { ascending: false }).limit(500));
}
export async function uploadResource(userId, file, meta) {
  need();
  const path = `${userId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_").slice(-80)}`;
  ok(await sb.storage.from("vault").upload(path, file, { contentType: file.type || undefined, upsert: false }));
  ok(await sb.from("resources").insert({ user_id: userId, course: meta.course, type: meta.type, title: meta.title, file_path: path, size_bytes: file.size }));
}
export async function voteResource(userId, id, on) {
  need();
  if (on) ok(await sb.from("resource_votes").upsert({ resource_id: id, user_id: userId }));
  else ok(await sb.from("resource_votes").delete().eq("resource_id", id).eq("user_id", userId));
}
export async function myVotes(userId) {
  need();
  return new Set((ok(await sb.from("resource_votes").select("resource_id").eq("user_id", userId)) || []).map((v) => v.resource_id));
}
export async function downloadUrl(path) {
  need();
  return ok(await sb.storage.from("vault").createSignedUrl(path, 300)).signedUrl;
}

/* ---------- Smart scan (Claude vision via edge function) ---------- */
export async function smartScan(file) {
  need();
  const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
  const { data, error } = await sb.functions.invoke("parse-screenshot", { body: { image: b64, mediaType: file.type || "image/png" } });
  if (error) {
    let msg = error.message;
    try { msg = (await error.context.json()).error || msg; } catch { /* keep default message */ }
    throw new Error(msg);
  }
  return data;
}

/* ---------- Account deletion ---------- */
export async function deleteAccount(userId) {
  need();
  const { data: files } = await sb.storage.from("vault").list(userId, { limit: 1000 });
  if (files?.length) await sb.storage.from("vault").remove(files.map((f) => `${userId}/${f.name}`));
  await deleteCards(userId).catch(() => {});
  ok(await sb.rpc("delete_my_account"));
  await sb.auth.signOut();
}
