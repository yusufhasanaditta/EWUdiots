/* Runs on the EWUdiots web app. Hands saved portal pages to the app when it
   asks (same-window postMessage only), then the app parses them. */
(() => {
  const target = location.origin;
  const ready = () => window.postMessage({ type: "EWUD_EXT_READY", version: chrome.runtime.getManifest().version }, target);

  window.addEventListener("message", async (e) => {
    if (e.source !== window || e.origin !== location.origin || !e.data) return;
    if (e.data.type === "EWUD_APP_PING") ready();
    if (e.data.type === "EWUD_APP_REQUEST") {
      const all = await chrome.storage.local.get(null); // portal.js stores each page as "page:<kind>"
      const list = Object.entries(all).filter(([k]) => k.startsWith("page:")).map(([, p]) => ({ page: p.page, text: p.text }));
      window.postMessage({ type: "EWUD_EXT_DATA", payload: { pages: list } }, target);
    }
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready); else ready();
})();
