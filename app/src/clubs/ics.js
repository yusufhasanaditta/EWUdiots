/* EWUdiots Club: "Add to calendar" as an .ics file (works with Google Calendar, Outlook and phone calendars). */

const stamp = (d) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
// RFC 5545: escape \ ; , and newlines; fold lines at 75 octets.
const text = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const fold = (line) => { const out = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = " " + s.slice(74); } out.push(s); return out.join("\r\n"); };

/** @param {{ id: string, title: string, starts_at: string, ends_at?: string|null, venue?: string, description?: string, url?: string }} e */
export function toICS(e, now = new Date()) {
  const end = e.ends_at || new Date(new Date(e.starts_at).getTime() + 2 * 36e5).toISOString();
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//EWUdiots//Club//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:${e.id}@ewudiots`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(e.starts_at)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${text(e.title)}`, e.venue ? `LOCATION:${text(e.venue)}` : "", e.description ? `DESCRIPTION:${text(e.description).slice(0, 1500)}` : "", e.url ? `URL:${e.url}` : "",
    "BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY", `DESCRIPTION:${text(e.title)}`, "END:VALARM", "END:VEVENT", "END:VCALENDAR"].filter(Boolean).map(fold).join("\r\n") + "\r\n";
}
