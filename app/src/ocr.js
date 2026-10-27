/* On-device OCR shared by screenshot sync and the ID card scan. The engine and English data are served from
   /tesseract/ (copied there at build time by vite.config.js), so reading works in the Android app and offline. */
let workerP = null, onProgress = () => {};
const worker = () => (workerP = workerP || import("tesseract.js")
  .then((T) => T.createWorker("eng", 1, {
    workerPath: "/tesseract/worker.min.js", corePath: "/tesseract/core", langPath: "/tesseract/lang", gzip: true,
    logger: (m) => m.status === "recognizing text" && onProgress(m.progress)
  }))
  .catch((e) => { workerP = null; throw new Error(`The text reader couldn't start (${e.message || e}). Check your connection and try again.`); }));

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
   (a phone screenshot of a desktop page) scaled up, since Tesseract reads best when letters are ~20-30 px tall. */
export async function prepImage(src) {
  const b = await bitmapOf(src), w = b.width, h = b.height;
  if (!w || !h) throw new Error("That image is empty.");
  let k = w < 1500 ? Math.min(2.5, 1900 / w) : 1;
  if (w * k * h * k > 16e6) k = Math.sqrt(16e6 / (w * h)); // stay within phone memory
  const c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
  const g = c.getContext("2d", { willReadFrequently: true });
  const probe = document.createElement("canvas"); probe.width = probe.height = 32;
  const pg = probe.getContext("2d", { willReadFrequently: true }); pg.drawImage(b, 0, 0, 32, 32);
  const px = pg.getImageData(0, 0, 32, 32).data; let lum = 0;
  for (let i = 0; i < px.length; i += 4) lum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  const dark = lum / (px.length / 4) < 110;
  g.imageSmoothingQuality = "high";
  g.filter = `grayscale(1)${dark ? " invert(1)" : ""} contrast(1.3)`;
  g.drawImage(b, 0, 0, c.width, c.height);
  b.close?.();
  return c;
}

/* Read the text in an image (File, Blob or data URL). onProg gets 0…1 while recognising. */
export async function readText(src, onProg = () => {}) {
  const [w, img] = await Promise.all([worker(), prepImage(src)]);
  onProgress = onProg;
  try { const { data } = await w.recognize(img); return data.text || ""; }
  finally { onProgress = () => {}; }
}
