import { defineConfig } from "vite";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fetchNotices, parseNotices, NOTICE_SOURCE } from "./src/notices.js";

/* /api/notices outside Vercel (vite dev + preview): same data as api/notices.js. Tests set NOTICES_FIXTURE to a saved page. */
const noticesApi = () => {
  let cache = null;
  const handle = async (req, res, next) => {
    if (!req.url.startsWith("/api/notices")) return next();
    try {
      if (!cache || Date.now() - cache.at > 30 * 60e3) {
        const fx = process.env.NOTICES_FIXTURE;
        cache = { at: Date.now(), notices: fx ? parseNotices(readFileSync(fx, "utf8")) : await fetchNotices(2) };
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ source: NOTICE_SOURCE, fetched: new Date(cache.at).toISOString(), notices: cache.notices }));
    } catch (e) { res.statusCode = 502; res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ error: String(e.message), notices: [] })); }
  };
  return { name: "ewu-notices", configureServer: (s) => { s.middlewares.use(handle); }, configurePreviewServer: (s) => { s.middlewares.use(handle); } };
};

export default defineConfig({
  plugins: [noticesApi()],
  build: {
    target: "es2020",
    rollupOptions: {
      input: {
        site: resolve(import.meta.dirname, "index.html"),
        app: resolve(import.meta.dirname, "app.html"),
        privacy: resolve(import.meta.dirname, "privacy.html"),
        terms: resolve(import.meta.dirname, "terms.html"),
        deleteAccount: resolve(import.meta.dirname, "delete-account.html")
      }
    }
  },
  server: { port: 5500 }
});
