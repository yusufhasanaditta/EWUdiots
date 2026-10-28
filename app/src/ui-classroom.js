/* Google Classroom (#/classroom): the student signs in with Google (read-only Classroom access, in the browser), and
   each Classroom course whose name has an EWU course code (CSE106…) is imported: materials and assignments go into
   that course's shared Materials (grouped by Classroom topic = a study path for every section and semester) and
   assignments with due dates go into Deadlines. The Google token stays in this page's memory only. */
import { SCOPES, API, courseCodeOf, toMaterials, toTasks } from "./classroom.js";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
export function install(ctx) {
  const { pages, icon, esc, $, toast, busy } = ctx;
  const S = () => ctx.S;
  let token = null, run = null;
  const gis = () => new Promise((res, rej) => {
    if (window.google?.accounts?.oauth2) return res(window.google);
    const s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = () => res(window.google); s.onerror = () => rej(new Error("Couldn't load Google sign-in. Check your connection."));
    document.head.appendChild(s);
  });
  const getToken = async () => {
    if (token && token.exp > Date.now()) return token.v;
    const g = await gis();
    return new Promise((res, rej) => {
      g.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPES, hint: ctx.C.user?.email || "", callback: (r) => {
        if (r.error) return rej(new Error(r.error === "access_denied" ? "Google access wasn't allowed." : r.error_description || r.error));
        token = { v: r.access_token, exp: Date.now() + (Number(r.expires_in) - 60) * 1000 }; res(token.v);
      }, error_callback: (e) => rej(new Error(e?.type === "popup_closed" ? "The Google window was closed." : "Google sign-in failed.")) }).requestAccessToken({ prompt: "" });
    });
  };
  const gget = async (path) => {
    const out = []; let page = "";
    do {
      const r = await fetch(`${API}${path}${path.includes("?") ? "&" : "?"}pageSize=100${page ? `&pageToken=${page}` : ""}`, { headers: { authorization: `Bearer ${await getToken()}` } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(j.error?.message || `Classroom answered ${r.status}`), { status: r.status });
      out.push(...(j.courses || j.topic || j.courseWorkMaterial || j.courseWork || [])); page = j.nextPageToken || "";
    } while (page && out.length < 1000);
    return out;
  };

  async function importAll(share, onStep) {
    const courses = (await gget("/courses?studentId=me&courseStates=ACTIVE")).map((c) => ({ c, code: courseCodeOf(c) })).filter((x) => x.code);
    if (!courses.length) throw new Error("No Classroom course here has an EWU course code (like CSE106) in its name.");
    const mine = new Map(S().routine.map((r) => [r.code, r])), summary = [];
    for (const { c, code } of courses) {
      onStep(code, "reading");
      try {
        const [topics, materials, work] = await Promise.all([gget(`/courses/${c.id}/topics`).catch(() => []), gget(`/courses/${c.id}/courseWorkMaterials`).catch(() => []), gget(`/courses/${c.id}/courseWork`).catch(() => [])]);
        const r = mine.get(code), info = { faculty: r?.faculty || "", sec: r?.sec || "", sem: S().routineSem || "" };
        const rows = toMaterials({ course: c, code, topics, materials, work, info }), tasks = toTasks({ code, work });
        if (share && rows.length) await ctx.cloud.importMaterials(ctx.C.user.id, rows, { name: S().profile?.name || "", role: ctx.cloud.roleOf(ctx.C.user) || "student" });
        let added = 0;
        for (const t of tasks) if (!S().tasks.some((x) => x.id === t.id) && new Date(t.due) > Date.now() - 864e5) { S().tasks.push(t); added++; }
        summary.push({ code, name: c.name, materials: rows.length, tasks: added, link: c.alternateLink || "" });
        onStep(code, "done");
      } catch { onStep(code, "skipped"); summary.push({ code, name: c.name, materials: 0, tasks: 0, failed: true }); }
    }
    S().classroom = { at: new Date().toISOString(), courses: summary }; ctx.save(); ctx.materials?.bust();
    return summary;
  }

  pages.classroom = () => {
    const head = ctx.head("Google Classroom", "Bring your Classroom courses into EWUdiots: materials by topic, and assignments as deadlines.");
    const last = S().classroom, steps = run ? Object.entries(run) : [];
    const lastHtml = last?.courses?.length ? `<section class="card mt"><div class="card-h"><h2>Last import</h2><span class="xs">${ctx.fmtDate(last.at)}</span></div>${last.courses.map((c) => `<a class="lrow" href="#/course?c=${encodeURIComponent(c.code)}&tab=materials"><span class="itile ${c.failed ? "red" : "green"}">${icon(c.failed ? "alert" : "book")}</span><span class="body"><b>${esc(c.code)}</b><span>${esc(c.name)} · ${c.failed ? "Couldn't read this course" : `${c.materials} materials, ${c.tasks} new deadlines`}</span></span>${icon("chevR", "chev")}</a>`).join("")}</section>` : "";
    if (!CLIENT_ID) return `${head}<section class="card">${ctx.empty("icon:clock", "Google Classroom is almost ready", "The EWUdiots team is finishing the Google sign-in setup. Until then, share Classroom slides and notes from each course's Materials tab.")}</section>`;
    if (!ctx.C.user) return `${head}<section class="card">${ctx.empty("icon:user", "Sign in first", "Imported materials are saved to your EWUdiots account.", `<a class="btn primary" href="#/login?from=profile">${icon("user")} Sign in</a>`)}</section>`;
    if (ctx.native.isNative) return `${head}<section class="card gc-card"><span class="gc-logo" aria-hidden="true">${icon("school")}</span><h3>Connect in your browser</h3><p class="small muted">Google doesn't allow its sign-in inside apps like this one. Open EWUdiots in your browser, sign in with the same account and connect there. Everything appears here on your phone.</p>
      <a class="btn primary lg block mt" href="${ctx.SITE}/app.html#/classroom" target="_blank" rel="noopener">${icon("external")} Open in browser</a></section>${lastHtml}`;
    return `${head}<section class="card gc-card"><span class="gc-logo" aria-hidden="true">${icon("school")}</span>
      <h3>Connect Google Classroom</h3><p class="small muted">Sign in with your EWU Google account (${esc(ctx.C.user.email)}). EWUdiots only reads your courses, topics, materials and your own assignments. It never posts or changes anything.</p>
      ${steps.length ? `<div class="ps-steps mt">${steps.map(([code, v]) => `<div class="ps-step ${v}"><span class="ps-dot">${v === "done" ? icon("check", "sm") : v === "skipped" ? icon("minus", "sm") : '<i class="spin"></i>'}</span><b>${esc(code)}</b><span class="xs">${v === "done" ? "Imported" : v === "skipped" ? "Skipped" : "Reading…"}</span></div>`).join("")}</div>` : ""}
      <label class="row nowrap small mt" style="gap:8px;align-items:flex-start"><input type="checkbox" class="check" id="gc-share" checked> <span>Share material titles and links with other EWUdiots students in the same course, so every section and semester sees the study structure. Files stay in Google Drive with Classroom's own access.</span></label>
      <button class="btn primary lg block mt" id="gc-go">${icon("sync")} ${last ? "Import again" : "Connect and import"}</button></section>${lastHtml}`;
  };
  pages.classroom.mount = (el) => {
    $("#gc-go", el)?.addEventListener("click", async (e) => {
      const b = e.currentTarget, share = $("#gc-share", el)?.checked; busy(b, true, "Connecting…"); run = {};
      try {
        const sum = await importAll(share, (code, v) => { run[code] = v; if (ctx.route() === "classroom") ctx.rerender(); });
        run = null; ctx.rerender();
        toast("Imported from Google Classroom", "success", `${sum.reduce((a, c) => a + c.materials, 0)} materials, ${sum.reduce((a, c) => a + c.tasks, 0)} new deadlines.`);
      } catch (x) { run = null; busy(b, false); ctx.rerender(); toast(x.status === 403 ? "Classroom access is blocked for this account" : "Couldn't import", "error", x.status === 403 ? "EWU's Google admin may need to allow EWUdiots." : x.message); }
    });
  };
}
