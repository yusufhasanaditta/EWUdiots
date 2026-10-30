/* EWUdiots Club: shared building blocks for the club screens (cards, badges, states, form controls, files).
   Everything that puts text into HTML goes through esc(); links and images are https-only (the database checks too). */
import { CATEGORIES, AUDIENCES, rankTone } from "./perms.js";

const TZ = "Asia/Dhaka";

/** @param {{ icon: Function, esc: (s: unknown) => string, openModal: Function, modalHead: Function, toast: Function }} ctx */
export function createUI(ctx) {
  const { icon, esc } = ctx;

  /* ── Formatting ── */
  const when = (d, o) => new Date(d).toLocaleString("en-GB", { timeZone: TZ, ...o });
  const dateShort = (d) => when(d, { day: "numeric", month: "short" });
  const dateLong = (d) => when(d, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const dateTime = (d) => when(d, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  function ago(d) {
    const s = Math.max(1, Math.round((Date.now() - new Date(d)) / 1000));
    if (s < 60) return "just now";
    const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
    const dd = Math.round(h / 24); return dd < 7 ? `${dd} d ago` : dateShort(d);
  }
  const initials = (name) => String(name || "?").replace(/^(EWU|IEEE)\s+/i, "").split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && !/^(of|and|the|for|club|&)$/i.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "C";
  /** Plain text with line breaks and https links (no HTML from users ever reaches the page). */
  const rich = (text) => esc(text).replace(/(https:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>').replace(/\n/g, "<br>");
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  /* ── Identity ── */
  const logo = (club, size = "md") => club?.logo_url
    ? `<img class="cl-logo ${size}" src="${esc(club.logo_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : `<span class="cl-logo ${size} mono" style="--cc:${esc(club?.color || "#7C3AED")}" aria-hidden="true">${esc(club?.short_name?.replace(/^EWU/, "").slice(0, 4) || initials(club?.name))}</span>`;
  const verified = (club) => (club?.verified ? `<span class="cl-verified" title="Verified by the EWUdiots team">${icon("checkc", "sm")}<span class="sr-only">Verified</span></span>` : "");
  const pill = (text, tone = "") => `<span class="pill ${tone}">${text}</span>`;
  const audiencePill = (v, wing = "") => (v === "public" ? "" : pill(`${icon(v === "exec" ? "lock" : "users", "sm")} ${esc(v === "wing" && wing ? `${wing} wing` : AUDIENCES[v] || v)}`, v === "exec" ? "amber" : "purple"));
  const rolePill = (rank, name) => `<span class="cl-role t-${rankTone(rank)}">${esc(name)}</span>`;
  const person = (name, sub = "", right = "") => `<div class="lrow"><span class="avatar sm">${esc(initials(name))}</span><span class="body"><b>${esc(name || "Member")}</b>${sub ? `<span>${sub}</span>` : ""}</span>${right}</div>`;

  /** Directory card for a club. */
  const clubCard = (club, { members = 0, followers = 0, mine = null, following = false } = {}) => `
    <a class="cl-card" href="#/club/c?slug=${encodeURIComponent(club.slug)}" style="--cc:${esc(club.color)}">
      <span class="cl-card-band" aria-hidden="true"></span>
      <div class="row nowrap" style="gap:12px">${logo(club)}<div class="grow min0"><b class="ellipsis cl-name">${esc(club.name)}${verified(club)}</b>
        <span class="xs">${esc(CATEGORIES[club.category] || "Club")}${club.status === "active" ? ` · ${plural(members, "member")}` : ""}</span></div></div>
      ${club.tagline ? `<p class="small muted cl-tag">${esc(club.tagline)}</p>` : ""}
      <div class="row" style="gap:6px;margin-top:auto">
        ${mine ? pill(`${icon("checkc", "sm")} ${esc(mine.role_name)}`, "green") : ""}${following && !mine ? pill(`${icon("bell", "sm")} Following`, "purple") : ""}
        ${club.recruiting && club.status === "active" ? pill(`${icon("userpen", "sm")} Recruiting`, "amber") : ""}
        ${club.status === "unclaimed" ? pill("Not on EWUdiots yet") : ""}${followers ? `<span class="xs push">${plural(followers, "follower")}</span>` : ""}</div></a>`;

  /* ── States ── */
  const skeleton = (n = 3, h = 96) => `<div class="stack">${Array.from({ length: n }, () => `<div class="skel" style="height:${h}px"></div>`).join("")}</div>`;
  const errorBox = (msg, retry = true) => `<div class="alert red" role="alert"><span class="a-ic">${icon("alert")}</span><div class="grow"><b>Couldn't load this</b><p>${esc(msg)}</p></div>${retry ? `<button class="btn sm" data-cl-retry>${icon("reset", "sm")} Retry</button>` : ""}</div>`;
  const emptyBox = (ic, title, text, action = "") => `<div class="card">${ctx.empty(`icon:${ic}`, esc(title), text, action)}</div>`;
  /** Render an entry from store.use(): loading → skeleton, error (with no old value) → message, else render(value). */
  const view = (entry, render, { n = 3, h = 96 } = {}) => (entry.loading && entry.value === undefined ? skeleton(n, h) : entry.error && entry.value === undefined ? errorBox(entry.error) : render(entry.value));

  /* ── Form controls ── */
  const field = (label, control, hint = "") => `<label class="field">${label}${control}${hint ? `<span class="hint">${hint}</span>` : ""}</label>`;
  const input = (name, value = "", attrs = "") => `<input class="input" name="${esc(name)}" value="${esc(value ?? "")}" ${attrs}>`;
  const area = (name, value = "", attrs = "") => `<textarea class="input cl-area" name="${esc(name)}" ${attrs}>${esc(value ?? "")}</textarea>`;
  const select = (name, options, value = "", attrs = "") => `<select class="select" name="${esc(name)}" ${attrs}>${(Array.isArray(options) ? options.map((o) => (Array.isArray(o) ? o : [o, o])) : Object.entries(options)).map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  const toggle = (name, checked, label, sub = "") => `<label class="cl-toggle"><span class="grow"><b>${label}</b>${sub ? `<span class="xs">${sub}</span>` : ""}</span><span class="switch"><input type="checkbox" name="${esc(name)}" ${checked ? "checked" : ""}><span></span></span></label>`;
  /** FormData → plain object; checkboxes become booleans. */
  function values(form) {
    const o = Object.fromEntries(new FormData(form));
    form.querySelectorAll('input[type="checkbox"][name]').forEach((c) => { if (!c.closest("[data-multi]")) o[c.name] = c.checked; });
    return o;
  }
  /** Show a field error under the control with that name (or a box at #cl-err). */
  function fail(root, msg) { const box = root.querySelector("#cl-err"); if (box) box.innerHTML = `<div class="alert red mt-s" role="alert"><span class="a-ic">${icon("alert")}</span><div><b>${esc(msg)}</b></div></div>`; else ctx.toast(msg, "error"); }

  /* ── Files ── */
  const pickFile = (accept = "image/*") => new Promise((res) => {
    const i = document.createElement("input"); i.type = "file"; i.accept = accept;
    i.addEventListener("change", () => res(i.files?.[0] || null), { once: true }); i.click();
  });
  /** Shrink a photo before upload (phones send 4–12 MB pictures). */
  async function shrink(file, max = 1600, quality = 0.85) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    const bmp = await createImageBitmap(file), k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (k === 1 && file.size < 900e3) return file;
    const c = Object.assign(document.createElement("canvas"), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", quality));
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  }
  function download(name, content, type = "text/plain") {
    const a = document.createElement("a"); a.href = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30e3);
  }

  /* ── Sheets ── */
  const sheet = (title, body, onMount, opts) => ctx.openModal(`${ctx.modalHead(title)}${body}`, onMount, opts);

  return { when, dateShort, dateLong, dateTime, ago, initials, rich, plural, logo, verified, pill, audiencePill, rolePill, person, clubCard,
    skeleton, errorBox, emptyBox, view, field, input, area, select, toggle, values, fail, pickFile, shrink, download, sheet };
}
