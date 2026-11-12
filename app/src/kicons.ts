/* Feature-tile icons from Kubai Icons (MIT, kubai-icons): layered, gradient icons that move when their tile is
   hovered. Used on feature tiles (Home quick access, More, desktop shortcuts, the website's feature grid); buttons,
   navigation and inline icons stay on the Phosphor set (icons.js). Only the icons listed here are bundled.
   Rendering is string-based: tileIcon() writes a placeholder, hydrate() swaps placeholders for live icons after
   each paint. Kubai's runtime already respects prefers-reduced-motion. */
import { replaceIcons, type KubaiIconData } from "kubai-icons";
import award from "kubai-icons/icons/award";
import chartBar from "kubai-icons/icons/chart-bar";
import bell from "kubai-icons/icons/bell";
import bookOpen from "kubai-icons/icons/book-open";
import briefcase from "kubai-icons/icons/briefcase";
import building from "kubai-icons/icons/building";
import calendarCheck from "kubai-icons/icons/calendar-check";
import calendar from "kubai-icons/icons/calendar";
import graduationCap from "kubai-icons/icons/graduation-cap";
import layers from "kubai-icons/icons/layers";
import chartLine from "kubai-icons/icons/chart-line";
import clipboardCheck from "kubai-icons/icons/clipboard-check";
import alarmClock from "kubai-icons/icons/alarm-clock";
import users from "kubai-icons/icons/users";
import door from "kubai-icons/icons/door";
import fileCheck from "kubai-icons/icons/file-check";
import folder from "kubai-icons/icons/folder";
import flame from "kubai-icons/icons/flame";
import globe from "kubai-icons/icons/globe";
import heart from "kubai-icons/icons/heart";
import map from "kubai-icons/icons/map";
import megaphone from "kubai-icons/icons/megaphone";
import notebook from "kubai-icons/icons/notebook";
import receipt from "kubai-icons/icons/receipt";
import school from "kubai-icons/icons/school";
import target from "kubai-icons/icons/target";
import trophy from "kubai-icons/icons/trophy";
import user from "kubai-icons/icons/user";
import safe from "kubai-icons/icons/safe";
import wallet from "kubai-icons/icons/wallet";

const SET: KubaiIconData[] = [award, chartBar, bell, bookOpen, briefcase, building, calendarCheck, calendar, graduationCap, layers, chartLine,
  clipboardCheck, alarmClock, users, door, fileCheck, folder, flame, globe, heart, map, megaphone, notebook, receipt, school, target, trophy, user, safe, wallet];
const ICONS: Record<string, KubaiIconData> = Object.fromEntries(SET.map((i) => [i.name, i]));

/** App icon name (Phosphor set) → Kubai icon name. Anything not listed keeps its Phosphor icon. */
export const KUBAI_FOR: Readonly<Record<string, string>> = {
  award: "award", bars: "chart-bar", bell: "bell", book: "book-open", briefcase: "briefcase", building: "building", calcheck: "calendar-check",
  calendar: "calendar", cap: "graduation-cap", cards: "layers", chart: "chart-line", clipboard: "clipboard-check", listcheck: "clipboard-check",
  clock: "alarm-clock", community: "users", users: "users", door: "door", exam: "file-check", file: "folder", flame: "flame", globe: "globe",
  heart: "heart", map: "map", megaphone: "megaphone", notes: "notebook", receipt: "receipt", school: "school", target: "target",
  trophy: "trophy", user: "user", vault: "safe", wallet: "wallet"
};

/** Tile tone (DESIGN.md icon-tile tones) → the icon's accent colour. */
export const TONE: Readonly<Record<string, string>> = {
  purple: "#7c3aed", blue: "#3b82f6", green: "#16a34a", orange: "#f97316", pink: "#ec4899", teal: "#0891b2", yellow: "#ca8a04", amber: "#d97706", red: "#ef4444"
};

/** Placeholder for a tile's icon, or "" when there is no Kubai icon for it (the caller keeps its own icon). */
export function kubaiPlaceholder(ic: string, tone: string, size = 26): string {
  const name = KUBAI_FOR[ic];
  if (!name || !ICONS[name]) return "";
  return `<span data-kubai="${name}" data-size="${size}" data-color="${TONE[tone] || TONE.purple}" data-trigger="parent"></span>`;
}

/** Swap every placeholder under `root` for a live icon (hover on the nearest [data-kubai-trigger] animates it). */
export function hydrate(root: ParentNode = document): void {
  if (root.querySelector("[data-kubai]")) replaceIcons({ icons: ICONS, root });
}
