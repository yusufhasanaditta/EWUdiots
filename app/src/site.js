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

// Sticky header shadow after scrolling.
const top = $(".top");
addEventListener("scroll", () => top && top.classList.toggle("scrolled", scrollY > 8), { passive: true });

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
