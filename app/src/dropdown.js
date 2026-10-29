/* App-styled dropdowns. Every <select class="select"> gets a button that opens a list in the app's own style: a
   pop-over under the button on wide screens, a bottom sheet on phones, with search when there are many options, a tick
   on the chosen one and full keyboard support (arrows, Home/End, type to jump, Enter, Escape). The real <select>
   stays in the page (visually hidden) and gets the value and a bubbling "change", so every form and handler works
   unchanged. Opt out with data-native. */
const CHEV = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const TICK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
let seq = 0, open = null;

function label(sel) { const o = sel.options[sel.selectedIndex]; return o ? o.textContent.trim() : ""; }

function enhance(sel) {
  if (sel.dataset.dd || sel.hasAttribute("data-native") || sel.multiple || sel.size > 1) return;
  sel.dataset.dd = "1";
  const id = `dd${++seq}`, btn = document.createElement("button");
  btn.type = "button"; btn.className = `dd-btn ${sel.className.replace(/\bselect\b/, "").trim()}`; btn.id = id;
  btn.setAttribute("aria-haspopup", "listbox"); btn.setAttribute("aria-expanded", "false");
  const lab = sel.closest("label");
  if (sel.getAttribute("aria-label")) btn.setAttribute("aria-label", sel.getAttribute("aria-label"));
  else if (lab) btn.setAttribute("aria-label", (lab.childNodes[0]?.textContent || "").trim() || "Choose");
  const paint = () => { btn.innerHTML = `<span class="dd-val">${esc(label(sel)) || "&nbsp;"}</span>${CHEV}`; btn.disabled = sel.disabled; };
  paint();
  sel.classList.add("dd-native"); sel.tabIndex = -1; sel.setAttribute("aria-hidden", "true");
  sel.after(btn);
  sel.addEventListener("change", paint);
  sel.addEventListener("focus", () => btn.focus()); // a tap on the field's label lands on the button
  btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); if (open?.sel === sel) close(); else show(sel, btn); });
  btn.addEventListener("keydown", (e) => { if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); show(sel, btn); } });
}

