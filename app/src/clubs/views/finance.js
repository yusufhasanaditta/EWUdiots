/* Finance & budget (#/club/finance?c=…&tab=…), from the "Finance Dashboard" boards: balance, income, expenses,
   income vs expense over time, transactions with receipts, event budgets (planned per category vs what was spent on
   that event), sponsorship income and a CSV report. Record-keeping only: no money moves through the app.
   finance.view reads, finance.edit writes (Treasurer and above by default). */

const CATS = { income: ["Sponsorship", "Registration", "Merchandise", "Membership fee", "Donation", "Other"], expense: ["Venue", "Food & Refreshments", "Promotion & Design", "Equipment", "Printing", "Transport", "Prizes", "Refund", "Other"] };
const ICON = { Sponsorship: "handshake", Registration: "users", Merchandise: "bag", "Membership fee": "user", Donation: "heart", Venue: "building", "Food & Refreshments": "coffee", "Promotion & Design": "image", Equipment: "zap", Printing: "file", Transport: "truck", Prizes: "trophy", Refund: "refund", Other: "wallet" };

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store, ctx, charts } = kit;

  pages["club/finance"] = () => {
    const c = kit.param("c") || kit.clubsWith("finance.view")[0]?.club_id || "", t = kit.param("tab") || "overview";
    const g = kit.memberGate(c, "the finance book"); if (g) return g;
    if (!kit.can(c, "finance.view") && !kit.can(c, "finance.edit")) return ui.emptyBox("lock", "For the treasurer and committee", "Ask your club admin for finance access.");
    const fe = store.use(`club:fin:${c}`, () => api.finance(c), { ttl: 30e3 }), rows = fe.value || [];
    const can = kit.can(c, "finance.edit");
    const sum = (k, f = () => true) => rows.filter((r) => r.kind === k && f(r)).reduce((s, r) => s + Number(r.amount), 0);
    const inc = sum("income"), exp = sum("expense");
    const old = (r) => new Date(r.on_date) < Date.now() - 30 * 864e5;
    return `${kit.back(`#/club/space?c=${c}`, kit.membership(c)?.short_name || "Club")}
      ${ui.ph("Finance & Budget", "Manage club finances, event budgets, expenses and sponsorships with transparency.", can ? `<button class="btn primary" id="fn-add">${icon("plus")} Add Record</button>` : "")}
      <div class="cl-stats">${ui.stat("wallet", "green", ui.money(inc - exp), "Total balance")}${ui.stat("up", "blue", ui.money(inc), "Total income", { d: charts.delta(inc, sum("income", old)) })}
        ${ui.stat("download", "red", ui.money(exp), "Total expenses", { d: charts.delta(exp, sum("expense", old)) })}${ui.stat("chart", "purple", ui.money(Math.max(0, inc - exp)), "Available")}</div>
      ${ui.seg([["overview", "Overview"], ["transactions", "Transactions"], ["budgets", "Budgets"], ["sponsorships", "Sponsorships"], ["reports", "Reports"]], t, (v) => `#/club/finance?c=${c}&tab=${v}`)}
      ${fe.loading && !fe.value ? ui.skeleton(4, 70) : t === "transactions" ? txList(rows, can) : t === "budgets" ? budgets(c, rows, can) : t === "sponsorships" ? txList(rows.filter((r) => r.category === "Sponsorship"), can, "No sponsorship income yet. Confirmed sponsorships marked as received appear here.")
        : t === "reports" ? reports(rows) : overview(c, rows, can)}`;
  };
  function overview(c, rows, can) {
    const months = [...Array(6)].map((_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 5 + i); return d.toISOString().slice(0, 7); });
    const by = (k) => months.map((m) => rows.filter((r) => r.kind === k && r.on_date.startsWith(m)).reduce((s, r) => s + Number(r.amount), 0));
    return `<section class="card cl-chart"><h3>Financial Overview <span class="xs">Last 6 months</span></h3>${charts.line({ title: "Income and expenses per month", labels: months.map(charts.monthLabel), series: [{ name: "Income", values: by("income"), area: true }, { name: "Expense", values: by("expense") }], fmt: (n) => charts.compact(n) })}</section>
      ${ui.sec("Recent Transactions", `<a href="#/club/finance?c=${c}&tab=transactions">See all</a>`)}${txList(rows.slice(0, 6), can)}`;
  }
  function txList(rows, can, empty = "No records yet.") {
    return rows.length ? `<div class="cl-list">${rows.map((r) => `<div class="cl-li"><span class="itile ${r.kind === "income" ? "green" : "red"}">${icon(ICON[r.category] || "wallet")}</span>
      <span class="body"><b>${esc(r.note || r.category)}</b><span>${ui.dateLong(r.on_date)}</span></span>
      <span class="end"><b style="color:${r.kind === "income" ? "var(--success-t)" : "var(--error-t)"}">${r.kind === "income" ? "+" : "−"} ${ui.money(r.amount)}</b>${ui.st([r.category, r.kind === "income" ? "green" : "red"])}</span>
      ${r.receipt_path ? `<button class="icon-btn" data-rc="${r.id}" aria-label="Receipt">${icon("receipt")}</button>` : ""}${can ? `<button class="icon-btn" data-del="${r.id}" aria-label="Delete">${icon("trash")}</button>` : ""}</div>`).join("")}</div>` : `<p class="small muted">${empty}</p>`;
  }
  function budgets(c, rows, can) {
    const be = store.use(`club:budgets:${c}`, () => api.budgets(c), { ttl: 60e3 });
    return `${can ? `<button class="btn outline" id="fn-budget">${icon("plus")} New event budget</button>` : ""}` + ui.view(be, (list) => (list.length ? list.map((b) => {
      const spent = rows.filter((r) => r.kind === "expense" && r.event_id && r.event_id === b.event_id), income = rows.filter((r) => r.kind === "income" && r.event_id && r.event_id === b.event_id);
      const planned = b.lines.reduce((s, l) => s + Number(l.planned || 0), 0), used = spent.reduce((s, r) => s + Number(r.amount), 0), got = income.reduce((s, r) => s + Number(r.amount), 0);
      return `<section class="card mt"><div class="row nowrap" style="gap:12px"><span class="cl-ccard" style="padding:0;border:0;box-shadow:none;grid-template-columns:96px"><span class="art" style="height:72px">${ui.art(b.events?.image, b.title)}</span></span>
          <div class="min0 grow"><b style="font-size:16px">${esc(b.title)}</b><p class="xs">${b.events ? `${ui.dateLong(b.events.starts_at)}${b.events.venue ? ` · ${esc(b.events.venue)}` : ""}` : "No event linked"}</p></div>${can ? `<button class="btn sm outline" data-eb="${b.id}">${icon("edit", "sm")} Edit Budget</button>` : ""}</div>
        <div class="row mt" style="gap:16px;align-items:center;flex-wrap:wrap">${charts.ring({ value: planned ? used / planned : 0, label: `${planned ? Math.round((used / planned) * 100) : 0}%`, sub: `${ui.money(used)} of ${ui.money(planned)}` })}
          <div class="cl-sum grow" style="min-width:200px"><div><span>Total budget</span><b>${ui.money(planned)}</b></div><div><span>Total expense</span><b>${ui.money(used)}</b></div><div><span>Total income</span><b>${ui.money(got)}</b></div><div class="total"><span>Net cost</span><b>${ui.money(used - got)}</b></div></div></div>
        <h3 class="cl-sec" style="font-size:15px">Budget Breakdown</h3>${charts.hbars({ title: `Budget breakdown for ${b.title}`, items: b.lines.map((l, i) => { const u = spent.filter((r) => r.category === l.category).reduce((s, r) => s + Number(r.amount), 0); return { label: l.category, value: u, max: Number(l.planned) || 1, text: `${ui.money(u)} / ${ui.money(l.planned)}`, slot: i % 5 }; }) })}
        ${can && b.event_id ? `<button class="btn sm ghost mt-s" data-addexp="${b.event_id}">${icon("plus", "sm")} Add expense for this event</button>` : ""}</section>`;
    }).join("") : ui.emptyBox("wallet", "No event budgets", can ? "Plan an event's spending by category, then tag expenses with the event." : "")));
  }
  function reports(rows) {
    const cats = (k) => Object.entries(rows.filter((r) => r.kind === k).reduce((m, r) => ((m[r.category] = (m[r.category] || 0) + Number(r.amount)), m), {})).map(([label, value]) => ({ label, value }));
    return `<div class="cl-row2"><section class="card cl-chart"><h3>Income by source</h3>${charts.donut({ title: "Income by source", items: cats("income"), fmt: ui.money, center: ui.money(cats("income").reduce((s, x) => s + x.value, 0)) })}</section>
      <section class="card cl-chart"><h3>Expenses by category</h3>${charts.donut({ title: "Expenses by category", items: cats("expense"), fmt: ui.money, center: ui.money(cats("expense").reduce((s, x) => s + x.value, 0)) })}</section></div>
      <button class="btn outline mt" id="fn-csv">${icon("download")} Download the finance book (CSV)</button>`;
  }
  pages["club/finance"].mount = (el) => {
    kit.bindRetry(el);
    const c = kit.param("c") || kit.clubsWith("finance.view")[0]?.club_id, rows = store.peek(`club:fin:${c}`) || [];
    const reload = () => store.invalidate(`club:fin:${c}`, `club:budgets:${c}`);
    kit.$("#fn-add", el)?.addEventListener("click", () => addRecord(c, null, reload));
    kit.$$("[data-addexp]", el).forEach((b) => b.addEventListener("click", () => addRecord(c, b.dataset.addexp, reload)));
    kit.$$("[data-del]", el).forEach((b) => b.addEventListener("click", () => ui.confirm("Delete this record?", "It's removed from the finance book (the audit log keeps who did it).", "Delete", async () => { await api.deleteFinance(b.dataset.del); reload(); }, true)));
    kit.$$("[data-rc]", el).forEach((b) => b.addEventListener("click", async () => { const r = rows.find((x) => x.id === b.dataset.rc); try { window.open(await api.signedUrl(r.receipt_path), "_blank", "noopener"); } catch (e) { kit.toast(e.message, "error"); } }));
    kit.$("#fn-budget", el)?.addEventListener("click", () => editBudget(c, {}, reload));
    kit.$$("[data-eb]", el).forEach((b) => b.addEventListener("click", () => editBudget(c, (store.peek(`club:budgets:${c}`) || []).find((x) => x.id === b.dataset.eb), reload)));
    kit.$("#fn-csv", el)?.addEventListener("click", () => {
      const cell = (v) => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      ui.download("finance-book.csv", "﻿" + [["Date", "Type", "Category", "Amount", "Note"], ...rows.map((r) => [r.on_date, r.kind, r.category, r.amount, r.note])].map((l) => l.map(cell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
    });
  };
  function addRecord(c, eventId, reload) {
    const evs = store.use(`club:events:${c}`, () => api.clubEvents(c), { ttl: 60e3 }).value || [];
    ui.sheet("Add a record", `<form id="fr" class="stack"><nav class="cl-seg sm" role="radiogroup"><label class="cl-opt"><input type="radio" name="kind" value="expense" checked> Expense</label><label class="cl-opt"><input type="radio" name="kind" value="income"> Income</label></nav>
      ${ui.field("Amount (৳)", '<input class="input" type="number" name="amount" min="1" step="1" required inputmode="numeric">')}
      ${ui.field("Category", `<select class="select" name="category" id="fr-cat">${CATS.expense.map((x) => `<option>${x}</option>`).join("")}</select>`)}
      ${ui.field("What for", ui.input("note", "", 'maxlength="300" placeholder="Hall booking (Tech Talk)"'))}
      <div class="row" style="gap:8px">${ui.field("Date", `<input class="input" type="date" name="on_date" value="${new Date().toISOString().slice(0, 10)}">`)}${ui.field("Event", ui.select("event", [["", "No event"], ...evs.map((e) => [e.id, e.title])], eventId || ""))}</div>
      <button type="button" class="btn outline" id="fr-rc">${icon("receipt")} Attach receipt photo</button><span class="xs" id="fr-rcn"></span>
      <div id="cl-err"></div><button class="btn primary block">${icon("check")} Save</button></form>`, (s) => {
      let receipt = null;
      s.querySelectorAll('[name="kind"]').forEach((r) => r.addEventListener("change", () => { kit.$("#fr-cat", s).innerHTML = CATS[r.value].map((x) => `<option>${x}</option>`).join(""); }));
      kit.$("#fr-rc", s).addEventListener("click", async () => { receipt = await ui.pickFile("image/*,application/pdf"); if (receipt) kit.$("#fr-rcn", s).textContent = receipt.name; });
      kit.$("#fr", s).addEventListener("submit", async (e) => {
        e.preventDefault(); const f = ui.values(e.target), btn = e.target.querySelector("button.primary");
        if (!(Number(f.amount) > 0)) return ui.fail(s, "Enter an amount.");
        ctx.busy(btn, true, "Saving…");
        try {
          const receipt_path = receipt ? await api.uploadPrivate(c, "receipts", /^image\//.test(receipt.type) ? await ui.shrink(receipt) : receipt) : "";
          await api.addFinance({ club_id: c, kind: f.kind, amount: Number(f.amount), category: f.category, note: f.note || "", on_date: f.on_date, event_id: f.event || null, receipt_path });
          ctx.closeModal(); reload();
        } catch (err) { ctx.busy(btn, false); ui.fail(s, err.message); }
      });
    });
  }
  function editBudget(c, b, reload) {
    const evs = store.use(`club:events:${c}`, () => api.clubEvents(c), { ttl: 60e3 }).value || [];
    const lines = (b.lines || [{ category: "Venue", planned: 5000 }, { category: "Food & Refreshments", planned: 4000 }, { category: "Promotion & Design", planned: 2000 }, { category: "Equipment", planned: 3000 }]).map((l) => `${l.category} | ${l.planned}`).join("\n");
    ui.sheet(b.id ? "Edit budget" : "New event budget", `<form id="bg" class="stack">${ui.field("Event", ui.select("event", [["", "Choose an event"], ...evs.map((e) => [e.id, e.title])], b.event_id || ""))}
      ${ui.field("Title", ui.input("title", b.title || "", 'maxlength="140" placeholder="Tech Talk 2026 budget"'))}
      ${ui.field("Planned spending (one per line: Category | amount)", ui.area("lines", lines, 'rows="6"'))}
      <div id="cl-err"></div><button class="btn primary block">Save budget</button>${b.id ? `<button type="button" class="btn ghost block" id="bg-del" style="color:var(--error)">Delete budget</button>` : ""}</form>`, (s) => {
      kit.$("#bg", s).addEventListener("submit", async (e) => {
        e.preventDefault(); const f = ui.values(e.target);
        const ls = String(f.lines).split("\n").map((l) => l.split("|")).filter((x) => x.length === 2 && Number(x[1]) >= 0).map(([cat, n]) => ({ category: cat.trim().slice(0, 40), planned: Number(n) })).slice(0, 30);
        const ev = evs.find((x) => x.id === f.event);
        if (!ls.length) return ui.fail(s, "Add at least one line like “Venue | 5000”.");
        try { await api.saveBudget({ ...(b.id ? { id: b.id } : { club_id: c }), event_id: f.event || null, title: (f.title || ev?.title || "Event budget").slice(0, 140), lines: ls }); ctx.closeModal(); reload(); } catch (err) { ui.fail(s, err.message); }
      });
      kit.$("#bg-del", s)?.addEventListener("click", async () => { try { await api.deleteBudget(b.id); ctx.closeModal(); reload(); } catch (err) { kit.toast(err.message, "error"); } });
    });
  }
}
