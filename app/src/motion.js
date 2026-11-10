/* Motion layer (ported from the Language Hub project): sliding indicators under the chosen tab, reveal-on-scroll,
   3D tilt on hero cards, a coverflow carousel and count-up numbers. Screens are re-rendered from strings, so
   indicators remember where they were (per page + group) and animate from there to the new tab (FLIP).
   Transform/opacity only; nothing moves under prefers-reduced-motion. */
export function install() {
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  // Automated browsers capture whole pages without scrolling: show everything at once for them.
  const still = () => reduce() || navigator.webdriver;
  const last = new Map();

  /* A pill behind the active item of `group` that slides from where it was last time. */
  function thumb(group, key, activeSel, cls = "mo-thumb") {
    if (!group) return;
    const active = group.querySelector(activeSel);
    let t = group.querySelector(`:scope > .${cls}`);
    if (!active) { t?.remove(); last.delete(key); return; }
    if (!t) { t = document.createElement("span"); t.className = cls; t.setAttribute("aria-hidden", "true"); group.prepend(t); }
    group.classList.add("mo-has-thumb");
    const box = { x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight };
    const put = (b, sx = 1) => { t.style.width = box.w + "px"; t.style.height = box.h + "px"; t.style.transform = `translate(${b.x}px, ${b.y}px) scaleX(${sx})`; };
    const prev = last.get(key);
    last.set(key, box);
    if (!prev || reduce() || (prev.x === box.x && prev.y === box.y && prev.w === box.w)) { t.style.transition = "none"; put(box); return; }
    t.style.transition = "none"; put(prev, prev.w / box.w || 1);
    void t.offsetWidth; // commit the start position before animating
    t.style.transition = ""; put(box);
  }

  /* Keep the chosen tab in view when a row of tabs scrolls sideways. */
  const showChosen = (seg) => {
    const a = seg.querySelector('[aria-selected="true"], [aria-current="page"], [aria-pressed="true"]');
    if (a && seg.scrollWidth > seg.clientWidth) seg.scrollLeft = Math.max(0, a.offsetLeft - (seg.clientWidth - a.offsetWidth) / 2);
  };

  function segs(root, page) {
    if (document.body.dataset.mode === "club") return; // club screens have their own tab style
    root.querySelectorAll(".seg").forEach((seg, i) => {
      showChosen(seg);
      thumb(seg, `seg|${page}|${i}`, ':scope > [aria-selected="true"], :scope > [aria-current="page"], :scope > [aria-pressed="true"]');
    });
  }

  /* Below-the-fold blocks slide up once as they scroll into view, a few at a time. */
  let io = null;
  function reveal(root) {
    if (still() || !("IntersectionObserver" in window)) return;
    io = io || new IntersectionObserver((entries) => {
      let k = 0;
      entries.filter((e) => e.isIntersecting).forEach((e) => { e.target.style.setProperty("--rv", Math.min(k++, 5)); e.target.classList.add("rv-in"); io.unobserve(e.target); });
    }, { rootMargin: "0px 0px -40px 0px", threshold: 0.08 });
    const fold = innerHeight;
    root.querySelectorAll("[data-page] > *, [data-page] .card, [data-page] .ccard, [data-page] section, [data-page] .road-step, [data-page] .sem-h, [data-page] .news-card").forEach((el) => {
      if (el.closest(".rv") || el.closest(".modal") || el.getBoundingClientRect().top < fold) return;
      el.classList.add("rv"); io.observe(el);
    });
  }

  /* Hero cards get aurora blobs and tilt (DESIGN.md §2: blobs only inside hero surfaces). */
  function heroes(root) {
    root.querySelectorAll(".deg-hero, .cgpa-card").forEach((el) => {
      el.setAttribute("data-tilt", "");
      if (!el.querySelector(":scope > .fluid")) el.insertAdjacentHTML("afterbegin", '<span class="fluid" aria-hidden="true"><i></i><i></i><i></i></span>');
    });
  }

  /* 3D tilt: follows the pointer on desktop. Hero cards opt in with data-tilt. */
  function tilt(root) {
    if (still() || !fine) return;
    root.querySelectorAll("[data-tilt]").forEach((el) => {
      if (el._tilt) return; el._tilt = true;
      el.addEventListener("animationend", () => { el.style.animation = "none"; }, { once: true }); // the rise-in would hold transform
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        el.classList.add("is-tilting"); el.style.setProperty("--ry", (x * 8).toFixed(2) + "deg"); el.style.setProperty("--rx", (y * -6).toFixed(2) + "deg");
        el.style.setProperty("--mx", (x + 0.5).toFixed(3)); el.style.setProperty("--my", (y + 0.5).toFixed(3));
      });
      el.addEventListener("pointerleave", () => { el.classList.remove("is-tilting"); el.style.setProperty("--ry", "0deg"); el.style.setProperty("--rx", "0deg"); });
    });
  }

  /* Big numbers count up from 0 the first time a screen opens: <b data-count="3.54">3.54</b>. */
  function counts(root, fresh) {
    if (!fresh || still()) return;
    root.querySelectorAll("[data-count]").forEach((el) => {
      const to = Number(el.dataset.count), dp = (el.dataset.count.split(".")[1] || "").length, t0 = performance.now();
      if (!Number.isFinite(to)) return;
      const step = (now) => { const p = Math.min(1, (now - t0) / 700), e = 1 - Math.pow(1 - p, 3); el.textContent = (to * e).toFixed(dp); if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }

  /* Coverflow: slides turn away in 3D the further they are from the centre; onCenter(i) when the centre one changes.
     Returns goto(i) to centre a slide. */
  function coverflow(track, onCenter, start = 0) {
    const slides = [...track.children];
    let raf = 0, best = -1;
    const paint = () => {
      raf = 0;
      const mid = track.scrollLeft + track.clientWidth / 2;
      let b = 0, bd = Infinity;
      slides.forEach((s, i) => {
        const d = (s.offsetLeft + s.offsetWidth / 2 - mid) / s.offsetWidth;
        if (Math.abs(d) < bd) { bd = Math.abs(d); b = i; }
        if (reduce()) return;
        const k = Math.max(-1.5, Math.min(1.5, d));
        s.style.setProperty("--ry", (k * -28).toFixed(2) + "deg");
        s.style.setProperty("--s", (1 - Math.min(Math.abs(k), 1) * 0.12).toFixed(3));
        s.style.setProperty("--o", (1 - Math.min(Math.abs(k), 1) * 0.4).toFixed(3));
      });
      slides.forEach((s, i) => s.classList.toggle("is-center", i === b));
      if (b !== best) { const first = best < 0; best = b; if (!first) onCenter?.(b); }
    };
    const goto = (i, smooth = true) => { const s = slides[Math.max(0, Math.min(slides.length - 1, i))]; if (s) track.scrollTo({ left: s.offsetLeft - (track.clientWidth - s.offsetWidth) / 2, behavior: smooth && !reduce() ? "smooth" : "auto" }); };
    track.addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(paint); }, { passive: true });
    goto(start, false); best = start; paint();
    return goto;
  }

  return {
    /* After a screen paints. fresh: a different screen than before (count-ups run once). */
    enhance(root, page, fresh) { segs(root, page); heroes(root); reveal(root); tilt(root); counts(root, fresh); },
    /* After the bottom bar / sidebar re-render. */
    nav() {
      thumb(document.getElementById("bottom-nav"), "bnav", ':scope > a[aria-current="page"]', "mo-pill");
      thumb(document.getElementById("side-nav"), "side", ':scope > a[aria-current="page"]', "mo-pill");
    },
    segs, coverflow
  };
}
