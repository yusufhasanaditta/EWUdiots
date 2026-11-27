// Offline support: pages network-first, static assets stale-while-revalidate.
const CACHE = "ewudiots-v4";

// Background push: show the notification even when the app is closed, and open the right page on tap.
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "EWUdiots", {
    body: d.body || "", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png",
    tag: d.tag || undefined, data: { url: d.url || "/app.html#/notifications" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/app.html#/notifications";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    const open = cs.find((c) => c.url.includes("/app.html"));
    if (open) { open.focus(); open.postMessage({ nav: url }); return undefined; }
    return self.clients.openWindow(url);
  }));
});
const SHELL = ["/app.html", "/manifest.webmanifest", "/icons/icon-192.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || (url.origin !== location.origin && !url.host.includes("fonts.g"))) return;
  if (url.pathname === "/version.json" || url.pathname.startsWith("/api/")) return; // always fresh from the network
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then((r) => r || caches.match("/app.html"))));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; }).catch(() => hit);
    return hit || net;
  }));
});
