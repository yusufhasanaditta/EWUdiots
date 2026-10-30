/* EWUdiots Club: camera QR scanner for event check-in and merch pickup. Uses the browser's BarcodeDetector (Chrome and
   Android WebView); where it's missing, screens fall back to typing the ticket code or searching by name. */

export const canScan = () => typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;

/**
 * Start the back camera in a <video> and call onCode(text) for each new QR code seen (the same code is reported once).
 * @param {HTMLVideoElement} video @param {(text: string) => void} onCode
 * @param {{ facing?: "environment"|"user", torch?: boolean }} [opts]
 * @returns {Promise<{ stop: () => void, flip: () => Promise<void>, torch: (on: boolean) => Promise<boolean> }>}
 */
export async function startScanner(video, onCode, { facing = "environment" } = {}) {
  if (!canScan()) throw new Error("This browser can't read QR codes. Type the code instead.");
  const det = new window.BarcodeDetector({ formats: ["qr_code"] });
  let stream = null, alive = true, last = "", lastAt = 0, mode = facing;
  const open = async () => {
    stream?.getTracks().forEach((t) => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode } });
    video.srcObject = stream; video.hidden = false; await video.play();
  };
  await open();
  const tick = async () => {
    if (!alive) return;
    if (!document.body.contains(video)) return stop();
    const codes = await det.detect(video).catch(() => []);
    const text = codes[0]?.rawValue;
    // The same code is ignored for 4 s, so one QR held in front of the camera isn't scanned twice.
    if (text && (text !== last || Date.now() - lastAt > 4000)) { last = text; lastAt = Date.now(); onCode(text); }
    setTimeout(() => requestAnimationFrame(tick), 250);
  };
  tick();
  function stop() { alive = false; stream?.getTracks().forEach((t) => t.stop()); video.srcObject = null; }
  return {
    stop,
    flip: async () => { mode = mode === "environment" ? "user" : "environment"; await open(); },
    torch: async (on) => { const t = stream?.getVideoTracks()[0]; try { await t.applyConstraints({ advanced: [{ torch: on }] }); return true; } catch { return false; } }
  };
}
