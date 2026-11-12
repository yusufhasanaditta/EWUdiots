/* Landing page: install prompt, platform hints, scroll reveal. */
const $ = (s) => document.querySelector(s);

// Install as an app (Chrome / Edge / Android). The browser decides when this is offered.
let deferred = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); deferred = e;
  const b = $("#install-btn"); if (b) b.hidden = false;
  const h = $("#install-hint"); if (h) h.hidden = true;
});
$("#install-btn")?.addEventListener("click", async () => {
  if (!deferred) return;
  deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  if (outcome === "accepted") { $("#install-btn").hidden = true; $("#install-text").textContent = "Installed. Find EWUdiots in your apps."; }
});
window.addEventListener("appinstalled", () => { const b = $("#install-btn"); if (b) b.hidden = true; });
if (matchMedia("(display-mode: standalone)").matches) { const h = $("#install-hint"); if (h) h.textContent = "You're already using the installed app."; }
if (/iPhone|iPad|iPod/.test(navigator.userAgent)) { const h = $("#install-hint"); if (h) h.textContent = "On iPhone and iPad: Safari → Share → Add to Home Screen."; }

// Reveal-on-scroll (skipped when the user prefers reduced motion).
const items = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  document.documentElement.classList.add("js-reveal");
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
  items.forEach((el, i) => { el.style.transitionDelay = `${(i % 4) * 60}ms`; io.observe(el); });
}

// Live notice board preview (same /api/notices the app uses) and the real faculty count.
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
const board = $("#board");
if (board) fetch("/api/notices").then((r) => r.json()).then((j) => {
  const list = (j.notices || []).slice(0, 4);
  if (!list.length) throw new Error("empty");
  board.innerHTML = list.map((n) => `<a class="n" href="${esc(n.url)}" target="_blank" rel="noopener"><span class="fi"><svg class="i"><use href="#i-mega"/></svg></span><span><b>${esc(n.title)}</b><span>${esc(n.cat)} · ${fmt(n.date)}</span></span></a>`).join("");
  const s = $("#stat-notice"); if (s) s.textContent = String(j.notices.length);
}).catch(() => {
  board.innerHTML = `<p class="empty">The live board loads on the deployed site. <a href="https://www.ewubd.edu/notice-board" target="_blank" rel="noopener">See EWU notices on ewubd.edu</a>.</p>`;
  const st = $("#live-status"); if (st) st.textContent = "Updates every 30 minutes";
});
// Campus news cards and alumni numbers (same data the app uses).
const lnews = $("#lnews");
if (lnews) fetch("/api/news").then((r) => r.json()).then((j) => {
  const list = (j.news || []).slice(0, 3); if (!list.length) throw new Error("empty");
  lnews.innerHTML = list.map((n, i) => `<a class="ncard reveal in" style="--d:${i * 80}ms" href="${esc(n.url)}" target="_blank" rel="noopener">${n.image ? `<span class="nimg"><img src="${esc(n.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>` : ""}<span class="nbody"><span class="ntag">${esc(n.tag)} · ${fmt(n.date)}</span><b>${esc(n.title)}</b></span></a>`).join("");
}).catch(() => { lnews.innerHTML = `<p class="empty">News loads on the live site. <a href="https://www.ewubd.edu/news" target="_blank" rel="noopener">Read EWU news on ewubd.edu</a>.</p>`; });
fetch("/data/alumni.json").then((r) => r.json()).then((j) => {
  const a = j.alumni || [], F = j.fields || [], col = (k) => a.map((r) => r[F.indexOf(k)]);
  const set = (id, n) => { const el = $(id); if (el) { el.dataset.to = n; el.textContent = n; } };
  set("#al-n", a.length); set("#al-c", new Set(col("country")).size); set("#al-o", new Set(col("org")).size);
  countUp(document.querySelector(".alumni-stats"));
}).catch(() => {});
// Numbers count up once they scroll into view.
function countUp(box) {
  if (!box || matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (!e.isIntersecting) return; io.disconnect();
    box.querySelectorAll(".count").forEach((el) => { const to = Number(el.dataset.to), t0 = performance.now(); const step = (t) => { const k = Math.min(1, (t - t0) / 1100); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }); }), { threshold: .4 });
  io.observe(box);
}
// The hero's liquid blobs drift toward the pointer a little.
const liquid = $(".hero .liquid");
if (liquid && !matchMedia("(prefers-reduced-motion: reduce)").matches) addEventListener("pointermove", (e) => {
  liquid.style.setProperty("--px", (e.clientX / innerWidth - .5).toFixed(3)); liquid.style.setProperty("--py", (e.clientY / innerHeight - .5).toFixed(3));
}, { passive: true });
fetch("/data/faculty.json").then((r) => r.json()).then((j) => { const s = $("#stat-fac"); if (s && j.count) s.textContent = String(j.count); }).catch(() => {});

