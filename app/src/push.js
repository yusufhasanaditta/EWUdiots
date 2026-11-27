/* Web push: subscribe this browser/PWA to background notifications (works when the app is closed) using the Web Push
   standard and our VAPID public key. The subscription is saved to the database; the server (api/push.js) sends to it.
   No Firebase is needed for web. Android push (FCM) is wired separately once a Firebase project exists. */
const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

const urlB64ToUint8 = (s) => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

export const pushAvailable = () => Boolean(VAPID) && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/* Subscribe this browser and hand the subscription to `save` (cloud.savePush). Returns true when subscribed. */
export async function subscribePush(save) {
  if (!pushAvailable()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(VAPID) });
    const j = sub.toJSON();
    if (!j.endpoint) return false;
    await save({ endpoint: j.endpoint, keys: j.keys || {}, kind: "web" });
    return true;
  } catch { return false; }
}

/* Remove this browser's subscription (on sign-out or when the user turns notifications off). */
export async function unsubscribePush(remove) {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await remove(sub.endpoint).catch(() => {}); await sub.unsubscribe(); }
  } catch { /* nothing to remove */ }
}
