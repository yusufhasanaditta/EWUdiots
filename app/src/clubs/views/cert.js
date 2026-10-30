/* Certificates: drawn on a canvas as a PNG (works offline and on phones, no PDF library), each with a QR code to the
   public check page (#/club/cert?code=…), which anyone can open to confirm it's real (public.verify_certificate). */
import qrcode from "qrcode-generator";

const W = 1754, H = 1240; // A4 landscape at 150 dpi

const loadImg = (src) => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });
function fit(g, text, font, size, max) { let s = size; do { g.font = `${font.replace("{s}", s)}`; s -= 2; } while (g.measureText(text).width > max && s > 18); }

/**
 * @param {{ recipient: string, title: string, event?: string, club: string, issued_on: string, signer?: string, code: string, color?: string }} c
 * @param {string} site e.g. https://ewudiots.vercel.app
 * @returns {Promise<Blob>}
 */
export async function drawCertificate(c, site) {
  const cv = Object.assign(document.createElement("canvas"), { width: W, height: H }), g = cv.getContext("2d");
  const accent = /^#[0-9a-f]{6}$/i.test(c.color || "") ? c.color : "#7C3AED";
  g.fillStyle = "#fffdf8"; g.fillRect(0, 0, W, H);
  // Frame
  g.strokeStyle = accent; g.lineWidth = 18; g.strokeRect(40, 40, W - 80, H - 80);
  g.strokeStyle = "#d6c9a5"; g.lineWidth = 3; g.strokeRect(74, 74, W - 148, H - 148);
  g.fillStyle = accent; g.globalAlpha = 0.08; g.beginPath(); g.arc(W - 120, 120, 300, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(120, H - 120, 240, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
  g.textAlign = "center"; g.fillStyle = "#1f2937";
  g.font = "600 34px Inter, 'Segoe UI', Arial, sans-serif"; g.fillText(c.club.toUpperCase(), W / 2, 210);
  g.fillStyle = accent; fit(g, c.title, "700 {s}px Georgia, 'Times New Roman', serif", 84, W - 360); g.fillText(c.title, W / 2, 340);
  g.fillStyle = "#4b5563"; g.font = "400 34px Inter, 'Segoe UI', Arial, sans-serif"; g.fillText("This is presented to", W / 2, 450);
  g.fillStyle = "#111827"; fit(g, c.recipient, "700 {s}px Georgia, 'Times New Roman', serif", 96, W - 400); g.fillText(c.recipient, W / 2, 580);
  g.strokeStyle = "#d6c9a5"; g.lineWidth = 2; g.beginPath(); g.moveTo(W / 2 - 420, 615); g.lineTo(W / 2 + 420, 615); g.stroke();
  if (c.event) { g.fillStyle = "#374151"; fit(g, `for ${c.event}`, "400 {s}px Inter, 'Segoe UI', Arial, sans-serif", 38, W - 400); g.fillText(`for ${c.event}`, W / 2, 690); }
  const date = new Date(c.issued_on).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  g.font = "400 30px Inter, 'Segoe UI', Arial, sans-serif"; g.fillStyle = "#4b5563";
  g.fillText(date, W / 2 - 380, 940); g.fillText(c.signer || c.club, W / 2 + 380, 940);
  g.beginPath(); g.moveTo(W / 2 - 560, 880); g.lineTo(W / 2 - 200, 880); g.moveTo(W / 2 + 200, 880); g.lineTo(W / 2 + 560, 880); g.stroke();
  g.font = "600 22px Inter, 'Segoe UI', Arial, sans-serif"; g.fillStyle = "#9ca3af"; g.fillText("DATE", W / 2 - 380, 980); g.fillText("SIGNED", W / 2 + 380, 980);
  // Verification
  const url = `${site}/app.html#/club/cert?code=${encodeURIComponent(c.code)}`;
  const q = qrcode(0, "M"); q.addData(url); q.make();
  const qr = await loadImg(q.createDataURL(6, 2)).catch(() => null);
  if (qr) g.drawImage(qr, W - 300, H - 330, 190, 190);
  g.textAlign = "left"; g.fillStyle = "#6b7280"; g.font = "400 22px Inter, 'Segoe UI', Arial, sans-serif";
  g.fillText(`Certificate ID ${c.code} · check it at ${site.replace(/^https:\/\//, "")}`, 120, H - 130);
  g.fillText("Issued through EWUdiots Club · unofficial, not affiliated with East West University", 120, H - 98);
  return new Promise((r) => cv.toBlob(r, "image/png"));
}

/** @param {Record<string, any>} pages @param {any} kit */
export function register(pages, kit) {
  const { ui, icon, esc, api, store } = kit;
  pages["club/cert"] = () => {
    const code = String(kit.param("code") || "").trim().toUpperCase();
    const head = kit.head("Check a certificate", "Certificates from EWUdiots Club carry an ID. Enter it to see who it was issued to.");
    const form = `<form id="ct-form" class="row nowrap" style="gap:8px"><input class="input grow" name="code" value="${esc(code)}" placeholder="Certificate ID, e.g. 3F9A1C0B7D" maxlength="20" autocomplete="off"><button class="btn primary">${icon("search")} Check</button></form>`;
    if (!api) return head + kit.gate("certificates");
    if (!code) return head + `<section class="card">${form}</section>`;
    return head + `<section class="card">${form}</section><div class="mt">${ui.view(store.use(`cert:${code}`, () => api.verifyCert(code), { ttl: 5 * 60e3 }), (c) => (c
      ? `<section class="card cl-verify ok"><span class="itile green">${icon("checkc")}</span><div><b>Real certificate</b><p class="mt-s"><b>${esc(c.recipient)}</b> · ${esc(c.title)}${c.event ? ` for ${esc(c.event)}` : ""}</p><p class="small muted">Issued by ${esc(c.club)} on ${ui.dateLong(c.issued_on)}${c.signer ? ` · signed ${esc(c.signer)}` : ""}</p></div></section>`
      : `<section class="card cl-verify bad"><span class="itile red">${icon("x")}</span><div><b>No certificate with this ID</b><p class="small muted">Check the ID on the certificate. If it's right, the certificate wasn't issued through EWUdiots Club or was withdrawn.</p></div></section>`))}</div>`;
  };
  pages["club/cert"].mount = (el) => {
    kit.$("#ct-form", el)?.addEventListener("submit", (e) => { e.preventDefault(); kit.go(`#/club/cert?code=${encodeURIComponent(e.target.code.value.trim().toUpperCase())}`); });
    kit.bindRetry(el);
  };
}
