/* On-device OCR shared by screenshot sync and the ID card scan. The engine and English data are served from
   /tesseract/ (copied there at build time by vite.config.js), so reading works in the Android app and offline.
   Phones are the hard case: a low-memory WebView can kill the reader mid-scan, which used to leave the scan waiting
   forever. Every read now has a time limit; a reader that stops answering is thrown away and the read is tried once
   more on a smaller picture, and the first-time download (~5 MB) reports its own progress. */
let workerP = null, onProgress = () => {}, onStage = () => {};
const PHONE = /Android|iPhone|iPad|Mobile/i.test(globalThis.navigator?.userAgent || "");
const LOW_MEMORY = PHONE || (globalThis.navigator?.deviceMemory || 8) <= 4;
const READ_TIMEOUT = 75e3, START_TIMEOUT = 90e3;

const withTimeout = (p, ms, msg) => new Promise((ok, fail) => {
  const t = setTimeout(() => fail(Object.assign(new Error(msg), { timeout: true })), ms);
  p.then((v) => { clearTimeout(t); ok(v); }, (e) => { clearTimeout(t); fail(e); });
});

function startWorker(lstmOnly) {
  return import("tesseract.js").then((T) => T.createWorker("eng", 1, {
    workerPath: "/tesseract/worker.min.js", langPath: "/tesseract/lang", gzip: false,
    // The plain LSTM build is the fallback for WebViews where the SIMD build fails to start.
    corePath: lstmOnly ? "/tesseract/core/tesseract-core-lstm.wasm.js" : "/tesseract/core",
    logger: (m) => {
      if (m.status === "recognizing text") onProgress(m.progress);
      else if (/loading (tesseract core|language traineddata)/.test(m.status)) onStage("download", m.progress || 0);
      else if (/initializ/.test(m.status)) onStage("start", m.progress || 0);
    }
  }));
}
function worker() {
  if (!workerP) {
    workerP = withTimeout(startWorker(false).catch(() => startWorker(true)), START_TIMEOUT, "The text reader took too long to start.")
      .catch((e) => { workerP = null; throw new Error(`The text reader couldn't start (${e.message || e}). Check your connection and try again.`); });
  }
  return workerP;
}
/* Throw the current reader away (it stopped answering or crashed); the next read starts a fresh one. */
async function resetWorker() {
  const p = workerP; workerP = null;
  try { (await p)?.terminate(); } catch { /* already gone */ }
}

const IMAGE_NAME = /\.(png|jpe?g|webp|gif|bmp|heic|heif|avif)$/i;
// Phone galleries sometimes hand over screenshots with an empty or generic type, so the name counts too.
export const isImageFile = (f) => /^image\//.test(f.type) || (!f.type || f.type === "application/octet-stream") && IMAGE_NAME.test(f.name || "");

async function bitmapOf(src) {
  if (typeof src === "string") {
    const img = new Image(); img.src = src; await img.decode(); return img;
  }
  try { return await createImageBitmap(src); }
  catch {
    const url = URL.createObjectURL(src), img = new Image(); img.src = url;
    try { await img.decode(); return img; }
    catch { throw new Error("This picture's format can't be read here. Save the screenshot as PNG or JPG and try again."); }
    finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
  }
}

/* Make a screenshot easy to read: grayscale, more contrast, dark mode flipped to dark-on-light, and small text
   (a phone screenshot of a desktop page) scaled up, since Tesseract reads best when letters are ~20-30 px tall.
   maxPx caps the canvas: phones get a smaller budget so the WebView isn't killed for memory. */
export async function prepImage(src, boost = false, rotate = 0, maxPx = LOW_MEMORY ? 10e6 : 16e6) {
  const b = await bitmapOf(src), w = b.width, h = b.height;
  if (!w || !h) throw new Error("That image is empty.");
  // boost: a second, bigger pass for zoomed-out pages (tiny text) when the first pass missed rows.
  let k = boost ? (w < 1800 ? Math.min(3, 2600 / w) : 1.4) : w < 1500 ? Math.min(2.5, 1900 / w) : 1;
  if (w * k * h * k > maxPx) k = Math.sqrt(maxPx / (w * h)); // stay within phone memory
  // rotate (90/180/270): a card photographed sideways is read upright.
  const turn = rotate % 180 !== 0, W = Math.round(w * k), H = Math.round(h * k);
  const c = document.createElement("canvas"); c.width = turn ? H : W; c.height = turn ? W : H;
  const g = c.getContext("2d", { willReadFrequently: true });
  const probe = document.createElement("canvas"); probe.width = probe.height = 32;
  const pg = probe.getContext("2d", { willReadFrequently: true }); pg.drawImage(b, 0, 0, 32, 32);
  const px = pg.getImageData(0, 0, 32, 32).data; let lum = 0;
  for (let i = 0; i < px.length; i += 4) lum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  const dark = lum / (px.length / 4) < 110;
  g.imageSmoothingQuality = "high";
  g.filter = `grayscale(1)${dark ? " invert(1)" : ""} contrast(1.3)`;
  if (rotate) { g.translate(c.width / 2, c.height / 2); g.rotate((rotate * Math.PI) / 180); g.translate(-W / 2, -H / 2); }
  g.drawImage(b, 0, 0, W, H);
  b.close?.();
  return c;
}

/* Read the text in an image (File, Blob or data URL). onProg gets 0…1 while recognising; onStep(stage, 0…1) reports
   "download" (first use only) and "start" while the reader gets ready. */
export async function readText(src, onProg = () => {}, { boost = false, rotate = 0, onStep = () => {} } = {}) {
  const attempt = async (maxPx) => {
    onStage = onStep;
    const [w, img] = await Promise.all([worker(), prepImage(src, boost, rotate, maxPx)]);
    onStage = () => {}; onProgress = onProg;
    try { const { data } = await withTimeout(w.recognize(img), READ_TIMEOUT, "Reading the picture took too long."); return data.text || ""; }
    finally { onProgress = () => {}; img.width = img.height = 0; /* free the canvas memory now */ }
  };
  try { return await attempt(); }
  catch (e) {
    if (!e.timeout && !/memory|terminated|abort/i.test(String(e.message || e))) throw e;
    await resetWorker(); // the old reader is stuck or gone: start fresh with a smaller picture
    try { return await attempt(3e6); }
    catch (e2) { await resetWorker(); throw new Error(e2.timeout ? "Reading the picture took too long on this phone. Crop it closer to the text and try again." : e2.message); }
  }
}
