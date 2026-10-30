/* Fill in a club form (#/club/form?id=…): membership recruitment, event registration, competitions, volunteers,
   surveys. Name, student ID and email come from the account; the server re-checks the deadline, the limit (extra
   people go on the waitlist), required answers and the phone number. After sending: status, interview time and,
   for events, a QR ticket to show at the door. */
import qrcode from "qrcode-generator";
import { validate, openState, STATUSES, FORM_KINDS, normPhone, cleanFields } from "../forms.js";

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store } = kit;
  const id = () => kit.param("id") || "";
  let editing = false;

  pages["club/form"] = () => {
    if (!api) return kit.gate("this form");
    // Questions are stored as JSON a club wrote: render only the cleaned version (safe ids, numeric limits).
    const fe = store.use(`form:${id()}`, () => api.form(id()).then((f) => (f ? { ...f, fields: cleanFields(f.fields) } : f)), { ttl: 60e3 });
    return kit.back("#/club/feed", "Back") + ui.view(fe, (form) => (form ? render(form) : ui.emptyBox("lock", "This form isn't available", "It may be closed, for members only, or removed.")), { n: 2, h: 140 });
  };

  function render(form) {
    const club = form.clubs, st = openState(form), s = form.settings || {};
    const count = s.limit ? store.use(`form:count:${form.id}`, () => api.formCount(form.id), { ttl: 30e3 }).value : null;
    const mine = kit.me() ? store.use(`form:mine:${form.id}`, () => api.myResponse(form.id), { ttl: 30e3 }) : { value: null };
    const head = `<section class="card cl-form-head" style="--cc:${esc(club?.color || "#7C3AED")}">
      <a class="row nowrap" style="gap:10px" href="#/club/c?slug=${encodeURIComponent(club?.slug || "")}">${ui.logo(club, "sm")}<b>${esc(club?.name || "Club")}</b></a>
      <span class="pill mt">${esc(FORM_KINDS[form.kind] || "Form")}</span><h1 class="mt-s">${esc(form.title)}</h1>
      ${form.description ? `<p class="mt-s">${ui.rich(form.description)}</p>` : ""}
      <div class="row mt-s" style="gap:8px">${s.deadline ? ui.pill(`${icon("clock", "sm")} Until ${ui.dateTime(s.deadline)}`, st.open ? "amber" : "red") : ""}
        ${s.limit ? ui.pill(`${icon("users", "sm")} ${count ?? "…"} of ${s.limit} places taken${s.waitlist ? " · waitlist after" : ""}`, "blue") : ""}
        ${s.fee ? ui.pill(`${icon("wallet", "sm")} Fee ৳${Number(s.fee).toLocaleString("en-US")}`, "purple") : ""}${!st.open ? ui.pill(esc(st.why), "red") : ""}</div></section>`;
    if (!kit.me()) return head + ui.emptyBox("user", "Sign in to fill in this form", "Your name, student ID and email are sent from your account, so you don't have to type them.", `<a class="btn primary" href="#/login?from=profile">${icon("user")} Sign in</a>`);
    if (mine.loading && mine.value === undefined) return head + ui.skeleton(1, 200);
    if (mine.value && !editing) return head + submitted(form, mine.value);
    if (!st.open) return head + ui.emptyBox("lock", "This form is closed", esc(st.why));
    return head + fill(form, mine.value);
  }

  function submitted(form, r) {
    const [label, tone] = STATUSES[r.status] || ["Sent", "blue"], s = form.settings || {};
    const qr = r.ticket ? (() => { const q = qrcode(0, "M"); q.addData(`EWUDCLUB:${form.id}:${r.ticket}`); q.make(); return q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); })() : "";
    return `<section class="card mt cl-status"><div class="row nowrap" style="gap:12px"><span class="itile ${tone === "red" ? "red" : tone === "green" ? "green" : "purple"}">${icon(r.status === "accepted" ? "checkc" : r.status === "rejected" ? "x" : "clock")}</span>
        <div class="grow"><b>${r.status === "pending" ? "Sent. The club will review it." : `Status: ${label}`}</b><p class="xs">Sent ${ui.ago(r.created_at)}${r.updated_at !== r.created_at ? ` · updated ${ui.ago(r.updated_at)}` : ""}</p></div>${ui.pill(label, tone)}</div>
        ${s.confirmMsg && r.status !== "rejected" ? `<p class="small mt">${ui.rich(s.confirmMsg)}</p>` : ""}
        ${r.interview_at ? `<div class="alert blue mt"><span class="a-ic">${icon("calendar")}</span><div><b>Interview: ${ui.dateTime(r.interview_at)}</b><p>Bangladesh time. Check the club's message for the place.</p></div></div>` : ""}
        ${r.status === "waitlisted" ? `<p class="small muted mt">All places are taken for now. If someone drops out, you move up and get a message.</p>` : ""}
        ${qr && r.status !== "rejected" ? `<div class="cl-ticket mt"><div class="cl-qr">${qr}</div><div><b>Your ticket</b><p class="cl-ticket-code">${esc(r.ticket)}</p><p class="xs">Show this at the door.${r.checked_in_at ? ` Checked in ${ui.dateTime(r.checked_in_at)}.` : ""}</p></div></div>` : ""}
        <div class="row mt" style="gap:8px">${s.allowEdit && ["pending", "waitlisted"].includes(r.status) ? `<button class="btn sm outline" id="fm-edit">${icon("edit", "sm")} Edit my answers</button>` : ""}
          ${["pending", "waitlisted"].includes(r.status) ? `<button class="btn sm ghost" id="fm-withdraw" data-r="${r.id}">${icon("trash", "sm")} Withdraw</button>` : ""}<a class="btn sm ghost" href="#/club/me">${icon("user", "sm")} All my registrations</a></div></section>`;
  }

  /** One control per field type. Answers keep their field id as the input name. */
  function control(x, v) {
    const req = x.required ? "required" : "", max = x.max ? `maxlength="${x.max}"` : "";
    switch (x.type) {
      case "long": return ui.area(x.id, v, `rows="4" ${req} ${max || 'maxlength="4000"'}`);
      case "choice": return `<div class="cl-options" role="radiogroup">${x.options.map((o) => `<label class="cl-opt"><input type="radio" name="${x.id}" value="${esc(o)}" ${v === o ? "checked" : ""}> <span>${esc(o)}</span></label>`).join("")}</div>`;
      case "multi": return `<div class="cl-options" data-multi="${x.id}">${x.options.map((o) => `<label class="cl-opt"><input type="checkbox" value="${esc(o)}" ${(v || []).includes(o) ? "checked" : ""}> <span>${esc(o)}</span></label>`).join("")}</div>`;
      case "dropdown": return ui.select(x.id, [["", "Choose…"], ...x.options.map((o) => [o, o])], v || "", req);
      case "number": return ui.input(x.id, v, `type="number" inputmode="decimal" ${req}`);
      case "email": return ui.input(x.id, v, `type="email" autocomplete="email" ${req}`);
      case "date": return ui.input(x.id, v, `type="date" ${req}`);
      case "link": return ui.input(x.id, v, `type="url" inputmode="url" placeholder="https://" ${req}`);
      default: return ui.input(x.id, v, `${req} ${max || 'maxlength="300"'}`);
    }
  }

  function fill(form, prev) {
    const s = form.settings || {}, p = kit.ctx.S.profile || {}, a = prev?.answers || {};
    const fields = form.fields.map((x) => (x.type === "note"
      ? `<div class="cl-note">${ui.rich(x.label)}</div>`
      : `<div class="field" data-f="${x.id}"><span>${esc(x.label)}${x.required ? ' <i class="cl-req" aria-label="required">*</i>' : ""}</span>${x.help ? `<span class="hint">${esc(x.help)}</span>` : ""}${control(x, a[x.id])}<span class="err" hidden></span></div>`)).join("");
    return `<form id="fm-form" class="card mt stack" novalidate>
      <div class="cl-from"><span class="avatar sm">${esc(ui.initials(p.name || kit.me()?.email))}</span><div class="min0"><b>${esc(p.name || kit.me()?.user_metadata?.name || "You")}</b><span class="xs ellipsis">${esc(kit.me()?.email || "")}</span></div><span class="xs push">${icon("shield", "sm")} Sent from your account</span></div>
      ${ui.field("Department", ui.input("_dept", prev?.department || p.department || "", 'maxlength="60" placeholder="e.g. CSE"'))}
      ${s.collectPhone ? `<div class="field" data-f="_phone"><span>Mobile number <i class="cl-req">*</i></span>${ui.input("_phone", prev?.phone || "", 'type="tel" inputmode="tel" autocomplete="tel" placeholder="01712345678"')}<span class="hint">Only the club's organisers see it.</span><span class="err" hidden></span></div>` : ""}
      ${fields}
      ${s.fee ? `<div class="alert purple"><span class="a-ic">${icon("wallet")}</span><div><b>Fee: ৳${Number(s.fee).toLocaleString("en-US")}</b><p>${esc(s.feeNote || "Pay the club by bKash or Nagad, then enter the transaction ID.")}</p></div></div>${ui.field("Transaction ID", ui.input("_pay", prev?.payment_ref || "", 'maxlength="40" placeholder="e.g. 9BX7K2LQ1T"'))}` : ""}
      <div id="cl-err"></div><button class="btn primary lg block">${icon("arrow")} ${prev ? "Save changes" : "Send"}</button>
      <p class="xs" style="text-align:center">The club sees your name, student ID, email${s.collectPhone ? ", phone" : ""} and answers.</p></form>`;
  }

  function collect(form, root) {
    const out = {};
    for (const x of form.fields) {
      if (x.type === "note") continue;
      if (x.type === "multi") out[x.id] = kit.$$(`[data-multi="${x.id}"] input:checked`, root).map((c) => c.value);
      else if (x.type === "choice") out[x.id] = kit.$(`input[name="${x.id}"]:checked`, root)?.value || "";
      else out[x.id] = String(root.elements[x.id]?.value ?? "").trim();
    }
    return out;
  }

  pages["club/form"].mount = (el) => {
    kit.bindRetry(el);
    const form = store.peek(`form:${id()}`); if (!form) return;
    kit.$("#fm-edit", el)?.addEventListener("click", () => { editing = true; kit.ctx.rerender(); });
    kit.$("#fm-withdraw", el)?.addEventListener("click", (e) => { const rid = e.currentTarget.dataset.r; kit.ctx.confirmModal("Withdraw your registration?", "Your place goes to someone else.", "Withdraw", async () => {
      await api.withdraw(rid); store.invalidate(`form:mine:${form.id}`, `form:count:${form.id}`, "me:responses"); kit.toast("Withdrawn", "success");
    }, true); });
    const f = kit.$("#fm-form", el); if (!f) return;
    f.addEventListener("input", (e) => { const box = e.target.closest("[data-f]"); if (!box) return; const er = box.querySelector(".err"); if (er) er.hidden = true; box.querySelector("[aria-invalid]")?.removeAttribute("aria-invalid"); });
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      kit.$$(".err", f).forEach((x) => { x.hidden = true; }); kit.$$("[aria-invalid]", f).forEach((x) => x.removeAttribute("aria-invalid"));
      const answers = collect(form, f), phone = f.elements._phone?.value || "", { ok, errors } = validate(form.fields, answers, form.settings, phone);
      if (!ok) {
        for (const [k, msg] of Object.entries(errors)) { const box = kit.$(`[data-f="${k}"]`, f); const er = box?.querySelector(".err"); if (er) { er.hidden = false; er.textContent = msg; } box?.querySelector("input, textarea, select")?.setAttribute("aria-invalid", "true"); }
        kit.$(`[data-f="${Object.keys(errors)[0]}"]`, f)?.scrollIntoView({ behavior: "smooth", block: "center" });
        return ui.fail(f, "Please check the highlighted answers.");
      }
      const btn = f.querySelector("button.primary"); kit.ctx.busy(btn, true, "Sending…");
      try {
        const r = await api.submit(form.id, answers, normPhone(phone), f.elements._pay?.value?.trim() || "", f.elements._dept?.value?.trim() || "");
        editing = false; store.invalidate(`form:mine:${form.id}`, `form:count:${form.id}`, "me:responses");
        kit.toast(r.status === "waitlisted" ? "You're on the waitlist" : "Sent", "success", r.status === "waitlisted" ? "All places are taken; you'll move up if one frees." : "The club will review it.");
      } catch (err) { kit.ctx.busy(btn, false); ui.fail(f, err.message); }
    });
  };
}
