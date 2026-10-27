/* Class alarms: choose how long before each class you're warned (any number of minutes or hours, up to four
   alarms), the same for every class or different per course. Phones ring through a high-importance system
   notification even when the app is closed; while the app is open it also shows an in-app alarm with a chime. */
export function install(ctx) {
  const { pages, icon, esc, $, $$, toast, openModal, closeModal } = ctx;
  const S = () => ctx.S, A = () => S().settings.alarms;
  const PRESETS = [5, 10, 15, 30, 45, 60, 90, 120];
  const MAX = 4;
  const chips = (list, attr) => list.length ? list.slice().sort((a, b) => b - a).map((m) => `<span class="al-chip">${icon("bell", "sm")} ${ctx.fmtBefore(m)}<button type="button" ${attr}="${m}" aria-label="Remove ${ctx.fmtBefore(m)}">${icon("x", "sm")}</button></span>`).join("") : `<span class="small muted">No alarm</span>`;
  const picker = (id) => `<div class="al-presets">${PRESETS.map((m) => `<button type="button" class="chip" data-${id}-p="${m}">${ctx.fmtBefore(m)}</button>`).join("")}</div>
    <form class="row nowrap mt-s al-custom" data-${id}-f><label class="sr-only" for="${id}-n">Custom time</label><input class="input" id="${id}-n" name="n" type="number" min="1" max="720" inputmode="numeric" placeholder="Custom" required>
      <select class="select" name="u" aria-label="Unit"><option value="1">minutes</option><option value="60">hours</option></select><button class="btn sm primary">${icon("plus", "sm")} Add</button></form>`;
  const add = (list, m) => { m = Math.round(m); if (!(m >= 1 && m <= 720)) { toast("Choose between 1 minute and 12 hours", "warn"); return list; } if (list.includes(m)) return list; if (list.length >= MAX) { toast(`Up to ${MAX} alarms per class`, "warn"); return list; } return [...list, m]; };
  const saved = (msg = "Alarms saved") => { ctx.save(); ctx.scheduleReminders(); toast(msg, "success"); ctx.rerender(); };

  pages.alarms = () => {
    const a = A(), courses = [...new Map(S().routine.map((r) => [r.code, r])).values()];
    const next = ctx.upcomingAlarms(6), perm = S().settings.notify;
    return `${ctx.subHead("Class alarms", "Warn me before every class", "#/routine")}<div style="max-width:720px;margin:0 auto">
      <section class="card al-hero"><div class="row nowrap"><span class="al-bell${a.on ? " on" : ""}" aria-hidden="true">${icon("bell")}</span><div class="grow"><b style="font-size:17px">${a.on ? "Alarms are on" : "Alarms are off"}</b><p class="small muted">${a.on ? `${a.offsets.map(ctx.fmtBefore).join(" and ")} before each class${Object.keys(a.perCourse).length ? `, custom for ${Object.keys(a.perCourse).length} course${Object.keys(a.perCourse).length > 1 ? "s" : ""}` : ""}.` : "Turn on to get warned before your classes."}</p></div>
        <label class="switch"><input type="checkbox" id="al-on" ${a.on ? "checked" : ""} aria-label="Class alarms on"></label></div>
        ${a.on && !perm ? `<div class="alert amber mt-s"><span class="a-ic">${icon("alert")}</span><div class="grow"><b>Allow notifications</b><p>So alarms can ring when the app is closed.</p></div><button class="btn sm primary" id="al-allow">Allow</button></div>` : ""}</section>
      ${a.on ? `<section class="card mt"><div class="card-h"><h2>Every class</h2><span class="xs">Up to ${MAX} alarms</span></div>
        <div class="al-chips" id="al-def">${chips(a.offsets, "data-rm")}</div>${picker("d")}</section>
      <section class="card mt"><div class="card-h"><h2>Per course</h2><span class="xs">Different times for some courses</span></div>
        ${courses.length ? courses.map((c) => { const own = a.perCourse[c.code]; return `<div class="lrow"><span class="itile sm ${ctx.toneFor(c.code)}">${icon("book")}</span><span class="body"><b>${esc(c.code)}</b><span>${own ? (own.length ? own.map(ctx.fmtBefore).join(", ") + " before" : "No alarm for this course") : "Same as every class"}</span></span><button class="btn sm ${own ? "" : "ghost"}" data-pc="${esc(c.code)}">${own ? icon("edit", "sm") + " Edit" : "Customise"}</button></div>`; }).join("")
          : `<p class="small muted">Sync or add your routine to set alarms per course. <a href="#/sync">Sync portal</a></p>`}</section>
      <section class="card mt"><div class="card-h"><h2>Coming up</h2>${next.length ? `<button class="btn sm ghost" id="al-test">${icon("play", "sm")} Test alarm</button>` : ""}</div>
        ${next.length ? next.map((x) => `<div class="lrow"><span class="itile sm purple">${icon("clock")}</span><span class="body"><b>${x.at.toLocaleDateString("en-GB", { weekday: "short" })} ${x.at.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })}</b><span>${esc(x.code)} at ${ctx.fmt12(x.s)} · ${ctx.fmtBefore(x.off)} before</span></span></div>`).join("") : `<p class="small muted">No classes on your routine yet.</p>`}</section>
      <section class="card settings-list mt"><div class="lrow"><span class="itile pink">${icon("bell")}</span><span class="body"><b>Ring inside the app</b><span>A chime and an alarm screen while EWUdiots is open</span></span><label class="switch"><input type="checkbox" id="al-ring" ${a.ring ? "checked" : ""} aria-label="Ring inside the app"></label></div></section>` : ""}
      <p class="xs mt">On Android, alarms use the "Class alarms" notification channel. Keep battery saver from blocking EWUdiots so they ring on time.</p></div>`;
  };
  pages.alarms.mount = (el) => {
    const a = A();
    $("#al-on", el)?.addEventListener("change", async (e) => { a.on = e.target.checked; if (a.on && !S().settings.notify) await ctx.enableNotifications(); saved(a.on ? "Alarms on" : "Alarms off"); });
    $("#al-allow", el)?.addEventListener("click", async () => { await ctx.enableNotifications(); ctx.scheduleReminders(); ctx.rerender(); });
    $("#al-ring", el)?.addEventListener("change", (e) => { a.ring = e.target.checked; saved(); });
    $$("[data-rm]", el).forEach((b) => b.addEventListener("click", () => { a.offsets = a.offsets.filter((m) => m !== Number(b.dataset.rm)); saved("Alarm removed"); }));
    $$("[data-d-p]", el).forEach((b) => b.addEventListener("click", () => { a.offsets = add(a.offsets, Number(b.dataset.dP)); saved(); }));
    $("[data-d-f]", el)?.addEventListener("submit", (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); a.offsets = add(a.offsets, Number(f.n) * Number(f.u)); saved(); });
    $("#al-test", el)?.addEventListener("click", () => { const x = ctx.upcomingAlarms(1)[0]; if (x) ctx.ringAlarm(x, x.off); });
    $$("[data-pc]", el).forEach((b) => b.addEventListener("click", () => editCourse(b.dataset.pc)));
  };
  function editCourse(code) {
    const a = A();
    let list = (a.perCourse[code] || a.offsets).slice();
    const draw = (m) => {
      $("#pc-chips", m).innerHTML = chips(list, "data-pr");
      $$("[data-pr]", m).forEach((b) => b.addEventListener("click", () => { list = list.filter((x) => x !== Number(b.dataset.pr)); draw(m); }));
    };
    openModal(ctx.modalHead(`${code} alarms`) + `<div class="stack"><div class="al-chips" id="pc-chips"></div>${picker("c")}
      <div class="row mt"><button class="btn neutral grow" id="pc-reset">Same as every class</button><button class="btn primary grow" id="pc-save">${icon("check")} Save</button></div></div>`, (m) => {
      draw(m);
      $$("[data-c-p]", m).forEach((b) => b.addEventListener("click", () => { list = add(list, Number(b.dataset.cP)); draw(m); }));
      $("[data-c-f]", m).addEventListener("submit", (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); list = add(list, Number(f.n) * Number(f.u)); e.target.reset(); draw(m); });
      $("#pc-reset", m).addEventListener("click", () => { delete a.perCourse[code]; closeModal(); saved(`${code} uses your usual alarms`); });
      $("#pc-save", m).addEventListener("click", () => { a.perCourse[code] = list; closeModal(); saved(`${code} alarms saved`); });
    });
  }
}
