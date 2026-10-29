/* Runs on portal.ewubd.edu. Reads only academic lines from the page the
   student is looking at. An allow-list keeps everything else out — phone,
   address, national ID, date of birth, blood group, photo, passwords. */
(() => {
  const clean = (s) => String(s || "").replace(/[ \t ]+/g, " ").trim();

  // Course and class-time rows. The code must open the row (after an optional serial
  // number) and be written the portal's way, CSE106 / AIML501, so address fragments
  // like "PO 1212" or "DHK 3400" never pass as a course.
  const COURSE_ROW = /^(\d{1,3}\t)?[A-Z]{3,4}\d{3,4}[A-Z]?\b/;
  const TIME = /\d{1,2}[:.]\d{2}\s*(AM|PM)?\s*-/i;
  const DEGREE_ROW = /\(\s*Out of\s*[\d.]+\s*\)/i;
  // Fee rows: an Accounts Ledger line (a semester and a money amount) or an installment with its date and amount,
  // and the header rows that name their columns.
  const MONEY = /\d[\d,]*\.\d{2}\b/;
  const LEDGER_ROW = (l) => /\b(Spring|Summer|Fall)[- ]?\d{4}\b/i.test(l) && MONEY.test(l) && l.includes("\t");
  const INSTALL_ROW = (l) => /instal?l?ment/i.test(l) && MONEY.test(l) && /\d{1,2}[/ -]([A-Za-z]{3}|\d{1,2})[/ -]\d{2,4}/.test(l);
  const FEE_HEAD = /Voucher\s*Type|\bDebit\b.*\bCredit\b|Instal?l?ment.*(Amount|Date)|(Amount|Date).*Instal?l?ment/i;
  // Lines (or table cells) that may leave the page. Anything not matching is discarded.
  const ALLOW = [
    COURSE_ROW, TIME, DEGREE_ROW,
    /^(Spring|Summer|Fall)[- ]\d{4}$|^\d{4}\s+(Spring|Summer|Fall)$/i,   // semester headers / selected semester
    /^Hi,\s/,                                                            // "Hi, <name>" header
    /^(Student\s*)?Name\s*[:\t]/i,
    /\b(EWU|Student)\s*ID\b|\bID#/i,
    /^(Program|Department|Degree Objective)\s*[:\t]/i,
    /\bCGPA\b|Credits?\s*(completed|earned)|Cr\s*(Atn|Earn)|Minimum Credits Required|Min Credit Required|Remaining Credit/i,
    /^Advis[eo]r\s*[:\t]?/i, /^\s*[A-Za-z0-9._%+-]+@ewubd\.edu\s*$/,       // advisor + their work email
    /^\s*\d{4}-\d-\d{2}-\d{3}@std\.ewubd\.edu\s*$/,                      // student email
    /Admitted\s*Semester/i,
    /(Max|Min)\s*(Credit|Course|Courses per day)|Minimum CGPA Required/i,
    /Grand\s*Total|Tuition Fee|Laboratory Fee|Student Activity Fee|Library Fee/i,
    /Prerequisite|Recommended Courses|\bCapacity\b|Dedicated department|Class Schedule|Grade Report|Deposit Slip/i
  ];
  const DENY = /National\s*ID|\bNID\b|Unique\s*ID|Date\s*of\s*Birth|Blood\s*Group|Marital|Addres|Phone|Mobile|Passport|Father|Mother|Guardian|Password/i;
  const allowed = (s) => ALLOW.some((re) => re.test(s));
  // Course rows hold no personal details, so a title like "Mobile Application
  // Development" is not mistaken for a phone field.
  const wholeRow = (l) => COURSE_ROW.test(l) || TIME.test(l) || DEGREE_ROW.test(l) || LEDGER_ROW(l) || INSTALL_ROW(l) || (FEE_HEAD.test(l) && !/\d{4}-\d-\d{2}-\d{3}/.test(l));
  const blocked = (l) => DENY.test(l) && !wholeRow(l);

  // Other table rows are filtered cell by cell: the Grade Report prints the guardian's
  // name and home address in the same rows as "Grade Report:" and "EWU ID:".
  function keep(line) {
    if (!line || blocked(line)) return "";
    if (!line.includes("\t")) return allowed(line) || INSTALL_ROW(line) ? line : "";
    if (wholeRow(line)) return line;
    const cells = line.split("\t"), out = [];
    for (let i = 0; i < cells.length; i++) {
      if (!allowed(cells[i])) continue;
      out.push(cells[i]);
      // A bare label ("EWU ID:", "Grand Total") takes the next cell as its value, plus any
      // number/date cells after it ("Last Date:", "24/9/2026", "87700.00"). Text cells stop it.
      if (/\d/.test(cells[i]) || i + 1 >= cells.length || allowed(cells[i + 1])) continue;
      out.push(cells[++i]);
      while (i + 1 < cells.length && cells[i + 1] && !/[A-Za-z]/.test(cells[i + 1])) out.push(cells[++i]);
    }
    return out.join("\t");
  }

  // Which portal page this is. Checked against the whole page (not stored).
  const KINDS = [
    ["ledger", "Accounts Ledger", (p, t) => /Ledger/i.test(p) || /Voucher\s*Type/i.test(t)],
    ["installment", "Installments", (p, t) => /Instal?l?ment/i.test(p)],
    ["curriculum", "Curriculum", (p, t) => /Curricul/i.test(p)],
    ["slip", "Advising Slip", (p, t) => /AdvisingSlip/i.test(p) || /Deposit\s*Slip/i.test(t)],
    ["grades", "Grade Report", (p, t) => /GradeSheet/i.test(p) || /Term\s*GPA/i.test(t)],
    ["degree", "Degree Review", (p, t) => /DegreeReview/i.test(p) || /Out\s*of\s*\d/i.test(t)],
    ["offered", "Offered Courses", (p, t) => /OfferedCourses/i.test(p) && /\d+\s*\/\s*\d+/.test(t)],
    ["schedule", "Class Schedule", (p, t) => /Faculty\s*Initial/i.test(t)],
    ["rules", "Advising Rules", (p, t) => /Max\s*Course/i.test(t) && /Min\s*Credit/i.test(t)],
    ["preadvising", "Pre-Advising", (p, t) => /PreCourseRegistration/i.test(p) || /Prerequisite/i.test(t)],
    ["profile", "Profile", (p, t) => /\/Home\/Profile/i.test(p) || /Admitted\s*Semester/i.test(t)]
  ];

  // The live page's innerText renders table rows as tab-separated lines and
  // never includes form-field values (so typed passwords are never read).
  function pageLines() {
    let lines = document.body.innerText.split("\n").map((l) => l.split("\t").map(clean).join("\t").replace(/^\t+|\t+$/g, ""));
    // A <select> shows every option; keep only the chosen one (e.g. the semester).
    for (const s of document.querySelectorAll("select")) {
      const opts = [...s.options].map((o) => clean(o.text));
      const i = opts.length > 1 ? lines.findIndex((_, k) => opts.every((o, j) => lines[k + j] === o)) : -1;
      if (i >= 0) lines.splice(i, opts.length, clean(s.selectedOptions[0]?.text));
    }
    // Sidebar and tab links ("OFFERED COURSES", "GRADE REPORT"…) are menus, not data.
    const menu = new Set([...document.querySelectorAll("nav a, li > a, [role=navigation] a")]
      .map((a) => clean(a.innerText)).filter((t) => t && !/[\d@]/.test(t)));
    lines = lines.filter((l) => !menu.has(l));
    // Read-only boxes (Degree Review's CGPA, Cr Earn…) aren't in innerText: add "Label: value".
    for (const el of document.querySelectorAll("input")) {
      if (/^(password|hidden|file|checkbox|radio|submit|button|image|reset|search)$/i.test(el.type) || !(el.readOnly || el.disabled)) continue;
      const label = labelOf(el), value = clean(el.value);
      if (label && value) lines.push(`${label.replace(/\s*:\s*$/, "")}: ${value}`);
    }
    return lines;
  }
  function labelOf(el) {
    if (el.labels && el.labels[0]) return clean(el.labels[0].innerText);
    for (let n = el, depth = 0; n && depth < 3; n = n.parentElement, depth++) {
      for (let s = n.previousElementSibling; s; s = s.previousElementSibling) {
        if (s.matches("input, select, textarea") || s.querySelector("input")) return "";
        const t = clean((s.innerText || "").split("\n").pop());
        if (t) return t;
      }
    }
    return "";
  }

  function scrape() {
    const lines = pageLines();
    const kept = [];
    let skip = 0;
    lines.forEach((l, i) => {
      // After a blocked label ("PRESENT ADDRESS", "National ID:"…) drop the value lines that follow it.
      if (blocked(l)) { skip = /[:\t]\s*\S/.test(l) ? 0 : /addres/i.test(l) ? 3 : 1; return; }
      if (skip > 0 && l && !l.includes("\t")) { skip--; return; }
      // Re-join "Label:" + value split across lines (e.g. "Advisor:" ⏎ "Dr. X(ABC)")
      if (/:\s*$/.test(l) && lines[i + 1] && !blocked(lines[i + 1]) && !/:\s*$/.test(lines[i + 1])) l = `${l} ${lines[i + 1]}`;
      const k = keep(l);
      if (k) kept.push(k);
    });
    const all = lines.join("\n");
    const kind = KINDS.find(([, , test]) => test(location.pathname, all));
    return {
      kind: kind ? kind[0] : "", page: kind ? kind[1] : clean(document.title) || location.pathname,
      path: location.pathname, at: new Date().toISOString(), text: [...new Set(kept)].join("\n")
    };
  }

  // One storage entry per page ("page:<kind>"), so frames saving at the same time
  // can't overwrite each other's pages.
  async function save(data) {
    const key = "page:" + (data.kind || location.pathname + location.search.replace(/token=[^&]+/, ""));
    const old = (await chrome.storage.local.get(key))[key];
    if (old && old.text === data.text) return false;
    await chrome.storage.local.set({ [key]: data });
    return true;
  }
  async function syncNow() {
    const data = scrape();
    if (!data.text) return { ok: false, page: data.page };
    await save(data);
    return { ok: true, page: data.page, lines: data.text.split("\n").length };
  }

  // Popup "Save this page now". Frames with data answer at once; the top frame answers
  // "nothing here" only after a pause, so a report iframe that has the data wins.
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (!msg || msg.type !== "EWUD_SCRAPE") return;
    syncNow().then((r) => {
      if (r.ok) reply(r);
      else if (window.top === window) setTimeout(() => reply(r), 600);
    }).catch(() => window.top === window && reply({ ok: false }));
    return true;
  });

  // Auto-save: portal tables load after "Show Courses", so watch for changes and
  // save each recognised page once its data is on screen. Stored on this computer only.
  let timer = 0, firstChange = 0, auto = true;
  chrome.storage.local.get("auto").then((r) => { auto = r.auto ?? true; });
  chrome.storage.onChanged.addListener((c) => { if (c.auto) auto = c.auto.newValue ?? true; });
  async function autoSave() {
    firstChange = 0;
    if (!auto) return;
    const data = scrape();
    if (!data.kind || !/\d/.test(data.text)) return;
    if (await save(data)) flash(`✓ Saved ${data.page}`);
  }
  // Waits for the page to settle, but never more than 3 s on pages that keep changing.
  const queue = () => {
    const now = Date.now();
    firstChange = firstChange || now;
    clearTimeout(timer);
    timer = setTimeout(() => autoSave().catch(() => {}), Math.min(900, firstChange + 3000 - now));
  };
  new MutationObserver((ms) => ms.some((m) => !btn || !btn.contains(m.target)) && queue()).observe(document.body, { childList: true, subtree: true, characterData: true });
  queue();

  // Report pages may show their data in an iframe: the top-frame button asks frames too.
  window.addEventListener("message", (e) => {
    if (e.source !== window.parent || !e.data || e.data.type !== "EWUD_FRAME_SYNC") return;
    syncNow().then((r) => r.ok && window.parent.postMessage({ type: "EWUD_FRAME_SAVED", page: r.page, lines: r.lines }, "*")).catch(() => {});
  });

  // One-tap button on the portal (top frame only)
  let btn = null;
  function flash(text) {
    if (!btn) return;
    btn.textContent = text;
    clearTimeout(btn._t); btn._t = setTimeout(() => { btn.disabled = false; btn.textContent = "Sync to EWUdiots"; }, 2600);
  }
  if (window.top !== window) return;
  window.addEventListener("message", (e) => {
    if (e.data && e.data.type === "EWUD_FRAME_SAVED" && [...window.frames].includes(e.source)) flash(`✓ Saved ${e.data.page} (${e.data.lines} lines)`);
  });
  btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "Sync to EWUdiots";
  btn.setAttribute("aria-label", "Sync this portal page to EWUdiots");
  btn.setAttribute("aria-live", "polite");
  Object.assign(btn.style, { position: "fixed", right: "18px", bottom: "18px", zIndex: 2147483647, padding: "11px 18px", borderRadius: "12px", border: "0", background: "#5B3DF5", color: "#fff", font: "700 14px system-ui, sans-serif", boxShadow: "0 6px 20px rgba(0,0,0,.25)", cursor: "pointer" });
  btn.addEventListener("click", async () => {
    btn.disabled = true; btn.textContent = "Reading page…";
    try {
      const r = await syncNow();
      if (r.ok) return flash(`✓ Saved ${r.page} (${r.lines} lines)`);
      [...window.frames].forEach((f) => f.postMessage({ type: "EWUD_FRAME_SYNC" }, "*"));
      flash("Nothing to sync on this page. If it has a Show button, press it first.");
    } catch { flash("Sync failed — reload and retry"); }
  });
  document.documentElement.appendChild(btn);
})();