// Sticky header: shadow after scrolling; on phones it hides while scrolling down and returns on the way up.
const top = $(".top");
let lastY = scrollY;
addEventListener("scroll", () => {
  if (!top) return;
  const y = scrollY;
  top.classList.toggle("scrolled", y > 8);
  if (innerWidth < 768 && y > 120 && y > lastY + 6) top.classList.add("hide");
  else if (y < lastY - 6 || y < 120) top.classList.remove("hide");
  lastY = y;
}, { passive: true });

/* Hero (from the Language Hub project): a split-flap word synced with a 3D coverflow of feature cards. The cards
   advance on their own until the visitor touches them; course codes float at three depths and the headline lifts
   away on scroll. motion.js is the same motion layer the app uses. */
import { install as installMotion } from "./motion.ts";
const motion = installMotion();
const hero = $("[data-hero]");
if (hero) {
  const reduce = motion.still();
  const flap = hero.querySelector("[data-flap]"), track = hero.querySelector("[data-track]"), dotsBox = hero.querySelector("[data-dots]");
  const words = flap.dataset.words.split("|"), colors = flap.dataset.colors.split("|");
  const [top0, bot0, flyTop, flyBot] = flap.querySelectorAll(".flap-face");
  const face = (el, i) => { el.textContent = words[i]; el.style.setProperty("--c", colors[i]); };
  let cur = 0, busy = false, queued = null, took = false;
  const show = (i) => { face(top0, i); face(bot0, i); hero.style.setProperty("--tone", colors[i]); };
  function flipTo(i) {
    if (i === cur) return;
    if (busy) { queued = i; return; }
    if (reduce) { cur = i; return show(i); }
    busy = true;
    face(flyTop, cur); face(top0, i); face(flyBot, i); // old top half falls, the new bottom half swings down
    flap.classList.remove("is-flipping"); void flap.offsetWidth; flap.classList.add("is-flipping");
    hero.style.setProperty("--tone", colors[i]);
    setTimeout(() => { face(bot0, i); flap.classList.remove("is-flipping"); cur = i; busy = false; if (queued !== null) { const q = queued; queued = null; flipTo(q); } }, 620);
  }
  const dots = words.map((w, i) => { const d = Object.assign(document.createElement("button"), { type: "button" }); d.setAttribute("aria-label", w); d.addEventListener("click", () => { took = true; go(i); }); dotsBox.append(d); return d; });
  const center = (i) => { dots.forEach((d, k) => d.classList.toggle("is-on", k === i)); flipTo(i); };
  // Start on the second card so a neighbour peeks out on both sides ("swipe me").
  const first = innerWidth < 1180 ? 1 : 0;
  cur = first; show(first); dots[first].classList.add("is-on");
  const go = motion.coverflow(track, center, first);
  ["pointerdown", "wheel", "keydown", "touchstart"].forEach((ev) => track.addEventListener(ev, () => { took = true; }, { passive: true }));
  if (!reduce) {
    setInterval(() => { if (!took && !document.hidden && scrollY < hero.offsetHeight) go((cur + 1) % words.length); }, 3200);
    let ticking = false;
    const onScroll = () => { ticking = false; hero.style.setProperty("--p", Math.min(1, Math.max(0, scrollY / (hero.offsetHeight * 0.8))).toFixed(3)); };
    addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
    if (matchMedia("(hover: hover)").matches) hero.addEventListener("pointermove", (e) => {
      const r = hero.getBoundingClientRect();
      hero.style.setProperty("--mx", ((e.clientX - r.left) / r.width - 0.5).toFixed(3)); hero.style.setProperty("--my", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
    });
  }
}
motion.tilt(document);

if ("serviceWorker" in navigator && import.meta.env.PROD) navigator.serviceWorker.register("/sw.js").catch(() => {});

/* Website content and theme managed in the admin panel (Website section): text, FAQ, announcement bar, contact and
   social links. Read straight from the public site_settings table; the page keeps its built-in text if that fails. */
import { applyBrand } from "./theme.js";
const SB = import.meta.env.VITE_SUPABASE_URL, KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const safeUrl = (u) => (/^(https:\/\/|mailto:|\/|#)/.test(u || "") ? u : "");
function applySite(c = {}) {
  document.querySelectorAll("[data-cms]").forEach((el) => { const v = c[el.dataset.cms]; if (typeof v === "string" && v.trim()) el.textContent = v.trim(); });
  if (Array.isArray(c.faq) && c.faq.length) {
    const box = document.querySelector("[data-cms-list='faq']");
    if (box) box.replaceChildren(...c.faq.filter((f) => f.q && f.a).map((f) => { const d = document.createElement("details"), s = document.createElement("summary"), p = document.createElement("p"); s.textContent = f.q; p.textContent = f.a; d.append(s, p); return d; }));
  }
  if (/^[^@\s]+@[^@\s]+$/.test(c.contact_email || "")) document.querySelectorAll("[data-cms-mail]").forEach((a) => { a.href = "mailto:" + c.contact_email; });
  const soc = document.querySelector("[data-cms-social]"), links = [["facebook", "Facebook"], ["instagram", "Instagram"], ["linkedin", "LinkedIn"], ["youtube", "YouTube"]].filter(([k]) => /^https:\/\//.test(c[k] || ""));
  if (soc && links.length) { soc.replaceChildren(...links.map(([k, l]) => Object.assign(document.createElement("a"), { href: c[k], textContent: l, rel: "noopener", target: "_blank" }))); soc.hidden = false; }
  if (c.announce_on && c.announce_text) {
    const bar = document.createElement("div"); bar.className = "announce";
    const t = document.createElement("span"); t.textContent = c.announce_text; bar.append(t);
    const link = safeUrl(c.announce_link); if (link) bar.append(Object.assign(document.createElement("a"), { href: link, textContent: c.announce_cta || "Learn more" }));
    document.body.prepend(bar);
  }
}
if (SB && KEY) fetch(`${SB}/rest/v1/site_settings?select=key,value&key=in.(site,theme)`, { headers: { apikey: KEY, authorization: `Bearer ${KEY}` } })
  .then((r) => (r.ok ? r.json() : [])).then((rows) => { const m = Object.fromEntries(rows.map((r) => [r.key, r.value])); if (m.theme) applyBrand(m.theme); if (m.site) applySite(m.site); }).catch(() => {});
// Anonymous page view for the admin Analytics page (see api/track.js; no cookies, skipped with "Do Not Track").
if (import.meta.env.PROD && navigator.doNotTrack !== "1") fetch("/api/track", { method: "POST", keepalive: true, headers: { "content-type": "text/plain" }, body: JSON.stringify({ path: location.pathname, ref: document.referrer }) }).catch(() => {});

// Download panel: QR code to the APK (scan it from a computer) and the live version number.
import qrcode from "qrcode-generator";
const qrBox = document.getElementById("dl-qr");
if (qrBox) { const q = qrcode(0, "M"); q.addData(location.origin + "/download/android"); q.make(); qrBox.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }
fetch("/version.json", { cache: "no-store" }).then((r) => r.json()).then((j) => { const v = document.getElementById("dl-ver"); if (v && j.version) v.textContent = `Version ${j.version}`; }).catch(() => {});
// Never leave content hidden: anything near the screen that the scroll animation hasn't shown within 2.5 s appears anyway.
setTimeout(() => document.querySelectorAll(".reveal:not(.in)").forEach((el) => { if (el.getBoundingClientRect().top < innerHeight * 1.5) el.classList.add("in"); }), 2500);

// The app's rising-bubble liquid at the bottom of the QR card (same component as the class card).
import { tideHtml } from "./tide.ts";
import "./tide.css";
document.querySelector(".dl2-qr")?.insertAdjacentHTML("afterbegin", tideHtml(0.2, { bubbles: 9, seed: 11, cls: "site-tide" }));

// Feature grid: the same animated Kubai icons as the app's tiles (hovering a tile animates its icon).
import { kubaiPlaceholder, hydrate as hydrateIcons } from "./kicons.ts";
document.querySelectorAll(".bento .tile").forEach((tile) => {
  const ic = tile.querySelector(".ic"), name = ic?.querySelector("use")?.getAttribute("href")?.replace("#i-", "") || "";
  const tone = { "t-purple": "purple", "t-blue": "blue", "t-orange": "orange", "t-green": "green", "t-pink": "pink", "t-teal": "teal", "t-yellow": "yellow", "t-red": "red" }[[...(ic?.classList || [])].find((c) => c.startsWith("t-")) || ""] || "purple";
  const k = ic && kubaiPlaceholder(name, tone, 28);
  if (k) { ic.innerHTML = k; ic.classList.add("ki"); tile.setAttribute("data-kubai-trigger", ""); }
});
hydrateIcons(document);
