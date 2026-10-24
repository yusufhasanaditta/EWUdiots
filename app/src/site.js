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
fetch("/data/faculty.json").then((r) => r.json()).then((j) => { const s = $("#stat-fac"); if (s && j.count) s.textContent = String(j.count); }).catch(() => {});

// Sticky header shadow after scrolling.
const top = $(".top");
addEventListener("scroll", () => top && top.classList.toggle("scrolled", scrollY > 8), { passive: true });

if ("serviceWorker" in navigator && import.meta.env.PROD) navigator.serviceWorker.register("/sw.js").catch(() => {});
