/* Merch store for students, from the "Merchandise App", "Shopping Checkout" and "Order Tracking" boards:
   #/club/store · #/club/product?id= · #/club/cart · #/club/checkout?c= · #/club/order?id= · #/club/orders
   No in-app payments: the buyer pays the club's bKash / Nagad / Rocket number (or cash at pickup) and types the
   transaction ID; the club's Merch Manager checks it. Prices, stock and coupons are recomputed by public.place_order.
   The pickup QR holds only a random token (ewud:o:…), never personal details, and unlocks when the order is ready. */
import { ORDER_STATUS, PAYMENT_STATUS, METHODS, RETURN_REASONS, RETURN_STATUS, CATEGORIES, BADGES, stockOf, progress, buyerCanCancel, canReturn, pickupQr, lineTotal } from "../orders.js";
import { byClub, subtotal } from "../cart.js";

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store, ctx, cart } = kit;
  const prodE = () => store.use("store:products", () => api.products(), { ttl: 60e3 });
  const methodsOf = (club) => { const s = club?.store_settings || {}, nums = s.payment_numbers || {}; return Object.keys(METHODS).filter((m) => (m === "cash" ? s.allow_cash !== false : !!nums[m])); };
  const priceTag = (p) => `<span class="price">${ui.money(p.price)}${p.compare_at ? `<s>${ui.money(p.compare_at)}</s>` : ""}</span>`;
  const upcoming = (p) => p.drop_at && new Date(p.drop_at) > Date.now();
  let cat = "all", q = "", heart = new Set(JSON.parse(localStorage.getItem("ewud.club.fav") || "[]"));

  /* ═════════ Store front ═════════ */
  pages["club/store"] = () => {
    if (!api) return kit.gate("the store");
    const pe = prodE(), clubFilter = kit.param("c") || "";
    return `${ui.ph("Club Merchandise Store", "Show your club spirit with club merchandise.")}
      <div class="searchbar cl-search">${icon("search")}<input class="input" id="sh-q" type="search" placeholder="Search for t-shirts, hoodies, badges…" value="${esc(q)}" autocomplete="off"></div>
      <nav class="cl-seg mt-s">${[["all", "All"], ...Object.entries(CATEGORIES)].map(([v, l]) => `<button data-cat="${v}" aria-pressed="${cat === v}">${l}</button>`).join("")}</nav>
      ${ui.view(pe, (rows) => {
        const live = rows.filter((p) => !clubFilter || p.club_id === clubFilter);
        const words = q.toLowerCase().split(/\s+/).filter(Boolean);
        const list = live.filter((p) => !upcoming(p) && (cat === "all" || p.category === cat) && (!words.length || words.every((w) => `${p.name} ${p.description} ${p.clubs?.name}`.toLowerCase().includes(w))));
        const drops = live.filter((p) => upcoming(p) || p.preorder);
        if (!live.length) return `<section class="cl-shop-hero"><h2>Wear Your Club <em>Pride.</em></h2><p>Club hoodies, jerseys and badges, sold by the clubs themselves.</p></section>${ui.emptyBox("bag", "No merchandise yet", "When a club opens its store, its products appear here.")}`;
        return `${!q && cat === "all" ? `<section class="cl-shop-hero"><h2>Wear Your Club <em>Pride.</em></h2><p>Merchandise from EWU's clubs. Every purchase supports club activities.</p><a class="btn white" href="#sh-grid" style="justify-self:start">Shop Now ${icon("arrow", "sm")}</a></section>
            <div class="cl-perks">${[["shield", "green", "Sold by the club"], ["users", "purple", "Supports club activities"], ["building", "blue", "Campus pickup"], ["refund", "pink", "Easy returns"]].map(([ic, t, l]) => `<div><span class="itile sm ${t}">${icon(ic)}</span>${l}</div>`).join("")}</div>` : ""}
          ${ui.sec(cat === "all" && !q ? "Featured Products" : `${ui.plural(list.length, "product")}`)}
          <div class="cl-prods" id="sh-grid">${list.map(card).join("") || `<p class="small muted">Nothing matches.</p>`}</div>
          ${cat === "all" && !q ? `${ui.sec("Categories")}<div class="cl-tiles">${Object.entries(CATEGORIES).filter(([k]) => live.some((p) => p.category === k)).map(([k, l]) => `<button class="cl-tile t-purple" data-cat="${k}" style="font:inherit;cursor:pointer">${icon(k === "caps" ? "star" : k === "stickers" ? "sparkle" : k === "accessories" ? "bag" : "shirt")}<span>${l}<br><span class="xs">${ui.plural(live.filter((p) => p.category === k).length, "product")}</span></span></button>`).join("")}</div>` : ""}
          ${drops.length && cat === "all" && !q ? `${ui.sec("Upcoming Drops")}<div class="cl-hscroll">${drops.map((p) => `<a class="cl-vcard" href="#/club/product?id=${p.id}" style="width:210px"><span class="art">${ui.art(p.images[0], p.name)}</span><span class="in"><b>${esc(p.name)}</b><span class="xs">${p.preorder ? "Pre-order now" : "Coming soon"}${p.drop_at ? ` · ${ui.dateShort(p.drop_at)}` : ""}</span></span></a>`).join("")}</div>` : ""}`;
      }, { n: 4, h: 200 })}
      <p class="xs mt" style="text-align:center">Sold by the clubs. Payments go to the club, outside the app. Unofficial · not affiliated with EWU.</p>`;
  };
  const card = (p) => `<a class="cl-prod" href="#/club/product?id=${p.id}"><span class="img">${p.images[0] ? `<img src="${esc(p.images[0])}" alt="" loading="lazy">` : icon("shirt")}</span>
      ${p.badge ? `<span class="badge">${ui.st(BADGES[p.badge])}</span>` : ""}<b class="ellipsis">${esc(p.name)}</b><span class="club ellipsis">${esc(p.clubs?.short_name || p.clubs?.name || "")}</span>${priceTag(p)}
      <span class="btn sm primary">${icon("cart", "sm")} ${p.sizes.length || p.colors.length ? "Choose" : "Add to Cart"}</span></a>`;
  pages["club/store"].mount = (el) => {
    kit.bindRetry(el);
    const input = kit.$("#sh-q", el);
    input?.addEventListener("input", () => { q = input.value; const pos = input.selectionStart; ctx.rerender(); const i = kit.$("#sh-q"); if (i) { i.focus(); i.setSelectionRange(pos, pos); } });
    kit.$$("[data-cat]", el).forEach((b) => b.addEventListener("click", () => { cat = b.dataset.cat; ctx.rerender(); }));
  };

  /* ═════════ Product ═════════ */
  const choice = {};
  pages["club/product"] = () => {
    if (!api) return kit.gate("the store");
    const id = kit.param("id"), pe = store.use(`store:product:${id}`, () => api.product(id), { ttl: 30e3 });
    return kit.back("#/club/store", "Store") + ui.view(pe, (p) => {
      if (!p) return ui.emptyBox("bag", "Product not found", "It may be sold out or no longer on sale.");
      const c = (choice[id] ||= { img: 0, size: p.sizes[0] || "", color: p.colors[0]?.name || "", qty: 1 });
      const left = stockOf(p, c.size, c.color), off = p.compare_at ? Math.round((1 - p.price / p.compare_at) * 100) : 0;
      const s = p.clubs?.store_settings || {}, methods = methodsOf(p.clubs);
      const related = (store.peek("store:products") || []).filter((x) => x.club_id === p.club_id && x.id !== p.id).slice(0, 6);
      if (!related.length) prodE();
      return `<div class="cl-pdp"><div class="cl-gal"><div class="thumbs">${p.images.map((u, i) => `<button data-img="${i}" aria-pressed="${c.img === i}" aria-label="Image ${i + 1}"><img src="${esc(u)}" alt=""></button>`).join("")}</div>
          <div class="main">${p.images[c.img] ? `<img src="${esc(p.images[c.img])}" alt="${esc(p.name)}">` : icon("shirt")}</div></div>
        <div class="stack" style="gap:12px"><div class="row between nowrap"><h1 style="font-size:26px">${esc(p.name)}</h1>${p.badge ? ui.st(BADGES[p.badge]) : ""}</div>
          <a class="xs" href="#/club/c?slug=${encodeURIComponent(p.clubs?.slug || "")}">${esc(p.clubs?.name || "")}</a>
          <div class="row" style="gap:10px;align-items:baseline"><b style="font-size:28px;color:var(--primary)">${ui.money(p.price)}</b>${p.compare_at ? `<s class="muted">${ui.money(p.compare_at)}</s> ${ui.st([`${off}% OFF`, "red"])}` : ""}</div>
          ${p.description ? `<p style="color:var(--text-2)">${ui.rich(p.description)}</p>` : ""}
          ${p.features.length ? `<div class="chips">${p.features.map((f) => `<span class="chip">${icon("checkc", "sm")} ${esc(f)}</span>`).join("")}</div>` : ""}
          ${p.sizes.length ? `<div><b class="small">Size</b><div class="cl-opts mt-s">${p.sizes.map((z) => `<button data-size="${esc(z)}" aria-pressed="${c.size === z}" ${stockOf(p, z, c.color) <= 0 ? "disabled" : ""}>${esc(z)}</button>`).join("")}</div></div>` : ""}
          ${p.colors.length ? `<div><b class="small">Color</b> <span class="xs">${esc(c.color)}</span><div class="cl-opts mt-s">${p.colors.map((x) => `<button class="cl-swatch" style="--sw:${esc(x.hex || "#888")}" data-color="${esc(x.name)}" aria-pressed="${c.color === x.name}" aria-label="${esc(x.name)}"></button>`).join("")}</div></div>` : ""}
          <div class="row" style="gap:12px;align-items:center"><b class="small">Quantity</b><span class="cl-qty"><button data-q="-1" aria-label="Less">−</button><b>${c.qty}</b><button data-q="1" aria-label="More">+</button></span>
            ${upcoming(p) && !p.preorder ? ui.st(["Coming soon", "amber"]) : left === Infinity ? ui.st([p.preorder ? "Pre-order" : "Available", "green"], "checkc") : left > 0 ? ui.st([left <= 5 ? `Only ${left} left` : "In Stock", left <= 5 ? "amber" : "green"], "checkc") : ui.st(["Out of stock", "red"])}</div>
          <div class="row" style="gap:8px"><button class="btn primary grow" id="pd-add" ${left <= 0 || (upcoming(p) && !p.preorder) ? "disabled" : ""}>${icon("cart")} Add to Cart</button><button class="btn outline grow" id="pd-buy" ${left <= 0 || (upcoming(p) && !p.preorder) ? "disabled" : ""}>${icon("zap")} Buy Now</button>
            <button class="icon-btn" id="pd-fav" aria-pressed="${heart.has(p.id)}" aria-label="Save">${icon("heart")}</button></div>
          <div class="cl-row3">${[["building", "Campus Pickup", (s.pickup_points || ["EWU campus"])[0]], ["shield", "Pay the club", methods.map((m) => METHODS[m].replace(" at pickup", "")).join(", ") || "Ask the club"], ["refund", "Returns", s.return_days === 0 ? "No returns" : `Within ${s.return_days ?? 7} days`]].map(([ic, a, b]) => `<div class="cl-fact">${icon(ic)}<div><b>${a}</b><span>${esc(b)}</span></div></div>`).join("")}</div></div></div>
        ${related.length ? `${ui.sec("You may also like")}<div class="cl-prods">${related.map(card).join("")}</div>` : ""}`;
    }, { n: 2, h: 260 });
  };
  pages["club/product"].mount = (el) => {
    const id = kit.param("id"), p = store.peek(`store:product:${id}`); if (!p) return;
    const c = choice[id];
    kit.$$("[data-img]", el).forEach((b) => b.addEventListener("click", () => { c.img = Number(b.dataset.img); ctx.rerender(); }));
    kit.$$("[data-size]", el).forEach((b) => b.addEventListener("click", () => { c.size = b.dataset.size; ctx.rerender(); }));
    kit.$$("[data-color]", el).forEach((b) => b.addEventListener("click", () => { c.color = b.dataset.color; ctx.rerender(); }));
    kit.$$("[data-q]", el).forEach((b) => b.addEventListener("click", () => { c.qty = Math.max(1, Math.min(10, Math.min(stockOf(p, c.size, c.color), c.qty + Number(b.dataset.q)))); ctx.rerender(); }));
    kit.$("#pd-fav", el)?.addEventListener("click", () => { heart.has(id) ? heart.delete(id) : heart.add(id); try { localStorage.setItem("ewud.club.fav", JSON.stringify([...heart])); } catch { /* private mode */ } ctx.rerender(); });
    const add = () => { cart.add({ product_id: p.id, club_id: p.club_id, club_name: p.clubs?.name || "", name: p.name, price: Number(p.price), image: p.images[0] || "", size: p.sizes.length ? c.size : "", color: p.colors.length ? c.color : "", qty: c.qty }); };
    kit.$("#pd-add", el)?.addEventListener("click", () => { add(); kit.toast("Added to cart", "success", `${p.name}${c.size ? ` · ${c.size}` : ""}`); });
    kit.$("#pd-buy", el)?.addEventListener("click", () => { add(); kit.go(`#/club/checkout?c=${p.club_id}`); });
  };

  /* ═════════ Cart ═════════ */
  const coupons = {};
  pages["club/cart"] = () => {
    const groups = byClub(cart.lines());
    if (!groups.length) return ui.ph("Your Cart", "") + ui.emptyBox("cart", "Your cart is empty", "Find something you like in the store.", `<a class="btn primary" href="#/club/store">Go to the store</a>`);
    return `${ui.ph("Your Cart", "Review your items before checkout.", `<span class="cl-disclaimer">${ui.plural(cart.count(), "item")}</span>`)}
      ${groups.map((g) => { const sel = g.lines.filter((l) => l.selected !== false), sub = subtotal(sel), cp = coupons[g.club_id], disc = cp ? Math.min(sub, cp.amount) : 0;
        return `<section class="mt">${groups.length > 1 ? `<h2 class="cl-sec" style="margin-top:0"><span style="font-size:16px">${esc(g.club_name)}</span></h2>` : ""}
          <div class="stack">${g.lines.map((l) => { const k = esc(JSON.stringify([l.product_id, l.size, l.color]));
            return `<div class="cl-cartline"><input type="checkbox" data-sel='${k}' ${l.selected !== false ? "checked" : ""} aria-label="Include ${esc(l.name)}"><span class="img">${l.image ? `<img src="${esc(l.image)}" alt="">` : icon("shirt")}</span>
              <span class="min0"><b style="display:block">${esc(l.name)}</b><b style="color:var(--primary)">${ui.money(l.price)}</b><span class="xs" style="display:block">${esc([l.color, l.size && `Size: ${l.size}`].filter(Boolean).join(" · "))}</span></span>
              <span class="row nowrap" style="gap:6px"><span class="cl-qty"><button data-qty='${k}' data-d="-1" aria-label="Less">−</button><b>${l.qty}</b><button data-qty='${k}' data-d="1" aria-label="More">+</button></span><button class="icon-btn" data-rm='${k}' aria-label="Remove">${icon("trash")}</button></span></div>`; }).join("")}</div>
          <section class="card mt-s"><div class="row nowrap" style="gap:12px"><span class="itile purple">${icon("ticket")}</span><div class="grow"><b>Have a Coupon Code?</b><form class="row nowrap mt-s" data-coupon="${g.club_id}" style="gap:8px">${ui.input("code", cp?.code || "", 'placeholder="Enter coupon code" style="flex:1;text-transform:uppercase" aria-label="Coupon code"')}<button class="btn primary">Apply</button></form>${cp ? `<p class="xs" style="color:var(--success-t)">${esc(cp.code)} saves ${ui.money(disc)}</p>` : ""}</div></div></section>
          <section class="card mt-s cl-sum"><h3>Order Summary</h3><div><span>Subtotal (${ui.plural(sel.reduce((s, l) => s + l.qty, 0), "item")})</span><b>${ui.money(sub)}</b></div><div><span>Discount</span><b>− ${ui.money(disc)}</b></div><div><span>Pickup</span><span style="color:var(--success-t)">Free (campus pickup)</span></div>
            <div class="total"><span>Total</span><b>${ui.money(sub - disc)}</b></div><a class="btn primary block lg ${sel.length ? "" : "disabled"}" href="${sel.length ? `#/club/checkout?c=${g.club_id}` : "#/club/cart"}">Proceed to Checkout ${icon("arrow", "sm")}</a></section></section>`; }).join("")}
      <div class="alert green mt"><span class="a-ic">${icon("heart")}</span><div><b>Support Club Activities</b><p>Your purchase goes straight to the club and helps fund its events and initiatives.</p></div></div>`;
  };
  pages["club/cart"].mount = (el) => {
    const find = (k) => { const [pid, size, color] = JSON.parse(k); return cart.lines().find((l) => l.product_id === pid && l.size === size && l.color === color); };
    kit.$$("[data-sel]", el).forEach((b) => b.addEventListener("change", () => { cart.toggle(find(b.dataset.sel)); ctx.rerender(); }));
    kit.$$("[data-qty]", el).forEach((b) => b.addEventListener("click", () => { const l = find(b.dataset.qty); cart.setQty(l, l.qty + Number(b.dataset.d)); ctx.rerender(); }));
    kit.$$("[data-rm]", el).forEach((b) => b.addEventListener("click", () => { cart.setQty(find(b.dataset.rm), 0); ctx.rerender(); }));
    kit.$$("[data-coupon]", el).forEach((f) => f.addEventListener("submit", async (e) => {
      e.preventDefault(); const c = f.dataset.coupon, code = String(new FormData(f).get("code") || "").trim().toUpperCase();
      if (!code) { delete coupons[c]; return ctx.rerender(); }
      if (!kit.me()) return kit.toast("Sign in to use coupons", "info");
      try { const sub = subtotal(cart.lines().filter((l) => l.club_id === c && l.selected !== false)); coupons[c] = { code, amount: await api.checkCoupon(c, code, sub) }; ctx.rerender(); kit.toast("Coupon applied", "success"); }
      catch (err) { delete coupons[c]; kit.toast(err.message, "error"); ctx.rerender(); }
    }));
  };

  /* ═════════ Checkout ═════════ */
  let pay = null, phone = "";
  pages["club/checkout"] = () => {
    const g = kit.gate("checkout"); if (g) return g;
    const c = kit.param("c"), lines = cart.lines().filter((l) => l.club_id === c && l.selected !== false);
    if (!lines.length) return ui.emptyBox("cart", "Nothing to check out", "", `<a class="btn primary" href="#/club/cart">Back to cart</a>`);
    const ce = store.use(`clubid:${c}`, () => api.clubById(c), { ttl: 60e3 });
    return ui.view(ce, (club) => {
      const s = club.store_settings || {}, methods = methodsOf(club), nums = s.payment_numbers || {};
      if (!pay || !methods.includes(pay)) pay = methods[0] || null;
      const sub = lineTotal(lines), cp = coupons[c], disc = cp ? Math.min(sub, cp.amount) : 0, total = sub - disc;
      const me = ctx.S.profile || {}, email = kit.me()?.email || "";
      return `${kit.back("#/club/cart", "Cart")}${ui.ph("Checkout", `Complete your order to support ${esc(club.name)}.`)}
        <div class="cl-steps">${[["Cart", "done"], ["Pickup", "now"], ["Payment", ""], ["Confirm", ""]].map(([l, cl], i) => `<div class="${cl}"><span class="c">${cl === "done" ? icon("check", "sm") : i + 1}</span>${l}</div>`).join("")}</div>
        <form id="co" class="stack">
          <section class="card"><h2>1. Pickup</h2><div class="cl-pay mt-s"><label><input type="radio" name="mode" value="pickup" checked><span class="itile purple">${icon("building")}</span>Campus Pickup<span class="xs">Pick up from EWU campus</span></label>
              <label class="off" title="Clubs hand orders over on campus"><input type="radio" disabled><span class="itile gray">${icon("truck")}</span>Home Delivery<span class="xs">Not offered</span></label></div>
            ${ui.field("Pickup point", ui.select("pickup", (s.pickup_points?.length ? s.pickup_points : ["EWU campus"]).map((x) => [x, x]), s.pickup_points?.[0] || "EWU campus"))}
            <div class="alert blue"><span class="a-ic">${icon("info")}</span><div><p>You'll get a notification when your order is ready. Bring your student ID and the pickup QR.</p></div></div></section>
          <section class="card"><h2>2. Contact</h2>${ui.field("Full name", `<input class="input" value="${esc(me.name || kit.me()?.user_metadata?.name || "")}" readonly>`)}
            ${ui.field("Phone number", ui.input("phone", phone || "", 'type="tel" inputmode="tel" required placeholder="01XXXXXXXXX" autocomplete="tel"'), "The club uses this only for your order.")}${ui.field("Email", `<input class="input" value="${esc(email)}" readonly>`)}</section>
          <section class="card"><h2>3. Payment Method</h2>${methods.length ? `<div class="cl-pay mt-s">${Object.entries(METHODS).map(([m, l]) => `<label class="${methods.includes(m) ? "" : "off"}"><input type="radio" name="pay" value="${m}" ${pay === m ? "checked" : ""} ${methods.includes(m) ? "" : "disabled"}><span class="logo ${m}">${m === "cash" ? icon("wallet", "sm") : l[0]}</span>${esc(l)}</label>`).join("")}</div>
              ${pay && pay !== "cash" ? `<div class="alert purple mt-s"><span class="a-ic">${icon("phone")}</span><div class="grow"><b>Send ${ui.money(total)} to ${esc(nums[pay])} (${METHODS[pay]})</b><p>Use “Send Money” in your ${METHODS[pay]} app. Put your student ID as the reference, then type the transaction ID (TrxID) below. You can also add it later from your order.</p></div></div>
                ${ui.field("Transaction ID (TrxID)", ui.input("ref", "", 'maxlength="40" placeholder="9F3A2B7C1D" autocomplete="off" style="text-transform:uppercase"'))}` : pay === "cash" ? `<p class="small muted mt-s">Pay in cash when you pick the order up.</p>` : ""}`
            : `<p class="small muted">This club hasn't added a payment method yet.</p>`}</section>
          <section class="card cl-sum"><div class="row between"><h2>4. Order Summary</h2><a class="small" href="#/club/cart">Edit Cart</a></div>
            ${lines.map((l) => `<div><span>${esc(l.name)} <span class="xs">${esc([l.size, l.color].filter(Boolean).join(", "))} ×${l.qty}</span></span><b>${ui.money(l.price * l.qty)}</b></div>`).join("")}
            <div><span>Subtotal</span><b>${ui.money(sub)}</b></div>${disc ? `<div><span>Discount (${esc(cp.code)})</span><b>− ${ui.money(disc)}</b></div>` : ""}<div><span>Pickup</span><span style="color:var(--success-t)">Free</span></div>
            <div class="total"><span>Total</span><b>${ui.money(total)}</b></div></section>
          ${ui.field("Note for the club (optional)", ui.input("note", "", 'maxlength="300"'))}
          <div id="cl-err"></div><button class="btn primary block lg" ${methods.length ? "" : "disabled"}>${icon("lock", "sm")} Place Order</button>
          <p class="xs" style="text-align:center">Prices are checked again when you order. Payments go to the club directly; EWUdiots never handles money.</p></form>`;
    }, { n: 3, h: 140 });
  };
  pages["club/checkout"].mount = (el) => {
    const c = kit.param("c");
    kit.$$('[name="pay"]', el).forEach((r) => r.addEventListener("change", () => { pay = r.value; phone = kit.$('[name="phone"]', el)?.value || phone; ctx.rerender(); }));
    kit.$('[name="phone"]', el)?.addEventListener("input", (e) => { phone = e.target.value; });
    kit.$("#co", el)?.addEventListener("submit", async (e) => {
      e.preventDefault(); const f = ui.values(e.target), btn = e.target.querySelector("button.primary");
      const lines = cart.lines().filter((l) => l.club_id === c && l.selected !== false);
      if (!/^(\+?88)?01[3-9]\d{8}$/.test(String(f.phone || "").replace(/[^0-9+]/g, ""))) return ui.fail(el, "Enter a Bangladeshi mobile number like 01712345678.");
      ctx.busy(btn, true, "Placing order…");
      try {
        const o = await api.placeOrder(c, lines.map((l) => ({ product_id: l.product_id, size: l.size, color: l.color, qty: l.qty })), pay, f.ref || "", f.pickup, f.phone, coupons[c]?.code || "", f.note || "");
        cart.clearClub(c); delete coupons[c]; store.invalidate("store:", "me:orders"); kit.go(`#/club/order?id=${o.id}&placed=1`);
      } catch (err) { ctx.busy(btn, false); ui.fail(el, err.message); }
    });
  };

  /* ═════════ Order tracking ═════════ */
  pages["club/order"] = () => {
    const g = kit.gate("your order"); if (g) return g;
    const id = kit.param("id"), oe = store.use(`me:order:${id}`, () => api.order(id), { ttl: 30e3 });
    return ui.view(oe, (o) => {
      if (!o) return ui.emptyBox("bag", "Order not found", "");
      if (o.user_id !== kit.me()?.id) return `<a class="btn primary" href="#/club/orderadmin?id=${o.id}">Open in Orders Management</a>`;
      const ev = store.use(`me:order:ev:${id}`, () => api.orderEvents(id), { ttl: 30e3 }).value || [];
      const rets = store.use(`me:order:ret:${id}`, () => api.returnsFor(id), { ttl: 30e3 }).value || [];
      const s = o.clubs?.store_settings || {}, nums = s.payment_numbers || {}, steps = progress(o), ready = ["ready", "completed"].includes(o.status);
      const open = rets.find((r) => ["requested", "approved"].includes(r.status));
      return `${kit.param("placed") ? `<section class="card" style="text-align:center"><span class="itile green" style="margin:0 auto;width:64px;height:64px">${icon("checkc")}</span><h1 style="font-size:24px;margin-top:10px">Order Placed Successfully!</h1>
          <p class="muted">Thank you for supporting ${esc(o.clubs?.name || "the club")}! 💜 You'll get a notification when your order is ready.</p></section>` : kit.back("#/club/orders", "My orders")}
        ${ui.ph("Order Tracking", "Track your order status and pickup time.")}
        <section class="card row" style="gap:14px;flex-wrap:wrap"><span class="img" style="width:96px;height:96px;border-radius:14px;overflow:hidden;background:var(--surface-2);display:grid;place-items:center">${o.items[0]?.image ? `<img src="${esc(o.items[0].image)}" alt="" style="width:100%;height:100%;object-fit:cover">` : icon("bag")}</span>
          <div class="grow min0"><span class="xs">Order ID</span><h2 style="font-size:20px;white-space:nowrap">#${esc(o.code)}</h2><p class="xs">${ui.dateTime(o.created_at)}</p><div class="row mt-s" style="gap:6px">${ui.st(ORDER_STATUS[o.status])}${ui.st(PAYMENT_STATUS[o.payment_status])}</div></div>
          <div class="row" style="gap:6px;flex-basis:100%"><button class="btn sm outline" id="or-inv">${icon("file", "sm")} View Invoice</button><button class="btn sm ghost" id="or-share">${icon("share", "sm")} Share</button></div></section>
        ${o.status === "cancelled" ? `<div class="alert red mt"><span class="a-ic">${icon("xc")}</span><div><b>Cancelled</b><p>${esc(o.cancel_reason || "")}</p></div></div>`
          : `<div class="cl-steps mt">${steps.map((x, i) => `<div class="${x.done ? "done" : x.current ? "now" : ""}"><span class="c">${x.done ? icon("check", "sm") : i + 1}</span>${x.label}<small>${x.when ? ui.dateShort(x.when) : ""}</small></div>`).join("")}</div>`}
        ${!["cancelled", "completed", "ready"].includes(o.status) ? `<section class="card row nowrap" style="gap:14px">${icon("clock")}<div><span class="xs">Estimated Ready Time</span><b style="display:block;font-size:18px;color:var(--primary)">${o.eta ? ui.dateLong(o.eta) : "We'll let you know"}</b><span class="xs">You'll be notified when your order is ready for pickup.</span></div></section>` : ""}
        ${["unpaid", "rejected"].includes(o.payment_status) && o.payment_method !== "cash" && o.status !== "cancelled" ? `<section class="card mt"><h2>${o.payment_status === "rejected" ? "Payment not found, try again" : "Finish your payment"}</h2>
            <p class="small">Send <b>${ui.money(o.total)}</b> to <b>${esc(nums[o.payment_method] || "the club")}</b> (${METHODS[o.payment_method]}), then enter the transaction ID.</p>
            <form id="or-pay" class="row nowrap mt-s" style="gap:8px">${ui.input("ref", "", 'required maxlength="40" placeholder="TrxID" style="flex:1;text-transform:uppercase" aria-label="Transaction ID"')}<button class="btn primary">Submit</button></form></section>` : ""}
        <div class="cl-row2 mt"><section class="card"><div class="row nowrap" style="gap:10px">${icon("pin")}<div><b>Pickup Point</b><p class="small">${esc(o.pickup_point)}</p></div></div></section>
          <section class="cl-qrbox ${ready && o.status !== "completed" ? "" : "dim"}"><b>Pickup QR Code</b><div class="qr" aria-label="${ready ? "Pickup QR code" : "Available when your order is ready"}">${ui.qrSvg(ready ? pickupQr(o) : "ewud:o:locked")}</div>
            <span class="xs">${o.status === "completed" ? "Picked up — thank you!" : ready ? "Show this code and your student ID at the pickup point." : "This code becomes active when your order is ready."}</span></section></div>
        ${ui.sec("Order Items")}<section class="card cl-sum">${o.items.map((l) => `<div><span>${esc(l.name)} <span class="xs">${esc([l.size, l.color].filter(Boolean).join(", "))} ×${l.qty}</span></span><b>${ui.money(l.price * l.qty)}</b></div>`).join("")}
          <div><span>Subtotal</span><b>${ui.money(o.subtotal)}</b></div><div><span>Discount</span><b>− ${ui.money(o.discount)}</b></div><div><span>Pickup</span><span style="color:var(--success-t)">Free (campus pickup)</span></div><div class="total"><span>Total</span><b>${ui.money(o.total)}</b></div>
          <div><span>Payment</span><span>${METHODS[o.payment_method]}${o.payment_ref ? ` · ${esc(o.payment_ref)}` : ""}</span></div></section>
        ${rets.length ? `${ui.sec("Returns & Refunds")}<div class="cl-list">${rets.map((r) => `<div class="cl-li"><span class="itile sm amber">${icon("refund")}</span><span class="body"><b>#${esc(r.code)} · ${esc(RETURN_REASONS[r.reason])}</b><span>${esc(r.decision_note || r.details || "")}${r.status === "refunded" ? ` · Refunded ${ui.money(r.refund_amount)} (${esc(r.refund_method)})` : ""}</span></span>${ui.st(RETURN_STATUS[r.status])}</div>`).join("")}</div>` : ""}
        ${ev.length ? `${ui.sec("History")}<section class="card"><div class="cl-vtl">${ev.map((x) => `<div><span class="dot done">${icon("check")}</span><span><b>${esc(x.action.replace(/[._]/g, " "))}</b><span class="xs">${ui.dateTime(x.at)}${x.detail ? ` · ${esc(x.detail)}` : ""}</span></span><span></span></div>`).join("")}</div></section>` : ""}
        <div class="row mt" style="gap:8px;flex-wrap:wrap"><a class="btn outline" href="#/club/help?order=${o.code}">${icon("help")} Need Help?</a>
          ${buyerCanCancel(o) ? `<button class="btn ghost" id="or-cancel" style="color:var(--error)">${icon("xc")} Cancel Order</button>` : ""}
          ${canReturn(o, s.return_days ?? 7) && !open ? `<button class="btn outline" id="or-return">${icon("refund")} Request Return / Refund</button>` : ""}</div>`;
    }, { n: 3, h: 140 });
  };
  pages["club/order"].mount = (el) => {
    kit.bindRetry(el);
    const id = kit.param("id"), o = store.peek(`me:order:${id}`); if (!o || o.user_id !== kit.me()?.id) return;
    const reload = () => store.invalidate(`me:order:${id}`, "me:orders");
    kit.$("#or-pay", el)?.addEventListener("submit", async (e) => { e.preventDefault(); try { await api.submitPaymentRef(id, String(new FormData(e.target).get("ref") || "")); reload(); kit.toast("Sent to the club to verify", "success"); } catch (err) { kit.toast(err.message, "error"); } });
    kit.$("#or-cancel", el)?.addEventListener("click", () => ui.confirm("Cancel this order?", o.payment_status === "verified" ? "The club will refund your payment." : "The items go back on sale.", "Cancel order", async () => { await api.cancelMyOrder(id, "Cancelled by buyer"); reload(); }, true));
    kit.$("#or-return", el)?.addEventListener("click", () => requestReturn(o, reload));
    kit.$("#or-inv", el)?.addEventListener("click", () => invoice(o));
    kit.$("#or-share", el)?.addEventListener("click", async () => { const t = `My order ${o.code} from ${o.clubs?.name}`; try { if (navigator.share) await navigator.share({ title: t, text: t }); else { await navigator.clipboard.writeText(t); kit.toast("Copied", "success"); } } catch { /* cancelled */ } });
  };
  function requestReturn(o, reload) {
    ui.sheet("Request a return", `<form id="rr" class="stack">${ui.field("Reason", ui.select("reason", Object.entries(RETURN_REASONS).filter(([k]) => k !== "cancelled"), "wrong_size"))}
      ${ui.field("Tell the club what happened", ui.area("details", "", 'rows="3" maxlength="1000"'))}<button type="button" class="btn outline" id="rr-photo">${icon("image")} Add photos (up to 4)</button><span class="xs" id="rr-n"></span>
      <div id="cl-err"></div><button class="btn primary block">Send request</button></form>`, (s) => {
      const files = [];
      kit.$("#rr-photo", s).addEventListener("click", async () => { if (files.length >= 4) return; const f = await ui.pickFile("image/*"); if (f) { files.push(await ui.shrink(f)); kit.$("#rr-n", s).textContent = ui.plural(files.length, "photo"); } });
      kit.$("#rr", s).addEventListener("submit", async (e) => {
        e.preventDefault(); const f = ui.values(e.target), btn = e.target.querySelector("button.primary"); ctx.busy(btn, true, "Sending…");
        try { const ev = []; for (const x of files) ev.push(await api.uploadEvidence(o.club_id, x)); await api.requestReturn(o.id, f.reason, f.details || "", ev); ctx.closeModal(); reload(); kit.toast("Return requested", "success", "The club will review it."); }
        catch (err) { ctx.busy(btn, false); ui.fail(s, err.message); }
      });
    });
  }
  /** Printable invoice (the browser's print dialog can save it as a PDF). */
  function invoice(o) {
    const w = window.open("", "_blank", "width=720,height=900"); if (!w) return kit.toast("Allow pop-ups to see the invoice", "info");
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Invoice ${esc(o.code)}</title><style>body{font:14px/1.5 system-ui,sans-serif;max-width:640px;margin:32px auto;color:#0f172a}h1{font-size:22px;margin:0}table{width:100%;border-collapse:collapse;margin:18px 0}td,th{padding:8px;border-bottom:1px solid #e5e7eb;text-align:left}td:last-child,th:last-child{text-align:right}.tot td{font-weight:800;font-size:16px}.mut{color:#64748b;font-size:12px}</style>
      <h1>Invoice · ${esc(o.code)}</h1><p class="mut">${esc(o.clubs?.name || "")} · issued ${ui.dateLong(o.created_at)}<br>EWUdiots Club · Unofficial · not affiliated with EWU</p>
      <p><b>${esc(o.buyer_name)}</b>${o.student_id ? ` · ${esc(o.student_id)}` : ""}<br>Pickup: ${esc(o.pickup_point)}</p>
      <table><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>${o.items.map((l) => `<tr><td>${esc(l.name)} ${esc([l.size, l.color].filter(Boolean).join(", "))}</td><td>${l.qty}</td><td>${ui.money(l.price)}</td><td>${ui.money(l.price * l.qty)}</td></tr>`).join("")}
      <tr><td colspan="3">Subtotal</td><td>${ui.money(o.subtotal)}</td></tr><tr><td colspan="3">Discount</td><td>− ${ui.money(o.discount)}</td></tr><tr class="tot"><td colspan="3">Total</td><td>${ui.money(o.total)}</td></tr></table>
      <p>Payment: ${METHODS[o.payment_method]} · ${esc(PAYMENT_STATUS[o.payment_status][0])}${o.payment_ref ? ` · TrxID ${esc(o.payment_ref)}` : ""}</p>`);
    w.document.close(); w.focus(); w.print(); // the opener calls print: inline scripts are blocked by the app CSP
  }

  /* ═════════ My orders ═════════ */
  pages["club/orders"] = () => {
    const g = kit.gate("your orders"); if (g) return g;
    const oe = store.use("me:orders", api.myOrders, { ttl: 30e3 });
    return `${ui.ph("My Orders", "Merchandise you've ordered from clubs.", `<a class="btn outline" href="#/club/store">${icon("bag")} Store</a>`)}` + ui.view(oe, (rows) => (rows.length ? `<div class="cl-list">${rows.map((o) => `<a class="cl-li" href="#/club/order?id=${o.id}"><span class="itile purple">${icon("bag")}</span>
      <span class="body"><b>#${esc(o.code)} · ${esc(o.club_name)}</b><span>${esc(o.items.map((l) => `${l.name} ×${l.qty}`).join(", "))}</span></span><span class="end"><b>${ui.money(o.total)}</b>${ui.st(ORDER_STATUS[o.status])}</span></a>`).join("")}</div>`
      : ui.emptyBox("bag", "No orders yet", "Club merchandise you buy appears here.", `<a class="btn primary" href="#/club/store">Browse the store</a>`)));
  };
  pages["club/orders"].mount = (el) => kit.bindRetry(el);
}