function show(sel, btn) {
  close();
  const opts = [...sel.options].map((o, i) => ({ i, text: o.textContent.trim(), disabled: o.disabled, group: o.parentElement.tagName === "OPTGROUP" ? o.parentElement.label : "" }));
  const sheet = innerWidth < 640, many = opts.length > 8;
  const pop = document.createElement("div");
  pop.className = `dd-pop${sheet ? " sheet" : ""}`; pop.setAttribute("role", "dialog");
  pop.innerHTML = `${sheet ? '<div class="dd-grab" aria-hidden="true"></div>' : ""}${sheet && btn.getAttribute("aria-label") ? `<div class="dd-title">${esc(btn.getAttribute("aria-label"))}</div>` : ""}
    ${many ? '<div class="dd-search"><input type="search" placeholder="Search…" aria-label="Search options" autocomplete="off"></div>' : ""}
    <ul class="dd-list" role="listbox" aria-labelledby="${btn.id}"></ul>`;
  const list = pop.querySelector(".dd-list"), q = pop.querySelector("input");
  let active = sel.selectedIndex, shown = opts;
  const draw = () => {
    let g = "";
    list.innerHTML = shown.length ? shown.map((o) => { const h = o.group && o.group !== g ? `<li class="dd-group" role="presentation">${esc((g = o.group))}</li>` : ""; return `${h}<li role="option" id="${btn.id}-${o.i}" data-i="${o.i}" class="dd-opt${o.i === active ? " active" : ""}" aria-selected="${o.i === sel.selectedIndex}"${o.disabled ? ' aria-disabled="true"' : ""}><span>${esc(o.text)}</span>${o.i === sel.selectedIndex ? TICK : ""}</li>`; }).join("")
      : '<li class="dd-empty" role="presentation">No matches</li>';
    list.setAttribute("aria-activedescendant", `${btn.id}-${active}`);
  };
  const scrollTo = () => list.querySelector(".active")?.scrollIntoView({ block: "nearest" });
  const pick = (i) => {
    if (opts[i]?.disabled) return;
    if (sel.selectedIndex !== i) { sel.selectedIndex = i; sel.dispatchEvent(new Event("input", { bubbles: true })); sel.dispatchEvent(new Event("change", { bubbles: true })); }
    close(); btn.focus();
  };
  draw();
  const back = sheet ? Object.assign(document.createElement("div"), { className: "dd-back" }) : null;
  if (back) { document.body.appendChild(back); back.addEventListener("click", close); }
  document.body.appendChild(pop);
  if (!sheet) {
    const r = btn.getBoundingClientRect(), below = innerHeight - r.bottom, h = Math.min(320, pop.offsetHeight);
    pop.style.minWidth = `${Math.max(r.width, 180)}px`; pop.style.left = `${Math.min(r.left, innerWidth - Math.max(r.width, 180) - 8)}px`;
    pop.style.top = below < h + 12 && r.top > h + 12 ? `${r.top - h - 6}px` : `${r.bottom + 6}px`;
  }
  requestAnimationFrame(() => pop.classList.add("in"));
  list.addEventListener("click", (e) => { const li = e.target.closest("[data-i]"); if (li) pick(Number(li.dataset.i)); });
  list.addEventListener("pointermove", (e) => { const li = e.target.closest("[data-i]"); if (li && Number(li.dataset.i) !== active) { active = Number(li.dataset.i); list.querySelectorAll(".dd-opt").forEach((x) => x.classList.toggle("active", Number(x.dataset.i) === active)); } });
  q?.addEventListener("input", () => { const t = q.value.trim().toLowerCase(); shown = opts.filter((o) => o.text.toLowerCase().includes(t)); active = shown[0]?.i ?? -1; draw(); });
  let typed = "", typedAt = 0;
  const key = (e) => {
    const idx = shown.findIndex((o) => o.i === active), move = (k) => { const n = shown[Math.max(0, Math.min(shown.length - 1, k))]; if (n) { active = n.i; draw(); scrollTo(); } };
    if (e.key === "Escape") { e.preventDefault(); close(); btn.focus(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); move(idx + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(idx - 1); }
    else if (e.key === "Home") { e.preventDefault(); move(0); }
    else if (e.key === "End") { e.preventDefault(); move(shown.length - 1); }
    else if (e.key === "Enter") { e.preventDefault(); if (active >= 0) pick(active); }
    else if (e.key === "Tab") close();
    else if (!q && e.key.length === 1) { typed = Date.now() - typedAt > 700 ? e.key.toLowerCase() : typed + e.key.toLowerCase(); typedAt = Date.now(); const m = shown.find((o) => o.text.toLowerCase().startsWith(typed)); if (m) { active = m.i; draw(); scrollTo(); } }
  };
  pop.addEventListener("keydown", key);
  const outside = (e) => { if (!pop.contains(e.target) && e.target !== btn) close(); };
  setTimeout(() => document.addEventListener("pointerdown", outside), 0);
  const onScroll = (e) => { if (!sheet && !pop.contains(e.target)) close(); };
  addEventListener("scroll", onScroll, true); addEventListener("resize", close);
  btn.setAttribute("aria-expanded", "true");
  open = { sel, btn, pop, back, cleanup: () => { document.removeEventListener("pointerdown", outside); removeEventListener("scroll", onScroll, true); removeEventListener("resize", close); } };
  (q || list).focus({ preventScroll: true }); list.tabIndex = -1; if (!q) list.focus(); scrollTo();
}

export function close() {
  if (!open) return;
  const { btn, pop, back, cleanup } = open;
  open = null; cleanup(); btn.setAttribute("aria-expanded", "false");
  pop.classList.remove("in"); back?.classList.add("out");
  setTimeout(() => { pop.remove(); back?.remove(); }, 160);
}

/* Enhance every select now and whenever new ones appear (pages, modals). */
export function start(root = document.body) {
  const run = () => root.querySelectorAll("select.select:not([data-dd])").forEach(enhance);
  let queued = false;
  new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; run(); }); }).observe(root, { childList: true, subtree: true });
  run();
}
