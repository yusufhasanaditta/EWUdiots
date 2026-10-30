/* Merch administration for a club, from the "Merchandise Dashboard", "Product & Inventory", "Orders Management" and
   "Order Details & Returns" boards (the user's brief: Club Admin / authorised Merch Manager):
   #/club/merch?c=&tab=dashboard|products|returns|coupons|settings · #/club/ordersadmin?c= · #/club/orderadmin?id=
   Permissions: store.manage (products, settings), orders.manage (orders, pickups, returns), payments.verify (TrxIDs),
   refunds.approve (refunds; Treasurer and above). Every action goes through an RPC that checks the same and writes
   the order's history and the club's audit log. Buyer phone/email are only visible here. */
import { ORDER_STATUS, PAYMENT_STATUS, METHODS, RETURN_REASONS, RETURN_STATUS, CATEGORIES, BADGES, nextSteps, progress, stockKeys, totalStock, lineTotal } from "../orders.js";
import { canScan, startScanner } from "../scan.js";

const PAGE = 20;

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store, ctx, charts } = kit;
  const clubE = (c) => store.use(`clubid:${c}`, () => api.clubById(c), { ttl: 60e3 });
  const ordersE = (c) => store.use(`club:orders:${c}`, () => api.clubOrders(c), { ttl: 20e3 });
  const allowed = (c) => kit.can(c, "store.manage") || kit.can(c, "orders.manage");
  const nav = (c, t) => ui.seg([["dashboard", "Dashboard"], ["products", "Products"], ["orders", "Orders"], ["returns", "Returns"], ["coupons", "Coupons"], ["settings", "Settings"]], t, (v) => (v === "orders" ? `#/club/ordersadmin?c=${c}` : `#/club/merch?c=${c}&tab=${v}`));
  const gate = (c) => { const g = kit.memberGate(c, "the merch tools"); if (g) return g; if (!allowed(c)) return ui.emptyBox("lock", "For the club's merch team", "Ask your club admin for the Merch Manager position."); return ""; };

  /* ═════════ Dashboard, products, returns, coupons, settings ═════════ */
  pages["club/merch"] = () => {
    const c = kit.param("c") || kit.clubsWith("store.manage")[0]?.club_id || kit.clubsWith("orders.manage")[0]?.club_id || "", t = kit.param("tab") || "dashboard";
    const g = gate(c); if (g) return g;
    const club = clubE(c).value;
    const off = club && !kit.feature(c, "store", club);
    return `${kit.back(`#/club/space?c=${c}`, kit.membership(c)?.short_name || "Club")}
      ${ui.ph(t === "products" ? "Product & Inventory Management" : "Merchandise Dashboard", t === "products" ? "Add, edit products, manage stock and track performance." : "Manage inventory, track sales and grow your club merchandise.",
        t === "products" && kit.can(c, "store.manage") ? `<button class="btn primary" id="mc-add">${icon("plus")} Add Product</button>` : "")}
      ${off ? `<div class="alert amber"><span class="a-ic">${icon("info")}</span><div class="grow"><b>The store is switched off</b><p>Students can't see your products until the Club Admin turns on “Merch store” in Manage → Features.</p></div>${kit.can(c, "features.edit") ? `<a class="btn sm primary" href="#/club/manage?c=${c}&tab=features">Turn on</a>` : ""}</div>` : ""}
      ${nav(c, t)}
      ${t === "products" ? products(c) : t === "returns" ? returns(c) : t === "coupons" ? coupons(c) : t === "settings" ? settings(c, club) : dashboard(c)}`;
  };
  function dashboard(c) {
    const se = store.use(`club:storestats:${c}`, () => api.storeStats(c), { ttl: 60e3 });
    return ui.view(se, (s) => `<div class="cl-stats">${ui.stat("chart", "purple", ui.money(s.sales), "Total sales", { d: charts.delta(s.sales, s.sales_prev) })}${ui.stat("bag", "blue", s.orders, "Total orders", { d: charts.delta(s.orders, s.orders_prev) })}
        ${ui.stat("package", "green", s.units, "Units sold", { d: charts.delta(s.units, s.units_prev) })}${ui.stat("layers", "amber", s.products, "Active products", { sub: `${s.low_stock.length} low-stock alerts` })}</div>
      ${s.to_verify ? `<a class="alert blue" href="#/club/ordersadmin?c=${c}&pay=submitted" style="text-decoration:none;color:inherit"><span class="a-ic">${icon("shield")}</span><div class="grow"><b>${ui.plural(s.to_verify, "payment")} to verify</b><p>Check each TrxID in the club's payment app, then mark it paid.</p></div>${icon("chevR")}</a>` : ""}
      <section class="card cl-chart mt"><h3>Sales Overview <span class="xs">Last 6 months</span></h3>${charts.bars({ title: "Sales per month (৳)", labels: s.monthly.map((x) => charts.monthLabel(x.m)), series: [{ name: "Sales", values: s.monthly.map((x) => Number(x.sales)) }], fmt: charts.compact })}
        <p class="xs">Orders per month: ${s.monthly.map((x) => `${charts.monthLabel(x.m)} ${x.orders}`).join(" · ")}</p></section>
      <div class="cl-row2 mt"><section class="card"><div class="card-h"><h2>Top Selling Products</h2><a class="small" href="#/club/merch?c=${c}&tab=products">View all</a></div>${s.top.map((p, i) => `<div class="cl-li" style="padding:8px 0"><span class="cl-q-n">${i + 1}</span><span class="img" style="width:44px;height:44px;border-radius:10px;overflow:hidden;background:var(--surface-2);display:grid;place-items:center">${p.image ? `<img src="${esc(p.image)}" alt="" style="width:100%;height:100%;object-fit:cover">` : icon("shirt", "sm")}</span><span class="body"><b>${esc(p.name)}</b><span>${p.sold} sold</span></span><b>${ui.money(p.price)}</b></div>`).join("") || `<p class="small muted">No sales yet.</p>`}</section>
        <section class="card cl-chart"><h3>Sales by Category</h3>${charts.donut({ title: "Units by category", items: Object.entries(s.by_category).map(([k, v]) => ({ label: CATEGORIES[k] || k, value: v })), sub: "Units" })}</section></div>
      <div class="cl-row2 mt"><section class="card"><div class="card-h"><h2>Recent Orders</h2><a class="small" href="#/club/ordersadmin?c=${c}">View all</a></div>${(ordersE(c).value || []).slice(0, 5).map((o) => `<a class="cl-li" style="padding:8px 0" href="#/club/orderadmin?id=${o.id}">${icon("package")}<span class="body"><b>#${esc(o.code)}</b><span>${ui.dateShort(o.created_at)}</span></span>${ui.st(ORDER_STATUS[o.status])}<b>${ui.money(o.total)}</b></a>`).join("") || `<p class="small muted">No orders yet.</p>`}</section>
        <section class="card"><div class="card-h"><h2>Low Stock Alert</h2></div>${s.low_stock.map((x) => `<div class="cl-li" style="padding:8px 0;background:var(--error-s);border-radius:10px;margin-bottom:6px"><span class="body"><b>${esc(x.name)}${x.key ? ` (${esc(x.key.replace("|", " ").trim())})` : ""}</b></span><b style="color:var(--error-t)">${x.n} left</b></div>`).join("") || `<p class="small muted">Stock looks fine.</p>`}</section></div>`, { n: 4, h: 120 });
  }
  function products(c) {
    const pe = store.use(`club:products:${c}`, () => api.products(c), { ttl: 30e3 }), low = clubE(c).value?.store_settings?.low_stock ?? 10;
    return ui.view(pe, (rows) => (rows.length ? `<div class="stack">${rows.map((p) => `<section class="card row nowrap" style="gap:12px;align-items:flex-start"><span class="img" style="width:76px;height:76px;flex:none;border-radius:14px;overflow:hidden;background:var(--surface-2);display:grid;place-items:center">${p.images[0] ? `<img src="${esc(p.images[0])}" alt="" style="width:100%;height:100%;object-fit:cover">` : icon("shirt")}</span>
        <div class="grow min0"><div class="row" style="gap:6px"><b>${esc(p.name)}</b>${ui.st(p.status === "active" ? (p.track_stock && totalStock(p) <= low ? ["Low stock", "amber"] : ["Active", "green"]) : p.status === "draft" ? ["Draft", "gray"] : ["Archived", "gray"])}${p.badge ? ui.st(BADGES[p.badge]) : ""}</div>
          <span class="xs">${esc(CATEGORIES[p.category])} · ${p.sold} sold</span><b style="display:block;color:var(--primary)">${ui.money(p.price)}</b>
          ${p.track_stock ? `<div class="cl-chips-sm mt-s">${Object.entries(p.stock).map(([k, n]) => `<span class="${n <= 3 ? "low" : ""}">${esc(k.replace("|", " ").trim() || "Stock")}: ${n}</span>`).join("")}</div>` : `<span class="xs">${p.preorder ? "Pre-order" : "Stock not tracked"}</span>`}</div>
        ${kit.can(c, "store.manage") ? `<button class="btn sm outline" data-edit="${p.id}">Edit</button>` : ""}</section>`).join("")}</div>`
      : ui.emptyBox("bag", "No products yet", kit.can(c, "store.manage") ? "Add your first product with Add Product." : "")), { n: 4, h: 100 });
  }
  function returns(c) {
    const re = store.use(`club:returns:${c}`, () => api.clubReturns(c), { ttl: 30e3 });
    return ui.view(re, (rows) => (rows.length ? `<div class="cl-list">${rows.map((r) => `<a class="cl-li" href="#/club/orderadmin?id=${r.order_id}&tab=returns"><span class="itile sm amber">${icon("refund")}</span><span class="body"><b>#${esc(r.code)} · #${esc(r.club_orders?.code || "")}</b><span>${esc(r.club_orders?.buyer_name || "")} · ${esc(RETURN_REASONS[r.reason])} · ${ui.dateShort(r.created_at)}</span></span>${ui.st(RETURN_STATUS[r.status])}</a>`).join("")}</div>`
      : ui.emptyBox("refund", "No returns", "Return requests from buyers appear here.")));
  }
  function coupons(c) {
    const ce = store.use(`club:coupons:${c}`, () => api.coupons(c), { ttl: 30e3 });
    return `${kit.can(c, "store.manage") ? `<button class="btn outline" id="mc-coupon">${icon("plus")} New coupon</button>` : ""}` + ui.view(ce, (rows) => (rows.length ? `<div class="cl-list mt">${rows.map((x) => `<div class="cl-li"><span class="itile sm purple">${icon("ticket")}</span><span class="body"><b>${esc(x.code)}</b><span>${x.percent ? `${x.percent}% off` : `${ui.money(x.amount)} off`} · used ${x.used}${x.max_uses ? `/${x.max_uses}` : ""}${x.expires_at ? ` · until ${ui.dateShort(x.expires_at)}` : ""}</span></span>
      ${kit.can(c, "store.manage") ? `<label class="switch" aria-label="Active"><input type="checkbox" data-cp="${x.id}" ${x.active ? "checked" : ""}><span></span></label>` : ui.st(x.active ? ["Active", "green"] : ["Off", "gray"])}</div>`).join("")}</div>` : `<p class="small muted mt">No coupons.</p>`));
  }
  function settings(c, club) {
    if (!kit.can(c, "store.manage")) return ui.emptyBox("lock", "Store settings need store.manage", "");
    const s = club?.store_settings || {}, n = s.payment_numbers || {};
    return `<form id="mc-set" class="stack"><section class="card"><h2>Payment numbers</h2><p class="small muted">Buyers send money here and type the TrxID. Leave a method empty to turn it off. Use the club's own account, not a personal one if you can.</p>
        ${["bkash", "nagad", "rocket"].map((m) => ui.field(METHODS[m], ui.input(m, n[m] || "", 'type="tel" inputmode="tel" placeholder="01XXXXXXXXX" maxlength="14"'))).join("")}${ui.toggle("allow_cash", s.allow_cash !== false, "Cash at pickup", "Buyers pay when they collect")}</section>
      <section class="card"><h2>Pickup & returns</h2>${ui.field("Pickup points (one per line)", ui.area("pickup", (s.pickup_points || ["EWU Main Campus (Admin Building)"]).join("\n"), 'rows="3"'))}
        <div class="row" style="gap:8px">${ui.field("Return window (days, 0 = no returns)", `<input class="input" type="number" name="return_days" min="0" max="60" value="${s.return_days ?? 7}">`)}${ui.field("Low-stock alert at", `<input class="input" type="number" name="low_stock" min="0" max="500" value="${s.low_stock ?? 10}">`)}</div></section>
      <div id="cl-err"></div><button class="btn primary block">${icon("check")} Save settings</button></form>`;
  }
  pages["club/merch"].mount = (el) => {
    kit.bindRetry(el);
    const c = kit.param("c") || kit.clubsWith("store.manage")[0]?.club_id || kit.clubsWith("orders.manage")[0]?.club_id;
    kit.$("#mc-add", el)?.addEventListener("click", () => editProduct({ club_id: c }));
    kit.$$("[data-edit]", el).forEach((b) => b.addEventListener("click", () => editProduct((store.peek(`club:products:${c}`) || []).find((p) => p.id === b.dataset.edit))));
    kit.$("#mc-coupon", el)?.addEventListener("click", () => ui.sheet("New coupon", `<form id="cp" class="stack">${ui.field("Code", ui.input("code", "", 'required maxlength="20" placeholder="WELCOME10" style="text-transform:uppercase"'))}
      <div class="row" style="gap:8px">${ui.field("% off", '<input class="input" type="number" name="percent" min="1" max="90">')}${ui.field("or ৳ off", '<input class="input" type="number" name="amount" min="1">')}</div>
      <div class="row" style="gap:8px">${ui.field("Max uses", '<input class="input" type="number" name="max" min="1">')}${ui.field("Expires", '<input class="input" type="date" name="exp">')}</div><div id="cl-err"></div><button class="btn primary block">Create</button></form>`, (s) =>
      kit.$("#cp", s).addEventListener("submit", async (e) => { e.preventDefault(); const f = ui.values(e.target); const code = String(f.code).trim().toUpperCase();
        if (!/^[A-Z0-9-]{3,20}$/.test(code)) return ui.fail(s, "Use 3–20 letters, numbers or dashes."); if (!!f.percent === !!f.amount) return ui.fail(s, "Fill in either % off or ৳ off.");
        try { await api.saveCoupon({ club_id: c, code, percent: f.percent ? Number(f.percent) : null, amount: f.amount ? Number(f.amount) : null, max_uses: f.max ? Number(f.max) : null, expires_at: f.exp ? new Date(`${f.exp}T23:59:00+06:00`).toISOString() : null }); ctx.closeModal(); store.invalidate(`club:coupons:${c}`); } catch (err) { ui.fail(s, err.message); } })));
    kit.$$("[data-cp]", el).forEach((x) => x.addEventListener("change", async () => { try { await api.saveCoupon({ id: x.dataset.cp, active: x.checked }); store.invalidate(`club:coupons:${c}`); } catch (e) { kit.toast(e.message, "error"); } }));
    kit.$("#mc-set", el)?.addEventListener("submit", async (e) => {
      e.preventDefault(); const f = ui.values(e.target), btn = e.target.querySelector("button.primary");
      const nums = Object.fromEntries(["bkash", "nagad", "rocket"].map((m) => [m, String(f[m] || "").replace(/[^0-9+]/g, "")]).filter(([, v]) => v));
      if (Object.values(nums).some((v) => !/^(\+?88)?01[3-9]\d{8}$/.test(v))) return ui.fail(el, "Payment numbers must be Bangladeshi mobile numbers like 01712345678.");
      ctx.busy(btn, true, "Saving…");
      try {
        await api.setStoreSettings(c, { payment_numbers: nums, allow_cash: !!f.allow_cash, pickup_points: String(f.pickup || "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 8), return_days: Math.max(0, Math.min(60, Number(f.return_days) || 0)), low_stock: Math.max(0, Number(f.low_stock) || 0) });
        store.invalidate(`clubid:${c}`, "store:"); kit.toast("Store settings saved", "success");
      } catch (err) { ui.fail(el, err.message); }
      ctx.busy(btn, false);
    });
  };

  /** Add / edit a product: images, sizes, colours, stock per combination, badge, pre-order, status. */
  function editProduct(p) {
    let imgs = [...(p.images || [])];
    const draw = (s) => {
      const f = s.querySelector("#pf"), cur = f ? ui.values(f) : null;
      const sizes = (cur ? String(cur.sizes) : (p.sizes || []).join(", ")).split(",").map((x) => x.trim()).filter(Boolean);
      const colors = (cur ? String(cur.colors) : (p.colors || []).map((x) => `${x.name}${x.hex ? `:${x.hex}` : ""}`).join(", ")).split(",").map((x) => x.trim()).filter(Boolean).map((x) => { const [name, hex] = x.split(":"); return { name: name.trim(), hex: (hex || "").trim() }; });
      const probe = { sizes, colors };
      const stockNow = cur ? Object.fromEntries([...s.querySelectorAll("[data-stock]")].map((i) => [i.dataset.stock, Number(i.value) || 0])) : p.stock || {};
      s.querySelector("#pf-stock").innerHTML = stockKeys(probe).map((k) => `<label>${esc(k.replace("|", " ").trim() || "Stock")}<input class="input" type="number" min="0" max="100000" data-stock="${esc(k)}" value="${stockNow[k] ?? 0}"></label>`).join("");
      s.querySelector("#pf-imgs").innerHTML = imgs.map((u, i) => `<span class="cl-thumb"><img src="${esc(u)}" alt=""><button type="button" data-rmimg="${i}" aria-label="Remove image">${icon("x", "sm")}</button></span>`).join("") + (imgs.length < 6 ? `<button type="button" class="btn outline" id="pf-addimg" style="width:84px;height:84px">${icon("plus")}</button>` : "");
      kit.$$("[data-rmimg]", s).forEach((b) => b.addEventListener("click", () => { imgs.splice(Number(b.dataset.rmimg), 1); draw(s); }));
      kit.$("#pf-addimg", s)?.addEventListener("click", async () => { const file = await ui.pickFile("image/*"); if (!file) return; try { imgs.push(await api.uploadPublic(p.club_id, await ui.shrink(file, 1200), "products")); draw(s); } catch (e) { ui.fail(s, e.message); } });
    };
    ui.sheet(p.id ? `Edit ${p.name}` : "Add product", `<form id="pf" class="stack">
      <div class="cl-thumbs" id="pf-imgs"></div>
      ${ui.field("Name", ui.input("name", p.name || "", 'required maxlength="80" placeholder="Club Hoodie"'))}
      <div class="row" style="gap:8px">${ui.field("Category", ui.select("category", CATEGORIES, p.category || "hoodies"))}${ui.field("Price (৳)", `<input class="input" type="number" name="price" min="1" required value="${p.price ?? ""}">`)}${ui.field("Was (৳)", `<input class="input" type="number" name="compare_at" min="1" value="${p.compare_at ?? ""}">`)}</div>
      ${ui.field("Description", ui.area("description", p.description || "", 'rows="3" maxlength="3000"'))}
      ${ui.field("Highlights (comma separated)", ui.input("features", (p.features || []).join(", "), 'maxlength="400" placeholder="Premium fabric, Unisex fit, Front & back print"'))}
      ${ui.field("Sizes (comma separated)", ui.input("sizes", (p.sizes || []).join(", "), 'placeholder="S, M, L, XL, XXL" data-redraw'))}
      ${ui.field("Colours (name:#hex, comma separated)", ui.input("colors", (p.colors || []).map((x) => `${x.name}${x.hex ? `:${x.hex}` : ""}`).join(", "), 'placeholder="Black:#111111, Navy:#1e2a5a" data-redraw'))}
      ${ui.toggle("track_stock", p.track_stock !== false, "Track stock", "Orders stop when an option sells out")}<p class="cl-side-h">Stock</p><div class="cl-stockgrid" id="pf-stock"></div>
      <div class="row" style="gap:8px">${ui.field("Badge", ui.select("badge", [["", "None"], ...Object.entries(BADGES).map(([k, v]) => [k, v[0]])], p.badge || ""))}${ui.field("SKU", ui.input("sku", p.sku || "", 'maxlength="40"'))}</div>
      <div class="row" style="gap:8px">${ui.field("Status", ui.select("status", [["draft", "Draft"], ["active", "Active (on sale)"], ["archived", "Archived"]], p.status || "draft"))}${ui.field("Coming on (optional)", `<input class="input" type="date" name="drop_at" value="${p.drop_at ? p.drop_at.slice(0, 10) : ""}">`)}</div>
      ${ui.toggle("preorder", !!p.preorder, "Pre-order", "Take orders before stock arrives")}
      <div id="cl-err"></div><button class="btn primary block">${icon("check")} Save Changes</button>${p.id ? `<button type="button" class="btn ghost block" id="pf-del" style="color:var(--error)">${icon("trash", "sm")} Delete Product</button>` : ""}</form>`, (s) => {
      draw(s);
      kit.$$("[data-redraw]", s).forEach((i) => i.addEventListener("change", () => draw(s)));
      kit.$("#pf", s).addEventListener("submit", async (e) => {
        e.preventDefault(); const f = ui.values(e.target), btn = e.target.querySelector("button.primary");
        const sizes = String(f.sizes || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 10);
        const colors = String(f.colors || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 10).map((x) => { const [name, hex] = x.split(":"); return { name: name.trim().slice(0, 30), hex: /^#[0-9a-f]{6}$/i.test((hex || "").trim()) ? hex.trim() : "" }; });
        const stock = Object.fromEntries([...s.querySelectorAll("[data-stock]")].map((i) => [i.dataset.stock, Math.max(0, Number(i.value) || 0)]));
        if (f.compare_at && Number(f.compare_at) <= Number(f.price)) return ui.fail(s, "“Was” must be more than the price.");
        ctx.busy(btn, true, "Saving…");
        try {
          await api.saveProduct({ ...(p.id ? { id: p.id } : { club_id: p.club_id }), name: f.name.trim(), category: f.category, price: Number(f.price), compare_at: f.compare_at ? Number(f.compare_at) : null, description: f.description || "",
            features: String(f.features || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 8), sizes, colors, stock, track_stock: !!f.track_stock, images: imgs, badge: f.badge, sku: f.sku || "", status: f.status,
            drop_at: f.drop_at ? new Date(`${f.drop_at}T10:00:00+06:00`).toISOString() : null, preorder: !!f.preorder });
          ctx.closeModal(); store.invalidate(`club:products:${p.club_id}`, `club:storestats:${p.club_id}`, "store:");
        } catch (err) { ctx.busy(btn, false); ui.fail(s, err.message); }
      });
      kit.$("#pf-del", s)?.addEventListener("click", () => { ctx.closeModal(); ui.confirm(`Delete ${p.name}?`, "Past orders keep their items. Consider Archived instead to hide it.", "Delete", async () => { await api.deleteProduct(p.id); store.invalidate(`club:products:${p.club_id}`, "store:"); }, true); });
    });
  }

  /* ═════════ Orders Management ═════════ */
  let st = "all", pay = "", q = "", from = "", to = "", page = 1, sel = new Set();
  pages["club/ordersadmin"] = () => {
    const c = kit.param("c") || kit.clubsWith("orders.manage")[0]?.club_id || "";
    const g = gate(c); if (g) return g;
    if (kit.param("pay") && !pay) pay = kit.param("pay");
    const oe = ordersE(c);
    return `${kit.back(`#/club/merch?c=${c}`, "Merch")}
      ${ui.ph("Orders Management", "View, process and manage all merchandise orders.", `${canScan() ? `<button class="btn outline" id="oa-scan">${icon("qr")} Scan pickup</button>` : `<button class="btn outline" id="oa-scan">${icon("qr")} Pickup code</button>`}`)}
      ${nav(c, "orders")}
      ${ui.view(oe, (rows) => {
        const n = (s) => rows.filter((o) => o.status === s).length;
        const words = q.toLowerCase().split(/\s+/).filter(Boolean);
        const list = rows.filter((o) => (st === "all" || o.status === st) && (!pay || o.payment_status === pay) && (!from || o.created_at.slice(0, 10) >= from) && (!to || o.created_at.slice(0, 10) <= to)
          && (!words.length || words.every((w) => `${o.code} ${o.buyer_name} ${o.student_id} ${o.items.map((i) => i.name).join(" ")}`.toLowerCase().includes(w))));
        const pages_ = Math.max(1, Math.ceil(list.length / PAGE)); page = Math.min(page, pages_);
        const shown = list.slice((page - 1) * PAGE, page * PAGE);
        return `<div class="cl-stats c5">${ui.stat("package", "purple", rows.length, "Total orders")}${ui.stat("clock", "red", n("pending_payment") + n("confirmed"), "Pending", { sub: "Needs action" })}${ui.stat("settings", "blue", n("processing"), "Processing")}${ui.stat("bag", "green", n("ready"), "Ready for pickup")}${ui.stat("checkc", "green", n("completed"), "Completed")}</div>
          <nav class="cl-seg sm">${[["all", "All Orders"], ["pending_payment", "Pending"], ["confirmed", "Confirmed"], ["processing", "Processing"], ["ready", "Ready for Pickup"], ["completed", "Completed"], ["cancelled", "Cancelled"]].map(([v, l]) => `<button data-st="${v}" aria-pressed="${st === v}">${l}</button>`).join("")}</nav>
          <div class="searchbar cl-search">${icon("search")}<input class="input" id="oa-q" type="search" placeholder="Search by order ID, name, or product…" value="${esc(q)}" autocomplete="off"></div>
          <div class="row mt-s" style="gap:8px;flex-wrap:wrap">${ui.select("pay", [["", "Any payment"], ...Object.entries(PAYMENT_STATUS).map(([k, v]) => [k, v[0]])], pay, 'id="oa-pay" style="width:auto" aria-label="Payment status"')}
            <label class="row nowrap xs" style="gap:4px">From <input class="input" type="date" id="oa-from" value="${from}" style="width:auto"></label><label class="row nowrap xs" style="gap:4px">To <input class="input" type="date" id="oa-to" value="${to}" style="width:auto"></label></div>
          ${shown.length ? `<div class="cl-list mt-s">${shown.map(orderRow).join("")}</div>${ui.pager(page, pages_)}` : ui.emptyBox("package", "No orders here", "Try another filter.")}
          <div class="${sel.size ? "cl-bulkbar" : "row"} mt" style="gap:6px;flex-wrap:wrap"><label class="row nowrap" style="gap:6px"><input type="checkbox" id="oa-all" ${shown.length && shown.every((o) => sel.has(o.id)) ? "checked" : ""}> Select All</label>
            ${[["processing", "settings", "Mark as Processing"], ["ready", "bag", "Mark as Ready"], ["completed", "checkc", "Mark as Completed"]].map(([s, ic, l]) => `<button class="btn sm outline" data-bulk="${s}" ${sel.size ? "" : "disabled"}>${icon(ic, "sm")} ${l}</button>`).join("")}
            <button class="btn sm ghost" data-bulk="cancelled" ${sel.size ? "" : "disabled"} style="color:var(--error)">${icon("xc", "sm")} Cancel Order</button><button class="btn sm ghost push" id="oa-csv" ${sel.size ? "" : "disabled"}>${icon("download", "sm")} Export Selected</button></div>`;
      }, { n: 5, h: 90 })}`;
  };
  const orderRow = (o) => `<div class="cl-order"><input type="checkbox" data-sel="${o.id}" ${sel.has(o.id) ? "checked" : ""} aria-label="Select order ${esc(o.code)}">
      <a class="min0" href="#/club/orderadmin?id=${o.id}" style="text-decoration:none;color:inherit"><span class="code">#${esc(o.code)}</span><span class="xs" style="display:block">${ui.dateShort(o.created_at)} | ${ui.time(o.created_at)}</span>
        <span class="row nowrap mt-s" style="gap:8px">${ui.ava(o.buyer_name, "", "sm")}<b class="small">${esc(o.buyer_name)}</b></span>
        <span class="items">${o.items.map((i) => `<span>${esc(i.name)}${i.size ? ` (${esc(i.size)})` : ""} ×${i.qty}</span>`).join("")}</span></a>
      <span class="right"><span class="amt">${ui.money(o.total)}</span>${ui.st(o.status === "pending_payment" && o.payment_status === "submitted" ? ["To verify", "blue"] : ORDER_STATUS[o.status])}<a class="icon-btn" href="#/club/orderadmin?id=${o.id}" aria-label="Order details">${icon("more")}</a></span></div>`;
  pages["club/ordersadmin"].mount = (el) => {
    kit.bindRetry(el);
    const c = kit.param("c") || kit.clubsWith("orders.manage")[0]?.club_id, rows = store.peek(`club:orders:${c}`) || [];
    const reload = () => store.invalidate(`club:orders:${c}`, `club:storestats:${c}`);
    const input = kit.$("#oa-q", el);
    input?.addEventListener("input", () => { q = input.value; page = 1; const pos = input.selectionStart; ctx.rerender(); const i = kit.$("#oa-q"); if (i) { i.focus(); i.setSelectionRange(pos, pos); } });
    kit.$$("[data-st]", el).forEach((b) => b.addEventListener("click", () => { st = b.dataset.st; page = 1; sel.clear(); ctx.rerender(); }));
    kit.$("#oa-pay", el)?.addEventListener("change", (e) => { pay = e.target.value; page = 1; ctx.rerender(); });
    kit.$("#oa-from", el)?.addEventListener("change", (e) => { from = e.target.value; ctx.rerender(); });
    kit.$("#oa-to", el)?.addEventListener("change", (e) => { to = e.target.value; ctx.rerender(); });
    kit.$$("[data-pg]", el).forEach((b) => b.addEventListener("click", () => { page = Number(b.dataset.pg); ctx.rerender(); }));
    kit.$$("[data-sel]", el).forEach((x) => x.addEventListener("change", () => { x.checked ? sel.add(x.dataset.sel) : sel.delete(x.dataset.sel); ctx.rerender(); }));
    kit.$("#oa-all", el)?.addEventListener("change", (e) => { kit.$$("[data-sel]", el).forEach((x) => (e.target.checked ? sel.add(x.dataset.sel) : sel.delete(x.dataset.sel))); ctx.rerender(); });
    kit.$$("[data-bulk]", el).forEach((b) => b.addEventListener("click", () => { const s = b.dataset.bulk, ids = [...sel];
      ui.confirm(`${ORDER_STATUS[s][0]}: ${ui.plural(ids.length, "order")}?`, s === "cancelled" ? "Stock goes back on sale. Paid orders get a refund to process." : "Orders that can't move to this step (for example unpaid ones) are skipped. Buyers are notified.", "Update", async () => { const n = await api.bulkOrderStatus(ids, s); sel.clear(); reload(); kit.toast(`${n} of ${ids.length} updated`, n === ids.length ? "success" : "info"); }, s === "cancelled"); }));
    kit.$("#oa-csv", el)?.addEventListener("click", () => {
      const cell = (v) => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const list = rows.filter((o) => sel.has(o.id));
      ui.download("orders.csv", "\ufeff" + [["Order", "Date", "Buyer", "Student ID", "Phone", "Items", "Total", "Payment", "TrxID", "Status", "Pickup"], ...list.map((o) => [o.code, o.created_at.slice(0, 10), o.buyer_name, o.student_id, o.buyer_phone, o.items.map((i) => `${i.name} ${i.size} ${i.color} x${i.qty}`).join("; "), o.total, PAYMENT_STATUS[o.payment_status][0], o.payment_ref, ORDER_STATUS[o.status][0], o.pickup_point])].map((l) => l.map(cell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
      api.logExport(c, "Merch orders", list.length).catch(() => {});
    });
    kit.$("#oa-scan", el)?.addEventListener("click", () => scanPickup(reload));
    if (kit.param("scan")) { history.replaceState(null, "", `#/club/ordersadmin?c=${c}`); scanPickup(reload); }
  };

  /** Pickup desk: scan the buyer's QR (or type the code); completes a ready order and shows what to hand over. */
  function scanPickup(reload) {
    let scanner = null;
    ui.sheet("Pickup", `${canScan() ? `<video id="pk-video" playsinline muted style="width:100%;border-radius:14px;background:#111;aspect-ratio:1;object-fit:cover"></video>` : ""}
      <form id="pk" class="row nowrap mt-s" style="gap:8px">${ui.input("t", "", 'placeholder="Pickup code from the QR" autocomplete="off" style="flex:1" aria-label="Pickup code"')}<button class="btn primary">Verify</button></form><div id="pk-out" class="mt" aria-live="polite"></div>`, (s) => {
      const out = kit.$("#pk-out", s);
      const verify = async (tok) => {
        try { const r = await api.scanPickup(tok); navigator.vibrate?.(60); reload();
          out.innerHTML = `<div class="alert green"><span class="a-ic">${icon("checkc")}</span><div><b>Hand over #${esc(r.code)} to ${esc(r.buyer)}</b><p>${r.items.map((i) => `${esc(i.name)} ${esc([i.size, i.color].filter(Boolean).join(", "))} ×${i.qty}`).join("<br>")}</p>${r.cash ? `<p><b>Collect ${ui.money(r.total)} in cash.</b></p>` : ""}<p class="xs">Check their student ID${r.student_id ? ` (${esc(r.student_id)})` : ""}.</p></div></div>`; }
        catch (err) { navigator.vibrate?.([40, 60, 40]); out.innerHTML = `<div class="alert red"><span class="a-ic">${icon("alert")}</span><div><b>${esc(err.message)}</b></div></div>`; }
      };
      kit.$("#pk", s).addEventListener("submit", (e) => { e.preventDefault(); const v = String(new FormData(e.target).get("t") || "").trim(); if (v) verify(v); });
      const video = kit.$("#pk-video", s);
      if (video) startScanner(video, (text) => { if (/^ewud:o:/.test(text)) verify(text); }).then((x) => { scanner = x; }).catch(() => {});
      // The camera stops when the sheet closes (closeModal empties it).
      new MutationObserver((_, ob) => { if (!s.innerHTML) { scanner?.stop(); ob.disconnect(); } }).observe(s, { childList: true });
    });
  }

  /* ═════════ Order details & returns ═════════ */
  let otab = "returns";
  pages["club/orderadmin"] = () => {
    const g = kit.gate("this order"); if (g) return g;
    const id = kit.param("id"), oe = store.use(`club:order:${id}`, () => api.order(id), { ttl: 20e3 });
    if (kit.param("tab")) otab = kit.param("tab");
    return ui.view(oe, (o) => {
      if (!o || !(kit.can(o.club_id, "orders.manage") || kit.can(o.club_id, "refunds.approve"))) return ui.emptyBox("lock", "Order not found", "");
      const ev = store.use(`club:order:ev:${id}`, () => api.orderEvents(id), { ttl: 20e3 }).value || [];
      const rets = store.use(`club:order:ret:${id}`, () => api.returnsFor(id), { ttl: 20e3 }).value || [];
      const steps = progress(o), nexts = nextSteps(o);
      return `${kit.back(`#/club/ordersadmin?c=${o.club_id}`, "Orders")}
        ${ui.ph("Order Details", "Manage order status, handle returns and process refunds.", `<button class="btn outline" id="od-print">${icon("print")} Print Invoice</button>`)}
        <div class="cl-row2"><section class="card"><span class="xs">Order ID</span><div class="row" style="gap:8px"><h2 style="font-size:24px">#${esc(o.code)}</h2>${ui.st(ORDER_STATUS[o.status])}</div><p class="xs">${ui.dateLong(o.created_at)} | ${ui.time(o.created_at)}</p></section>
          <section class="card row nowrap" style="gap:12px">${ui.ava(o.buyer_name, "", "lg")}<div class="min0"><b style="font-size:16px">${esc(o.buyer_name)}</b><p class="xs">${o.student_id ? `ID: ${esc(o.student_id)}` : ""}</p>
            ${o.buyer_phone ? `<p class="small">${icon("phone", "sm")} <a href="tel:${esc(o.buyer_phone)}">${esc(o.buyer_phone)}</a></p>` : ""}${o.buyer_email ? `<p class="small ellipsis">${icon("mail", "sm")} <a href="mailto:${esc(o.buyer_email)}">${esc(o.buyer_email)}</a></p>` : ""}</div></section></div>
        ${o.status === "cancelled" ? `<div class="alert red mt"><span class="a-ic">${icon("xc")}</span><div><b>Cancelled</b><p>${esc(o.cancel_reason || "")}</p></div></div>` : `<div class="cl-steps mt">${steps.map((x, i) => `<div class="${x.done ? "done" : x.current ? "now" : ""}"><span class="c">${x.done ? icon("check", "sm") : i + 1}</span>${x.label}<small>${x.when ? `${ui.dateShort(x.when)}, ${ui.time(x.when)}` : ""}</small></div>`).join("")}</div>`}
        <div class="cl-row2"><section class="card row nowrap" style="gap:12px">${icon("building")}<div><b>Pickup Location</b><p class="small">${esc(o.pickup_point)}</p></div></section>
          <section class="card row nowrap" style="gap:12px">${icon("qr")}<div class="grow"><b>Pickup QR Verification</b><p class="xs">${o.status === "completed" ? `Picked up ${ui.dateTime(o.completed_at)}` : o.status === "ready" ? "Scan the buyer's code to hand it over." : "Available once it's ready."}</p></div>${o.status === "ready" ? `<button class="btn sm primary" id="od-scan">Scan</button>` : ""}</section></div>
        ${ui.sec("Order Items")}<section class="card"><div class="cl-list" style="border:0;box-shadow:none">${o.items.map((l) => `<div class="cl-li" style="padding:8px 0">${l.image ? `<img src="${esc(l.image)}" alt="" style="width:48px;height:48px;border-radius:10px;object-fit:cover">` : icon("shirt")}<span class="body"><b>${esc(l.name)}</b><span>${esc([l.color, l.size].filter(Boolean).join(", "))}</span></span><span class="end">${ui.money(l.price)} ×${l.qty}<br><b>${ui.money(l.price * l.qty)}</b></span></div>`).join("")}</div></section>
        <div class="cl-row2 mt"><section class="card cl-sum"><div><span>Subtotal</span><b>${ui.money(o.subtotal)}</b></div><div><span>Discount${o.coupon ? ` (${esc(o.coupon)})` : ""}</span><b>− ${ui.money(o.discount)}</b></div><div><span>Delivery / Pickup</span><span style="color:var(--success-t)">Free (campus pickup)</span></div><div class="total"><span>Total</span><b>${ui.money(o.total)}</b></div></section>
          <section class="card"><h2>Payment Information</h2><div class="row nowrap mt-s" style="gap:10px"><span class="cl-pay"><span class="logo ${o.payment_method}" style="display:grid">${o.payment_method === "cash" ? icon("wallet", "sm") : METHODS[o.payment_method][0]}</span></span><div><b>${METHODS[o.payment_method]}</b><p class="xs">${o.payment_ref ? `Transaction ID ${esc(o.payment_ref)}` : "No transaction ID yet"}${o.paid_at ? ` · Paid ${ui.dateTime(o.paid_at)}` : ""}</p></div></div>
            <div class="row mt-s" style="gap:8px">${ui.st(PAYMENT_STATUS[o.payment_status], o.payment_status === "verified" ? "checkc" : "")}
              ${kit.can(o.club_id, "payments.verify") && o.payment_method !== "cash" && ["submitted", "unpaid", "rejected"].includes(o.payment_status) && o.status !== "cancelled" ? `<button class="btn sm primary" id="od-ok">${icon("check", "sm")} Mark paid</button><button class="btn sm ghost" id="od-bad">Not found</button>` : ""}</div>
            ${o.payment_status === "submitted" ? `<p class="xs mt-s">Find this TrxID in the club's ${METHODS[o.payment_method]} statement before marking it paid.</p>` : ""}</section></div>
        <nav class="cl-seg sm mt">${[["returns", "Returns & Refunds"], ["notes", "Order Notes"], ["messages", "Customer Messages"], ["history", "History"]].map(([v, l]) => `<button data-ot="${v}" aria-pressed="${otab === v}">${l}</button>`).join("")}</nav>
        ${otab === "notes" ? `<form id="od-note" class="row nowrap" style="gap:8px">${ui.input("n", "", 'placeholder="Staff-only note" maxlength="500" style="flex:1" aria-label="Note"')}<button class="btn primary">Add</button></form>${history(ev.filter((x) => x.internal))}`
          : otab === "messages" ? `<section class="card"><p class="small">Reach ${esc(o.buyer_name)} directly:</p><div class="row mt-s" style="gap:8px;flex-wrap:wrap">${o.buyer_phone ? `<a class="btn outline" href="tel:${esc(o.buyer_phone)}">${icon("phone")} Call</a><a class="btn outline" href="sms:${esc(o.buyer_phone)}?body=${encodeURIComponent(`Hi, about your order ${o.code}: `)}">${icon("chat")} SMS</a>` : ""}${o.buyer_email ? `<a class="btn outline" href="mailto:${esc(o.buyer_email)}?subject=${encodeURIComponent(`Your order ${o.code}`)}">${icon("mail")} Email</a>` : ""}</div><p class="xs mt-s">Status changes are sent to the buyer in the app automatically.</p></section>`
          : otab === "history" ? history(ev)
          : `<section class="card row nowrap" style="gap:12px">${icon("refund")}<div class="grow"><b>Request Return / Refund</b><p class="xs">Record a return the buyer asked for in person, or review requests below.</p></div></section>
            ${rets.length ? `<div class="cl-list mt-s">${rets.map((r) => `<div class="cl-li"><span class="body"><b>#${esc(r.code)} · ${ui.dateShort(r.created_at)}</b><span>Reason: ${esc(RETURN_REASONS[r.reason])}${r.details ? ` — ${esc(r.details)}` : ""}</span>
                ${r.evidence.length ? `<span class="row" style="gap:6px;margin-top:4px">${r.evidence.map((p, i) => `<button class="btn sm ghost" data-ev="${esc(p)}">Photo ${i + 1}</button>`).join("")}</span>` : ""}
                ${r.status === "refunded" ? `<span>Refunded ${ui.money(r.refund_amount)} · ${esc(r.refund_method)} ${esc(r.refund_ref)}</span>` : ""}</span>
                <span class="end">${ui.st(RETURN_STATUS[r.status])}${r.status === "requested" && kit.can(o.club_id, "orders.manage") ? `<span class="row nowrap" style="gap:4px"><button class="btn sm primary" data-rok="${r.id}">Approve</button><button class="btn sm ghost" data-rno="${r.id}">Reject</button></span>` : ""}
                  ${r.status === "approved" && kit.can(o.club_id, "refunds.approve") ? `<button class="btn sm primary" data-refund="${r.id}">${icon("refund", "sm")} Process Refund</button>` : ""}</span></div>`).join("")}</div>` : `<p class="small muted mt-s">No return or refund requests.</p>`}`}
        <div class="cl-bulkbar mt">${nexts.length && kit.can(o.club_id, "orders.manage") ? `<select class="select" id="od-status" style="width:auto" aria-label="Update status"><option value="">Update Status</option>${nexts.map((s) => `<option value="${s}">${ORDER_STATUS[s][0]}</option>`).join("")}</select>` : ""}
          ${rets.some((r) => r.status === "approved") && kit.can(o.club_id, "refunds.approve") ? `<button class="btn outline" data-refund="${rets.find((r) => r.status === "approved").id}">${icon("refund")} Process Refund</button>` : ""}
          <button class="btn outline" data-ot="messages">${icon("chat")} Contact Customer</button></div>`;
    }, { n: 4, h: 120 });
  };
  const history = (ev) => (ev.length ? `<section class="card"><div class="cl-vtl">${ev.map((x) => `<div><span class="dot done">${icon("check")}</span><span><b>${esc(x.action.replace(/[._]/g, " "))}</b><span class="xs">${ui.dateTime(x.at)} · ${esc(x.actor_name || "")}${x.detail ? ` · ${esc(x.detail)}` : ""}</span></span>${x.internal ? ui.st(["Staff", "gray"]) : "<span></span>"}</div>`).join("")}</div></section>` : `<p class="small muted">Nothing yet.</p>`);
  pages["club/orderadmin"].mount = (el) => {
    kit.bindRetry(el);
    const id = kit.param("id"), o = store.peek(`club:order:${id}`); if (!o) return;
    const reload = () => store.invalidate(`club:order:${id}`, `club:orders:${o.club_id}`, `club:storestats:${o.club_id}`, `club:returns:${o.club_id}`);
    kit.$$("[data-ot]", el).forEach((b) => b.addEventListener("click", () => { otab = b.dataset.ot; ctx.rerender(); }));
    kit.$("#od-status", el)?.addEventListener("change", (e) => { const s = e.target.value; e.target.value = ""; if (!s) return;
      if (s === "processing") return eta(o, reload);
      ui.confirm(`${ORDER_STATUS[s][0]}?`, s === "cancelled" ? "Stock goes back on sale; a paid order gets a refund to process." : `${esc(o.buyer_name)} is notified.`, "Update", async () => { await api.setOrderStatus(id, s); reload(); }, s === "cancelled"); });
    kit.$("#od-ok", el)?.addEventListener("click", () => ui.confirm("Mark this payment as received?", `Only if you found ${esc(o.payment_ref || "the transaction")} for ${ui.money(o.total)} in the club's ${METHODS[o.payment_method]} account.`, "Mark paid", async () => { await api.verifyPayment(id, true); reload(); }));
    kit.$("#od-bad", el)?.addEventListener("click", () => ui.sheet("Payment not found", `<form id="pb" class="stack">${ui.field("Tell the buyer what to do", ui.area("n", "We couldn't find this transaction. Please check the TrxID and send it again.", 'rows="3" maxlength="300"'))}<button class="btn primary block">Send</button></form>`, (s) =>
      kit.$("#pb", s).addEventListener("submit", async (e) => { e.preventDefault(); try { await api.verifyPayment(id, false, String(new FormData(e.target).get("n") || "")); ctx.closeModal(); reload(); } catch (err) { kit.toast(err.message, "error"); } })));
    kit.$("#od-scan", el)?.addEventListener("click", () => scanPickup(reload));
    kit.$("#od-print", el)?.addEventListener("click", () => window.print());
    kit.$("#od-note", el)?.addEventListener("submit", async (e) => { e.preventDefault(); const n = String(new FormData(e.target).get("n") || "").trim(); if (!n) return; try { await api.addOrderNote(id, n); store.invalidate(`club:order:ev:${id}`); } catch (err) { kit.toast(err.message, "error"); } });
    kit.$$("[data-ev]", el).forEach((b) => b.addEventListener("click", async () => { try { window.open(await api.signedUrl(b.dataset.ev), "_blank", "noopener"); } catch (err) { kit.toast(err.message, "error"); } }));
    kit.$$("[data-rok]", el).forEach((b) => b.addEventListener("click", () => ui.confirm("Approve this return?", "Then a Treasurer (or anyone with refund rights) records the refund.", "Approve", async () => { await api.reviewReturn(b.dataset.rok, true); reload(); })));
    kit.$$("[data-rno]", el).forEach((b) => b.addEventListener("click", () => ui.sheet("Reject return", `<form id="rj" class="stack">${ui.field("Reason (sent to the buyer)", ui.area("n", "", 'rows="3" maxlength="500" required'))}<button class="btn primary block">Reject</button></form>`, (s) =>
      kit.$("#rj", s).addEventListener("submit", async (e) => { e.preventDefault(); try { await api.reviewReturn(b.dataset.rno, false, String(new FormData(e.target).get("n") || "")); ctx.closeModal(); reload(); } catch (err) { kit.toast(err.message, "error"); } }))));
    kit.$$("[data-refund]", el).forEach((b) => b.addEventListener("click", () => { const r = (store.peek(`club:order:ret:${id}`) || []).find((x) => x.id === b.dataset.refund);
      ui.sheet("Process refund", `<form id="rf" class="stack"><p class="small">Send the money back first (outside the app), then record it here. It's added to the finance book as an expense.</p>
        ${ui.field("Amount (৳)", `<input class="input" type="number" name="amt" min="0" max="${o.total}" value="${r?.refund_amount ?? lineTotal(o.items)}" required>`)}
        ${ui.field("How", ui.select("m", [["bkash", "bKash"], ["nagad", "Nagad"], ["rocket", "Rocket"], ["cash", "Cash"], ["exchange", "Exchanged the item"]], o.payment_method))}
        ${ui.field("Refund transaction ID", ui.input("ref", "", 'maxlength="40"'))}<div id="cl-err"></div><button class="btn primary block">${icon("refund")} Record refund</button></form>`, (s) =>
        kit.$("#rf", s).addEventListener("submit", async (e) => { e.preventDefault(); const f = ui.values(e.target); try { await api.recordRefund(r.id, Number(f.amt), f.m, f.ref || ""); ctx.closeModal(); reload(); kit.toast("Refund recorded", "success"); } catch (err) { ui.fail(s, err.message); } })); }));
  };
  function eta(o, reload) {
    ui.sheet("Start preparing", `<form id="et" class="stack">${ui.field("Estimated ready date (shown to the buyer)", `<input class="input" type="date" name="eta" value="${new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10)}">`)}<button class="btn primary block">Mark as Processing</button></form>`, (s) =>
      kit.$("#et", s).addEventListener("submit", async (e) => { e.preventDefault(); try { await api.setOrderStatus(o.id, "processing", "", String(new FormData(e.target).get("eta") || "") || null); ctx.closeModal(); reload(); } catch (err) { kit.toast(err.message, "error"); } }));
  }
}
