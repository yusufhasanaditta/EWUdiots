import { defineConfig } from "vite";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
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

export default defineConfig({
  plugins: [ewuApi()],
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
