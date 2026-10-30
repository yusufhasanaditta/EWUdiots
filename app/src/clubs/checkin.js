/* EWUdiots Club: rotating attendance codes. The screen at a meeting shows a 6-digit code (and a QR of it) that changes
   every 30 seconds; members type or scan it. The database checks the same code in public.club_checkin:
   first 8 hex digits of sha256("<secret>:<window>") as a number, mod 1 000 000, zero-padded. */

export const WINDOW_MS = 30_000;
export const windowOf = (now = Date.now()) => Math.floor(now / WINDOW_MS);
/** Seconds until the code changes. */
export const secondsLeft = (now = Date.now()) => Math.ceil((WINDOW_MS - (now % WINDOW_MS)) / 1000);

/** @param {string} secret @param {number} win @returns {Promise<string>} */
export async function codeFor(secret, win) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${secret}:${win}`));
  const hex = [...new Uint8Array(buf).slice(0, 4)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return String(parseInt(hex, 16) % 1_000_000).padStart(6, "0");
}

const PREFIX = "ewudiots-club:checkin:";
export const qrText = (sessionId, code) => `${PREFIX}${sessionId}:${code}`;
/** @returns {{ sessionId: string, code: string } | null} */
export function parseQr(text) {
  const m = String(text || "").trim().match(/^ewudiots-club:checkin:([0-9a-f-]{36}):(\d{6})$/i);
  return m ? { sessionId: m[1].toLowerCase(), code: m[2] } : null;
}
