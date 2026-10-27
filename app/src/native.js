/* Native (Android/iOS via Capacitor) integrations with web fallbacks. */
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Share } from "@capacitor/share";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { App } from "@capacitor/app";

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // "web" | "android" | "ios"

export async function boot({ dark, onBack }) {
  if (!isNative) return;
  try {
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    if (platform === "android") await StatusBar.setBackgroundColor({ color: dark ? "#0E0C1D" : "#F6F5FB" });
  } catch { /* status bar unavailable */ }
  SplashScreen.hide().catch(() => {});
  // Close a dialog or return to the dashboard first; exit only from the dashboard.
  App.addListener("backButton", () => { if (!onBack()) App.exitApp(); });
}

export async function notificationsAllowed() {
  if (isNative) return (await LocalNotifications.checkPermissions()).display === "granted";
  return "Notification" in window && Notification.permission === "granted";
}
export async function askNotifications() {
  if (isNative) return (await LocalNotifications.requestPermissions()).display === "granted";
  if (!("Notification" in window)) return false;
  return (await Notification.requestPermission()) === "granted";
}

/* Stable numeric ids so re-scheduling replaces instead of duplicating. */
const hashId = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) % 2000000000; };

/**
 * Replace all scheduled reminders.
 * classes: [{ code, title, room, day (0=Sun), s (minutes), offsets: [minutes before…] }]
 * items:   [{ key, title, body, at: Date }]  (deadlines, exams, payments)
 * Class alarms go to their own high-importance channel, so they ring and pop up like an alarm.
 */
const before = (m) => (m >= 60 && m % 60 === 0 ? `${m / 60} hour${m === 60 ? "" : "s"}` : m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
let channel = false;
export async function scheduleAll({ classes = [], minutesBefore = 10, items = [] }) {
  if (!isNative) return false;
  if (!(await notificationsAllowed())) return false;
  if (!channel && platform === "android") { await LocalNotifications.createChannel({ id: "class-alarms", name: "Class alarms", description: "Warns you before each class, as early as you choose", importance: 5, visibility: 1, vibration: true, lights: true, lightColor: "#7C3AED" }).catch(() => {}); channel = true; }
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  const list = [];
  for (const c of classes) for (const off of c.offsets || [minutesBefore]) {
    let m = c.s - off, day = c.day;
    while (m < 0) { m += 1440; day = (day + 6) % 7; }
    list.push({ id: hashId(`c|${c.code}|${c.day}|${c.s}|${off}`), title: `⏰ ${c.code} starts in ${before(off)}`, body: [c.title, c.room && `Room ${c.room}`].filter(Boolean).join(" · "),
      smallIcon: "ic_stat_notify", channelId: "class-alarms", schedule: { on: { weekday: day + 1, hour: Math.floor(m / 60), minute: m % 60 }, allowWhileIdle: true } });
  }
  const now = Date.now();
  for (const it of items) if (it.at.getTime() > now) list.push({ id: hashId(`i|${it.key}`), title: it.title, body: it.body, smallIcon: "ic_stat_notify", schedule: { at: it.at, allowWhileIdle: true } });
  if (list.length) await LocalNotifications.schedule({ notifications: list.slice(0, 60) }); // iOS caps pending notifications at 64
  return true;
}

export async function share({ title, text, url }) {
  if (isNative) return Share.share({ title, text, url, dialogTitle: title });
  if (navigator.share) return navigator.share({ title, text, url });
  await navigator.clipboard.writeText([text, url].filter(Boolean).join("\n"));
  return "copied";
}
