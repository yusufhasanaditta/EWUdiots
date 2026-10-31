/* Event tickets (migration 0024):
   #/club/tickets          my tickets (upcoming / past), each a pass card
   #/club/pass?id=…        one ticket: QR to show at the door, code, payment state, pay again, cancel, calendar
   #/club/scan             events I can check tickets for (door team, named ticket checkers, or every member)
   buyTicket(kit, event)   the "Get ticket" sheet on the event page: ticket type → payment (bKash/Nagad/Rocket TrxID
                           or cash at the door) → done. Free tickets are valid at once. */
import { toICS } from "../ics.js";
import { METHODS, ticketQR, ticketState, showsQR, priceLabel, tierLeft } from "../tickets.js";

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store, ctx } = kit;
  const mineE = () => store.use("club:mytickets", api.myTickets, { ttl: 30e3 });
  let ttab = "upcoming";

  const passCard = (t) => {
    const [label, tone] = ticketState(t);
    return `<a class="cl-pass" href="#/club/pass?id=${t.id}">
      <span class="art">${ui.art(t.image, t.title)}${ui.dchip(t.starts_at)}</span>
      <span class="body"><b>${esc(t.title)}</b><span class="xs">${esc(t.club_name)}</span>
        <span class="meta">${icon("clock", "sm")} ${ui.time(t.starts_at)}${t.venue ? ` · ${icon("pin", "sm")} ${esc(t.venue)}` : ""}</span>
        <span class="row nowrap" style="gap:6px">${ui.st([label, tone])}<span class="xs">${esc(t.tier_name)} · ${priceLabel(t.price)}</span></span></span>
      <span class="stub">${icon("qr")}<span>${esc(t.code)}</span></span></a>`;
  };

  /* ═════════ My tickets ═════════ */
  pages["club/tickets"] = () => {
    const g = kit.gate("your tickets"); if (g) return g;
    return ui.ph("My Tickets", "Show the QR code at the door", `<a class="btn outline" href="#/club/events">${icon("calendar")} Find events</a>`) + ui.view(mineE(), (rows) => {
      const now = Date.now(), live = (t) => t.status !== "cancelled" && new Date(t.ends_at || t.starts_at).getTime() > now - 6 * 36e5;
      const up = rows.filter(live), past = rows.filter((t) => !live(t));
      const list = ttab === "past" ? past : up;
      return `${ui.seg([["upcoming", "Upcoming", up.length], ["past", "Past & cancelled", past.length]], ttab, (v) => `#/club/tickets?tab=${v}`)}
        ${list.length ? `<div class="cl-passes">${list.map(passCard).join("")}</div>`
          : ui.emptyBox("ticket", ttab === "past" ? "No past tickets" : "No tickets yet", "Register for a club event and your ticket shows up here.", `<a class="btn primary" href="#/club/events">${icon("calendar")} Browse events</a>`)}`;
    }, { n: 3, h: 110 });
  };
  pages["club/tickets"].mount = (el) => { kit.bindRetry(el); const t = kit.param("tab"); if (t && t !== ttab) { ttab = t; ctx.rerender(); } };

  /* ═════════ One ticket ═════════ */
  pages["club/pass"] = () => {
    const g = kit.gate("this ticket"); if (g) return g;
    const id = kit.param("id");
    return kit.back("#/club/tickets", "My Tickets") + ui.view(mineE(), (rows) => {
      const t = rows.find((x) => x.id === id);
      if (!t) return ui.emptyBox("ticket", "Ticket not found", "It may belong to another account.");
      const [label, tone] = ticketState(t), qr = showsQR(t);
      const nums = Object.entries(t.numbers || {});
      return `<section class="cl-ticketx">
          <div class="top"><span class="art">${ui.art(t.image, t.title)}</span><div><span class="xs">${esc(t.club_name)}</span><h1>${esc(t.title)}</h1>${ui.st([label, tone], tone === "green" ? "checkc" : "")}</div></div>
          <div class="facts"><div><span class="xs">Date</span><b>${ui.dateLong(t.starts_at)}</b></div><div><span class="xs">Time</span><b>${ui.time(t.starts_at)}${t.ends_at ? ` – ${ui.time(t.ends_at)}` : ""}</b></div>
            <div><span class="xs">Venue</span><b>${esc(t.venue || "To be announced")}</b></div><div><span class="xs">Ticket</span><b>${esc(t.tier_name)} · ${priceLabel(t.price)}</b></div></div>
          <div class="tear" aria-hidden="true"></div>
          ${qr ? `<div class="qrbox"><div class="cl-qr">${ui.qrSvg(ticketQR(t.token))}</div><p class="code">${esc(t.code)}</p><p class="xs">${esc(t.holder_name)}${t.holder_sid ? ` · ${esc(t.holder_sid)}` : ""}</p>
              <p class="xs muted">Turn your screen brightness up. Don't share this code: it works once.</p></div>`
            : t.status === "used" ? `<div class="qrbox done">${icon("checkc")}<b>Checked in</b><p class="xs">${ui.dateTime(t.checked_in_at)}</p></div>`
            : `<div class="qrbox off">${icon(t.status === "cancelled" ? "x" : "clock")}<b>${esc(label)}</b><p class="xs">${t.status === "waitlisted" ? "You'll get a notification if a seat opens." : t.payment === "submitted" ? `We sent your ${esc(METHODS[t.pay_method] || "")} transaction ${esc(t.pay_ref)} to the club. Your QR appears once they confirm it.` : t.payment === "rejected" ? esc(t.pay_note || "The club couldn't find your payment. Check the transaction ID and send it again.") : ""}</p></div>`}
        </section>
        ${(t.status === "active" && t.payment === "unpaid" && t.pay_method && t.pay_method !== "cash") || (t.status === "active" && t.payment === "rejected") ? payForm(t, nums) : ""}
        ${t.status === "active" && t.payment === "unpaid" && (t.pay_method === "cash" || !t.pay_method) ? `<div class="alert amber mt"><span class="a-ic">${icon("wallet")}</span><div><b>Pay ${priceLabel(t.price)} at the door</b><p>Show this QR. The ticket checker takes the cash and lets you in.</p></div></div>` : ""}
        <div class="row mt" style="gap:8px;flex-wrap:wrap"><a class="btn outline" href="#/club/event?id=${t.event_id}">${icon("info")} Event details</a><button class="btn outline" id="tp-ics">${icon("calendar")} Add to Calendar</button>
          ${t.status === "active" && new Date(t.starts_at) > Date.now() ? `<button class="btn ghost danger" id="tp-cancel">${icon("x")} Cancel ticket</button>` : ""}</div>`;
    }, { n: 2, h: 220 });
  };
  const payForm = (t, nums) => `<section class="card mt"><h2>Pay for your ticket</h2><p class="small muted">Send ${priceLabel(t.price)} to the club${nums.length ? "" : " (ask the organisers for the number)"}, then type the transaction ID.</p>
    ${nums.length ? `<div class="cl-paynums mt-s">${nums.map(([k, v]) => `<div><span class="xs">${esc(METHODS[k] || k)}</span><b>${esc(v)}</b><button type="button" class="btn sm ghost" data-copy="${esc(v)}" aria-label="Copy ${esc(METHODS[k] || k)} number">${icon("copy", "sm")}</button></div>`).join("")}</div>` : ""}
    <form id="tp-pay" class="stack mt-s">${ui.field("Paid with", ui.select("method", Object.entries(METHODS).filter(([k]) => k !== "cash")))}${ui.field("Transaction ID", ui.input("ref", "", 'required maxlength="20" autocomplete="off" placeholder="e.g. 9JK2LM4XQ1" style="text-transform:uppercase"'))}<div id="cl-err"></div><button class="btn primary block">Send for checking</button></form></section>`;
  pages["club/pass"].mount = (el) => {
    kit.bindRetry(el);
    const t = (store.peek("club:mytickets") || []).find((x) => x.id === kit.param("id")); if (!t) return;
    kit.$("#tp-ics", el)?.addEventListener("click", () => ui.download(`${t.title.replace(/[^\w]+/g, "-").slice(0, 40)}.ics`, toICS({ ...t, description: `Ticket ${t.code}`, url: `${location.origin}${location.pathname}#/club/pass?id=${t.id}` }), "text/calendar"));
    kit.$$("[data-copy]", el).forEach((b) => b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(b.dataset.copy); kit.toast("Number copied", "success"); } catch { /* no clipboard */ } }));
    kit.$("#tp-pay", el)?.addEventListener("submit", async (ev) => {
      ev.preventDefault(); const f = new FormData(ev.target);
      try { await api.payTicket(t.id, String(f.get("method")), String(f.get("ref") || "")); store.invalidate("club:mytickets"); kit.toast("Sent. The club will check it.", "success"); } catch (err) { ui.fail(el, err.message); }
    });
    kit.$("#tp-cancel", el)?.addEventListener("click", () => ui.confirm("Cancel this ticket?", t.payment === "verified" ? "Your seat goes to someone else. Ask the club about a refund." : "Your seat goes to someone else.", "Cancel ticket", async () => {
      try { await api.cancelTicket(t.id); store.invalidate("club:mytickets", `club:myticket:${t.event_id}`, `club:tavail:${t.event_id}`); kit.toast("Ticket cancelled", "success"); } catch (err) { kit.toast(err.message, "error"); }
    }, true));
  };

  /* ═════════ Events I can scan for ═════════ */
  pages["club/scan"] = () => {
    const g = kit.gate("the ticket scanner"); if (g) return g;
    const id = kit.param("id"); if (id) { setTimeout(() => kit.go(`#/club/checkin?id=${id}`)); return ui.skeleton(1); }
    return ui.ph("Scan Tickets", "Events where you check tickets at the door") + ui.view(store.use("club:scanevents", api.myScanEvents, { ttl: 60e3 }), (rows) => rows.length
      ? `<div class="cl-list">${rows.map((e) => `<a class="cl-li" href="#/club/checkin?id=${e.id}"><span class="cl-thumb">${ui.art(e.image, e.title)}</span><span class="body"><b>${esc(e.title)}</b><span>${esc(e.club_name)} · ${ui.dateTime(e.starts_at)}${e.venue ? ` · ${esc(e.venue)}` : ""}</span></span>${e.checker ? ui.st(["Ticket checker", "purple"]) : ""}${icon("chevR", "sm")}</a>`).join("")}</div>`
      : ui.emptyBox("qr", "No events to scan", "When an organiser makes you a ticket checker, the event shows up here."), { n: 3, h: 72 });
  };
  pages["club/scan"].mount = (el) => kit.bindRetry(el);
}

