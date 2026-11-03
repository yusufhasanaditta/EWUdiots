/* Course outline on the course page (#/course?c=…&tab=outline): upload a PDF or photos of the outline, read it on this
   device (pdf.js text layer, or OCR for photos), and show it as the course's own page: instructor, class times, topics
   you can tick off, mark distribution, grading, exam countdowns, important dates and rules.
   One tap sends exams to the Exams planner and the mark distribution to the Marks estimator.
   Saved in the app's state (S.outlines[code]); the original file stays in this device's file store only. */
import { parseOutline, pdfText } from "./outline.js";
import { getBlob, setBlob, delBlob } from "./blobstore.js";

const PARTS = 12;

/** @param {any} ctx @param {{ prepOf: (id: string) => any }} helpers */
export function createOutline(ctx, { prepOf }) {
  const { icon, esc, toast } = ctx;
  const all = () => (ctx.S.outlines = ctx.S.outlines || {});
  const get = (code) => all()[code] || null;
  let busy = null; // { code, stage, pct }

  const daysTo = (iso) => Math.ceil((new Date(`${iso}T09:00:00+06:00`) - Date.now()) / 864e5);
  const fmtD = (iso) => new Date(`${iso}T12:00:00+06:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const fmtShort = (iso) => new Date(`${iso}T12:00:00+06:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  /* ── Reading a file ── */
  async function read(files, code, course) {
    const list = [...files].slice(0, 8);
    if (!list.length) return;
    const pdf = list.find((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    busy = { code, stage: pdf ? "Opening the PDF…" : "Reading the photo…", pct: 0 }; ctx.rerender();
    const step = (stage, pct = busy?.pct || 0) => { busy = { code, stage, pct }; const b = document.querySelector("#ol-busy"); if (b) { b.querySelector("b").textContent = stage; b.querySelector("i").style.width = `${Math.round(pct * 100)}%`; } };
    try {
      let text = "";
      if (pdf) {
        if (pdf.size > 15e6) throw new Error("That PDF is over 15 MB. Try a smaller copy.");
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/legacy/build/pdf.worker.mjs?url")).default;
        step("Reading the text…", 0.4);
        const data = new Uint8Array(await pdf.arrayBuffer());
        text = await pdfText(data, pdfjs);
        // A scanned PDF has no text layer; ask for photos instead of guessing.
        if (text.replace(/\s/g, "").length < 200) throw new Error("This PDF is a scanned picture with no text in it. Take photos of its pages and pick those instead.");
        step("Finding topics, marks and dates…", 0.85);
        await keepOriginal(code, pdf);
      } else {
        const { readText } = await import("./ocr.js");
        for (let i = 0; i < list.length; i++) {
          step(`Reading page ${i + 1} of ${list.length}…`, i / list.length);
          text += `\n${await readText(list[i], (p) => step(`Reading page ${i + 1} of ${list.length}…`, (i + p) / list.length))}`;
        }
        step("Finding topics, marks and dates…", 0.95);
        await keepOriginal(code, list[0]);
      }
      const o = parseOutline(text, { code, section: course?.sec });
      if (o.found.length < 2) throw new Error("We couldn't find a course outline in that file. Check it's the outline, or try clearer photos.");
      if (o.code && o.code.slice(-3) !== code.slice(-3)) toast(`This outline says ${o.code}, not ${code}. Saved it here anyway.`, "info");
      const prev = get(code);
      all()[code] = { ...o, done: prev?.done || {}, file: pdf ? pdf.name : `${list.length} photo${list.length > 1 ? "s" : ""}`, kind: pdf ? "pdf" : "img", at: new Date().toISOString() };
      ctx.save(); busy = null; ctx.rerender();
      toast("Course outline added", "success", `Read ${o.found.length} of ${PARTS} parts: ${o.units.reduce((n, u) => n + u.topics.length, 0)} topics, ${o.exams.length} exam date${o.exams.length === 1 ? "" : "s"}.`);
    } catch (e) {
      busy = null; ctx.rerender();
      toast(e.message || "Couldn't read that file.", "error");
    }
  }
  async function keepOriginal(code, file) {
    if (file.size > 8e6) return;
    try { await setBlob(`outline:${code}`, { type: file.type || "application/pdf", name: file.name, data: await file.arrayBuffer() }); } catch { /* storage full: keep the data, not the file */ }
  }

  /* ── The tab ── */
  function upload(code) {
    return `<section class="ol-up"><span class="ol-art">${icon("file", "solid")}</span>
      <div class="min0"><h2>Scan your course outline</h2><p>Upload the outline your faculty shared (PDF), or take photos of it. We read it on this phone and fill in this course: topics, marks, grading, exam dates and the faculty's office hours.</p></div>
      <div class="ol-btns"><label class="btn primary lg">${icon("upload", "sm")} Upload PDF or photos<input type="file" id="ol-file" accept="application/pdf,image/*" multiple hidden></label>
        <label class="btn outline lg">${icon("scan", "sm")} Scan with camera<input type="file" id="ol-cam" accept="image/*" capture="environment" hidden></label></div>
      <p class="xs">${icon("lock", "sm")} Read on this device. Nothing is uploaded.</p></section>`;
  }
  function progress() {
    return `<section class="ol-busy card" id="ol-busy" role="status" aria-live="polite"><span class="spinner"></span><div class="grow"><b>${esc(busy.stage)}</b><span class="ol-pbar"><i style="width:${Math.round((busy.pct || 0) * 100)}%"></i></span></div></section>`;
  }

  function panel(code, course) {
    if (busy?.code === code) return progress();
    const o = get(code);
    if (!o) return upload(code);
    const total = o.units.reduce((n, u) => n + u.topics.length, 0), covered = Object.values(o.done || {}).filter(Boolean).length;
    const pct = total ? Math.round((100 * covered) / total) : 0;
    const exams = o.exams.map((x) => ({ ...x, d: daysTo(x.date) }));
    const nextEx = exams.filter((x) => x.d >= 0).sort((a, b) => a.d - b.d)[0];
    const added = (x) => ctx.S.tasks.some((t) => t.course === code && t.type === "Exam" && t.due?.slice(0, 10) === x.date);
    const marks = ctx.S.marks?.[code];
    const inMarks = marks?.parts?.length && o.assessment.length && o.assessment.every((a) => marks.parts.some((p) => p.n === a.name && Number(p.w) === a.pct));
    const today = new Date().toISOString().slice(0, 10);
    const ins = o.instructor, f = ctx.facBy?.(course?.faculty);
    const sem = o.semester ? `${o.semester.term} ${o.semester.year}` : "";

    return `<section class="ol-head"><div class="min0"><span class="ol-kick">${icon("file", "sm")} Course outline${sem ? ` · ${esc(sem)}` : ""}${o.section ? ` · Section ${esc(o.section)}` : ""}</span>
        <h2>${esc(o.title || course?.title || code)}</h2>
        <div class="ol-facts">${o.credits ? `<span>${icon("award", "sm")} ${o.credits} credits</span>` : ""}${o.prereq ? `<span>${icon("lock", "sm")} Needs ${esc(o.prereq)}</span>` : ""}${o.dept ? `<span>${icon("building", "sm")} ${esc(o.dept)}</span>` : ""}</div></div>
        <div class="ol-ring" style="--p:${pct}" role="img" aria-label="${pct}% of topics covered"><b>${pct}%</b><span>covered</span></div></section>

      ${nextEx ? `<div class="ol-exams">${exams.map((x) => `<div class="ol-ex ${x.d < 0 ? "past" : x === nextEx ? "next" : ""}"><span class="ol-exd"><b>${x.d < 0 ? "Done" : x.d === 0 ? "Today" : x.d}</b>${x.d > 0 ? `<i>day${x.d === 1 ? "" : "s"}</i>` : ""}</span><span class="min0"><b>${esc(x.name)}</b><span>${fmtD(x.date)}</span></span></div>`).join("")}</div>
        ${exams.some((x) => x.d >= 0 && !added(x)) ? `<button class="btn outline block mt-s" id="ol-exams">${icon("calendar", "sm")} Add exam dates to my Exams planner</button>` : `<p class="xs mt-s">${icon("checkc", "sm")} Exam dates are in your Exams planner.</p>`}`
        : exams.length ? `<div class="ol-exams">${exams.map((x) => `<div class="ol-ex past"><span class="ol-exd"><b>Done</b></span><span class="min0"><b>${esc(x.name)}</b><span>${fmtD(x.date)}</span></span></div>`).join("")}</div>` : ""}

      ${ins ? `<section class="card ol-card mt"><div class="card-h"><h2>${icon("user", "sm")} Instructor</h2>${f ? `<a class="see" href="#/prof?i=${encodeURIComponent(f.init)}">Profile</a>` : ""}</div>
        <div class="ol-ins"><span class="ol-ava">${esc((ins.name || "?").replace(/^(Dr|Prof|Mr|Ms|Mrs)\.?\s+/i, "").split(/\s+/).map((w) => w[0]).slice(0, 2).join(""))}</span><div class="min0"><b>${esc(ins.name || "Course instructor")}</b><span>${esc(ins.role || "")}</span></div></div>
        <div class="ol-contact">${ins.office ? `<span>${icon("door", "sm")} Room ${esc(ins.office)}</span>` : ""}${ins.email ? `<a href="mailto:${esc(ins.email)}?subject=${encodeURIComponent(`${code}${o.section ? ` Section ${o.section}` : ""}`)}">${icon("mail", "sm")} ${esc(ins.email)}</a>` : ""}${ins.phone ? `<a href="tel:${esc(ins.phone)}">${icon("phone", "sm")} ${esc(ins.phone)}</a>` : ""}</div>
        ${o.officeHours.length ? `<h3 class="ol-sub">Office hours</h3><div class="ol-chips">${o.officeHours.map((h) => `<span>${esc(h.day.slice(0, 3))} ${esc(h.start)}${h.end ? ` – ${esc(h.end)}` : ""}</span>`).join("")}</div>` : ""}
        ${o.classes.length ? `<h3 class="ol-sub">Your classes</h3><div class="ol-chips cls">${o.classes.map((c) => `<span>${icon("calendar", "sm")} ${esc(c.day)} ${esc(c.start)} – ${esc(c.end)}${c.room ? ` · ${esc(c.room)}` : ""}</span>`).join("")}</div>` : ""}</section>` : ""}

      ${o.units.length ? `<section class="card ol-card mt"><div class="card-h"><h2>${icon("book", "sm")} Course topics</h2><span class="xs">${covered} of ${total} covered</span></div>
        ${o.units.map((u, i) => { const keys = u.topics.map((_, k) => `${i}.${k}`), d = keys.filter((k) => o.done?.[k]).length;
          return `<details class="ol-unit" ${i === 0 || (d > 0 && d < keys.length) ? "open" : ""}><summary><span class="ol-un">${i + 1}</span><span class="min0 grow"><b>${esc(u.title)}</b><span class="ol-ubar"><i style="width:${keys.length ? (100 * d) / keys.length : 0}%"></i></span></span><span class="xs">${d}/${keys.length}</span></summary>
            ${u.topics.length ? `<ul>${u.topics.map((t, k) => `<li><label><input type="checkbox" data-olt="${i}.${k}" ${o.done?.[`${i}.${k}`] ? "checked" : ""}><span>${esc(t)}</span></label></li>`).join("")}</ul>` : `<p class="xs">No topics listed for this unit.</p>`}</details>`; }).join("")}
        <p class="xs mt-s">Tick topics as the class covers them. Exams you add from here get these topics as their revision plan.</p></section>` : ""}

      ${o.assessment.length ? `<section class="card ol-card mt"><div class="card-h"><h2>${icon("percent", "sm")} Mark distribution</h2><span class="xs">${o.assessment.reduce((s, a) => s + a.pct, 0)}%</span></div>
        <div class="ol-marks">${o.assessment.slice().sort((a, b) => b.pct - a.pct).map((a, i) => `<div><span class="ellipsis">${esc(a.name)}</span><span class="ol-mbar"><i class="s${i % 6}" style="width:${Math.min(100, a.pct * (100 / Math.max(...o.assessment.map((x) => x.pct))))}%"></i></span><b>${a.pct}%</b></div>`).join("")}</div>
        ${inMarks ? `<p class="xs mt-s">${icon("checkc", "sm")} Your Marks estimator uses this distribution.</p>` : `<button class="btn outline block mt-s" id="ol-marks">${icon("calc", "sm")} Use this in my Marks estimator</button>`}</section>` : ""}

      ${o.grading.length ? `<section class="card ol-card mt"><div class="card-h"><h2>${icon("award", "sm")} Grading policy</h2></div>
        <div class="ol-grades">${o.grading.map((g) => `<div><span class="ol-gl g-${esc(g.letter.replace("+", "p").replace("-", "m"))}">${esc(g.letter)}</span><span>${esc(g.range)}</span>${g.point != null ? `<b>${Number(g.point).toFixed(2)}</b>` : ""}</div>`).join("")}</div></section>` : ""}

      ${o.dates.length ? `<section class="card ol-card mt"><div class="card-h"><h2>${icon("calcheck", "sm")} Important dates</h2></div>
        <div class="ol-dates">${o.dates.map((d) => { const past = (d.end || d.date) < today, now = d.date <= today && (d.end || d.date) >= today; return `<div class="${past ? "past" : now ? "now" : ""}"><span class="ol-dd">${fmtShort(d.date)}${d.end ? `<i>– ${fmtShort(d.end)}</i>` : ""}</span><span>${esc(d.label)}</span></div>`; }).join("")}</div></section>` : ""}

      ${o.objectives.length || o.outcomes.length || o.rationale ? `<section class="card ol-card mt"><div class="card-h"><h2>${icon("target", "sm")} What you'll learn</h2></div>
        ${o.rationale ? `<p class="small" style="color:var(--text-2);line-height:1.6">${esc(o.rationale)}</p>` : ""}
        ${o.objectives.length ? `<details class="ol-more" open><summary>Course objectives (${o.objectives.length})</summary><ol>${o.objectives.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></details>` : ""}
        ${o.outcomes.length ? `<details class="ol-more"><summary>Learning outcomes (${o.outcomes.length})</summary><ol>${o.outcomes.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></details>` : ""}</section>` : ""}

      ${o.textbooks.length ? `<section class="card ol-card mt"><div class="card-h"><h2>${icon("books", "sm")} Textbooks</h2><a class="see" href="#/vault?q=${encodeURIComponent(code)}">Find PDFs</a></div>
        <ol class="ol-books">${o.textbooks.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></section>` : ""}

      ${o.instructions.length ? `<section class="card ol-card mt"><div class="card-h"><h2>${icon("alert", "sm")} Class rules</h2></div>
        <ul class="ol-rules">${o.instructions.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>` : ""}

      <section class="ol-foot mt"><span class="xs">${icon("file", "sm")} ${esc(o.file || "Outline")} · read ${new Date(o.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · ${o.found.length} of ${PARTS} parts found</span>
        <div class="row" style="gap:8px">${o.kind === "pdf" ? `<button class="btn sm ghost" id="ol-open">${icon("external", "sm")} Original</button>` : ""}<label class="btn sm outline">${icon("reset", "sm")} Scan again<input type="file" id="ol-file" accept="application/pdf,image/*" multiple hidden></label><button class="btn sm ghost danger-t" id="ol-del">${icon("trash", "sm")} Remove</button></div></section>`;
  }

  function mount(el, code, course) {
    const pick = (id) => el.querySelector(id)?.addEventListener("change", (e) => { if (e.target.files?.length) read(e.target.files, code, course); e.target.value = ""; });
    pick("#ol-file"); pick("#ol-cam");
    el.querySelectorAll("[data-olt]").forEach((b) => b.addEventListener("change", () => {
      const o = get(code); if (!o) return; (o.done = o.done || {})[b.dataset.olt] = b.checked; ctx.save();
      const total = o.units.reduce((n, u) => n + u.topics.length, 0), pct = total ? Math.round((100 * Object.values(o.done).filter(Boolean).length) / total) : 0;
      const ring = el.querySelector(".ol-ring"); if (ring) { ring.style.setProperty("--p", pct); ring.querySelector("b").textContent = `${pct}%`; }
      const det = b.closest("details"), boxes = [...det.querySelectorAll("[data-olt]")], d = boxes.filter((x) => x.checked).length;
      det.querySelector(".ol-ubar i").style.width = `${(100 * d) / boxes.length}%`; det.querySelector("summary > .xs").textContent = `${d}/${boxes.length}`;
    }));
    el.querySelector("#ol-exams")?.addEventListener("click", () => {
      const o = get(code); let n = 0;
      for (const x of o.exams) {
        if (daysTo(x.date) < 0 || ctx.S.tasks.some((t) => t.course === code && t.type === "Exam" && t.due?.slice(0, 10) === x.date)) continue;
        const id = ctx.uid(), slot = o.classes[0]?.start || "10:00 AM", [, hh, mm, ap] = slot.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/) || [0, 10, "00", "AM"];
        const h = (Number(hh) % 12) + (ap === "PM" ? 12 : 0);
        ctx.S.tasks.push({ id, title: x.name, course: code, type: "Exam", due: new Date(`${x.date}T${String(h).padStart(2, "0")}:${mm}:00+06:00`).toISOString(), done: false });
        // Mid-terms revise the first half of the units, finals everything.
        const units = /final/i.test(x.name) ? o.units : o.units.slice(0, Math.max(1, Math.ceil(o.units.length / 2)));
        prepOf(id).topics = units.flatMap((u) => u.topics.length ? u.topics : [u.title]).slice(0, 30).map((name) => ({ id: ctx.uid(), name: name.slice(0, 60), conf: 1 }));
        n++;
      }
      ctx.save(); ctx.rerender(); toast(n ? `${n} exam${n > 1 ? "s" : ""} added` : "Already in your planner", "success", n ? "Each comes with a revision plan from the course topics." : "");
    });
    el.querySelector("#ol-marks")?.addEventListener("click", () => {
      const o = get(code), cur = ctx.S.marks[code]?.parts || [];
      ctx.S.marks[code] = { ...(ctx.S.marks[code] || {}), parts: o.assessment.map((a) => ({ n: a.name, w: a.pct, got: cur.find((p) => p.n === a.name)?.got ?? "" })) };
      ctx.save(); ctx.rerender(); toast("Marks estimator updated", "success", "Enter marks as you get them to see your grade.");
    });
    el.querySelector("#ol-open")?.addEventListener("click", async () => {
      const b = await getBlob(`outline:${code}`);
      if (!b?.data) return toast("The original isn't on this device any more.", "info");
      window.open(URL.createObjectURL(new Blob([b.data], { type: b.type })), "_blank", "noopener");
    });
    el.querySelector("#ol-del")?.addEventListener("click", () => ctx.confirmModal("Remove this outline?", "Its topics, ticks and dates go from this course. Exams already added stay in your planner.", "Remove", () => {
      delete all()[code]; delBlob(`outline:${code}`); ctx.save(); ctx.rerender(); toast("Outline removed", "info");
    }, true));
  }

  /** Small card for the course Overview: next exam + topic progress, or a prompt to scan. */
  function card(code) {
    const o = get(code), href = `#/course?c=${encodeURIComponent(code)}&tab=outline`;
    if (!o) return `<a class="card ol-prompt mt row nowrap" href="${href}"><span class="itile purple">${icon("scan")}</span><div class="grow min0"><b>Add your course outline</b><p class="xs">Upload or scan it to get topics, mark distribution, grading and exam dates here.</p></div>${icon("chevR")}</a>`;
    const total = o.units.reduce((n, u) => n + u.topics.length, 0), covered = Object.values(o.done || {}).filter(Boolean).length;
    const nx = o.exams.map((x) => ({ ...x, d: daysTo(x.date) })).filter((x) => x.d >= 0).sort((a, b) => a.d - b.d)[0];
    return `<a class="card ol-prompt mt row nowrap" href="${href}"><span class="itile green">${icon("file")}</span><div class="grow min0"><b>Course outline</b><p class="xs">${total ? `${covered}/${total} topics covered` : `${o.found.length} parts read`}${nx ? ` · ${esc(nx.name)} in ${nx.d} day${nx.d === 1 ? "" : "s"}` : ""}</p></div>${icon("chevR")}</a>`;
  }

  return { panel, mount, card, get };
}
