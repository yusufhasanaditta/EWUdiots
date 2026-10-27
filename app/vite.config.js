import { defineConfig } from "vite";
import { resolve, dirname } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { fetchNotices, parseNotices, NOTICE_SOURCE } from "./src/notices.js";
import { fetchNews, parseNews, NEWS_SOURCE } from "./src/news.js";

/* /api/notices and /api/news outside Vercel (vite dev + preview), same data as api/*.js.
   Tests set NOTICES_FIXTURE / NEWS_FIXTURE to saved pages so they don't depend on ewubd.edu. */
const ewuApi = () => {
  const feeds = {
    "/api/notices": { key: "notices", source: NOTICE_SOURCE, fixture: "NOTICES_FIXTURE", parse: parseNotices, live: () => fetchNotices(2) },
    "/api/news": { key: "news", source: NEWS_SOURCE, fixture: "NEWS_FIXTURE", parse: parseNews, live: () => fetchNews(2) }
  };
  const cache = {};
  const handle = async (req, res, next) => {
    const path = req.url.split("?")[0], f = feeds[path];
    if (!f) return next();
    res.setHeader("content-type", "application/json");
    try {
      if (!cache[path] || Date.now() - cache[path].at > 30 * 60e3) {
        const fx = process.env[f.fixture];
        cache[path] = { at: Date.now(), items: fx ? f.parse(readFileSync(fx, "utf8")) : await f.live() };
      }
      res.end(JSON.stringify({ source: f.source, fetched: new Date(cache[path].at).toISOString(), [f.key]: cache[path].items }));
    } catch (e) { res.statusCode = 502; res.end(JSON.stringify({ error: String(e.message), [f.key]: [] })); }
  };
  return { name: "ewu-api", configureServer: (s) => { s.middlewares.use(handle); }, configurePreviewServer: (s) => { s.middlewares.use(handle); } };
};

/* Self-hosted OCR engine (tesseract.js worker, WASM core, English data) under /tesseract/, so screenshot and
   ID-card scanning work inside the Android app and offline instead of depending on a CDN. */
const OCR_FILES = [
  ["tesseract.js/dist/worker.min.js", "worker.min.js"],
  ...["lstm", "simd-lstm", "relaxedsimd-lstm"].map((v) => [`tesseract.js-core/tesseract-core-${v}.wasm.js`, `core/tesseract-core-${v}.wasm.js`]),
  ["@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "lang/eng.traineddata.gz"]
];
const ocrAssets = () => {
  const src = (f) => resolve(import.meta.dirname, "node_modules", f);
  const serve = (req, res, next) => {
    const hit = OCR_FILES.find(([, to]) => req.url.split("?")[0] === "/tesseract/" + to);
    if (!hit) return next();
    res.setHeader("content-type", hit[1].endsWith(".gz") ? "application/octet-stream" : "text/javascript");
    res.end(readFileSync(src(hit[0])));
  };
  return {
    name: "ocr-assets",
    configureServer: (s) => { s.middlewares.use(serve); },
    writeBundle: (opts) => OCR_FILES.forEach(([from, to]) => {
      const out = resolve(opts.dir, "tesseract", to);
      mkdirSync(dirname(out), { recursive: true });
      copyFileSync(src(from), out);
    })
  };
};

/* /version.json: what's newest. The phone app offers the new APK, an open web app offers a refresh, and the Chrome
   extension offers its new zip. Notes and the required minimum version come from release.json. */
const readJSON = (p) => JSON.parse(readFileSync(resolve(import.meta.dirname, p), "utf8"));
const versionFile = () => ({
  name: "version-file",
  writeBundle: (opts) => {
    const { notes = [], minVersion = "0.0.0" } = readJSON("release.json");
    writeFileSync(resolve(opts.dir, "version.json"), JSON.stringify({ version: readJSON("package.json").version, minVersion, notes, apk: "/download/android",
      extension: readJSON("../extension/manifest.json").version, extensionZip: "/download/extension", at: new Date().toISOString() }));
  }
});

export default defineConfig({
  plugins: [ewuApi(), ocrAssets(), versionFile()],
  define: { __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(resolve(import.meta.dirname, "package.json"), "utf8")).version) },
  build: {
    target: "es2020",
    rollupOptions: {
      input: {
        site: resolve(import.meta.dirname, "index.html"),
        app: resolve(import.meta.dirname, "app.html"),
        admin: resolve(import.meta.dirname, "admin.html"),
        privacy: resolve(import.meta.dirname, "privacy.html"),
        terms: resolve(import.meta.dirname, "terms.html"),
        deleteAccount: resolve(import.meta.dirname, "delete-account.html")
      }
    }
  },
  server: { port: 5500 }
});