/** The "Get ticket" sheet. Resolves after a ticket is issued. @param {any} kit @param {any} e the event */
export function buyTicket(kit, e) {
  const { ui, icon, esc, api, store, ctx } = kit;
  const tiers = e.ticketing?.tiers || [], methods = (e.ticketing?.methods || []).filter((m) => m in METHODS);
  const avail = store.peek(`club:tavail:${e.id}`)?.tiers || {};
  let tier = tiers.find((x) => tierLeft(x, avail[x.id]) !== 0)?.id || tiers[0]?.id;
  if (!kit.me()) return kit.go(`#/login?from=profile`);
  ui.sheet("Get your ticket", `<form id="bt" class="stack">
      <div class="cl-tiers" role="radiogroup" aria-label="Ticket type">${tiers.map((x) => { const left = tierLeft(x, avail[x.id]); return `<label class="cl-tier ${left === 0 ? "off" : ""}"><input type="radio" name="tier" value="${esc(x.id)}" ${x.id === tier ? "checked" : ""} ${left === 0 ? "disabled" : ""}>
        <span class="grow"><b>${esc(x.name)}</b>${x.note ? `<span class="xs">${esc(x.note)}</span>` : ""}<span class="xs">${left === 0 ? "Sold out" : left != null ? `${left} left` : ""}</span></span><b class="price">${priceLabel(x.price)}</b></label>`; }).join("")}</div>
      <div id="bt-pay"></div><div id="cl-err"></div>
      <p class="xs muted">${icon("shield", "sm")} Your ticket has a QR code that works once. EWUdiots never takes payments: you pay the club directly.</p>
      <button class="btn primary block lg" id="bt-go">Get ticket</button></form>`, async (s) => {
    const nums = await store.fetch(`club:paynums:${e.id}`, () => api.payNumbers(e.id)).catch(() => ({}));
    const draw = () => {
      const x = tiers.find((t) => t.id === tier), paid = Number(x?.price) > 0;
      kit.$("#bt-go", s).textContent = paid ? `Get ticket · ${priceLabel(x.price)}` : "Get free ticket";
      kit.$("#bt-pay", s).innerHTML = !paid ? "" : `<p class="cl-side-h">Payment</p><div class="cl-opts wrap" role="radiogroup" aria-label="Payment method">${methods.map((m, i) => `<label class="cl-opt"><input type="radio" name="method" value="${m}" ${i === 0 ? "checked" : ""}> ${METHODS[m]}</label>`).join("")}</div>
        <div id="bt-how"></div>`;
      const how = () => {
        const m = s.querySelector('input[name="method"]:checked')?.value, box = kit.$("#bt-how", s); if (!box) return;
        box.innerHTML = m === "cash" ? `<div class="alert amber mt-s"><span class="a-ic">${icon("wallet")}</span><div><b>Pay ${priceLabel(x.price)} at the door</b><p>Your ticket is reserved now. The checker takes the cash when you arrive.</p></div></div>`
          : `<div class="alert blue mt-s"><span class="a-ic">${icon("phone")}</span><div><b>Send ${priceLabel(x.price)} with ${esc(METHODS[m] || "")}${nums?.[m] ? ` to ${esc(nums[m])}` : ""}</b><p>${nums?.[m] ? "Use “Send Money”, then type the transaction ID below." : "Ask the organisers for the club's number."}</p></div></div>
            ${ui.field("Transaction ID", ui.input("ref", "", 'required maxlength="20" autocomplete="off" placeholder="e.g. 9JK2LM4XQ1" style="text-transform:uppercase"'))}`;
      };
      ctx.$$('input[name="method"]', s).forEach((r) => r.addEventListener("change", how)); how();
    };
    ctx.$$('input[name="tier"]', s).forEach((r) => r.addEventListener("change", () => { tier = r.value; draw(); }));
    draw();
    kit.$("#bt", s).addEventListener("submit", async (ev) => {
      ev.preventDefault(); const f = new FormData(ev.target), b = kit.$("#bt-go", s); b.disabled = true;
      try {
        const t = await api.getTicket(e.id, tier, String(f.get("method") || ""), String(f.get("ref") || ""));
        store.invalidate("club:mytickets", `club:myticket:${e.id}`, `club:tavail:${e.id}`); ctx.closeModal();
        kit.toast(t.payment === "submitted" ? "Ticket reserved. The club will confirm your payment." : "You've got a ticket!", "success"); kit.go(`#/club/pass?id=${t.id}`);
      } catch (err) { b.disabled = false; ui.fail(s, err.message); }
    });
  });
}
