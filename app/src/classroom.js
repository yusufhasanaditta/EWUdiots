/* Google Classroom import: which Classroom course is which EWU course, and Classroom posts → course materials and
   deadlines. Pure (the network calls are in ui-classroom.js): unit-tested in tests/classroom.test.js. */
export const SCOPES = ["https://www.googleapis.com/auth/classroom.courses.readonly", "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
  "https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly", "https://www.googleapis.com/auth/classroom.topics.readonly"].join(" ");
export const API = "https://classroom.googleapis.com/v1";

/* "CSE106 Sec 3 (Fall 2026)", "CSE 106 – Discrete Math", "Discrete Mathematics [MAT 205]" → "CSE106". */
export function courseCodeOf(course) {
  const t = `${course.name || ""} ${course.section || ""} ${course.descriptionHeading || ""}`;
  const m = t.match(/\b([A-Z]{2,4})\s?-?\s?(\d{3,4}[A-Z]?)\b/);
  return m ? m[1] + m[2] : "";
}
export const sectionOf = (course) => (`${course.name || ""} ${course.section || ""}`.match(/\b(?:sec(?:tion)?|sec\.)\s*[-:#]?\s*(\d{1,2})\b/i) || [])[1] || "";

const typeOf = (title, isWork, workType) => isWork ? (/MULTIPLE_CHOICE|SHORT_ANSWER/.test(workType || "") || /quiz|question/i.test(title) ? "Question" : "Assignment")
  : /slide|lecture|\.pptx?\b|ppt/i.test(title) ? "Slides" : /syllabus|outline|course plan/i.test(title) ? "Syllabus" : /book|chapter/i.test(title) ? "Book" : /video|youtube|recording/i.test(title) ? "Video" : /past|previous.*(paper|question)/i.test(title) ? "Past paper" : "Notes";

/* The first link inside a post: a Drive file, a link, a YouTube video or a Form. Falls back to the post itself. */
function firstLink(item) {
  for (const m of item.materials || []) {
    const d = m.driveFile?.driveFile, l = m.link, y = m.youtubeVideo, f = m.form;
    if (d?.alternateLink) return { url: d.alternateLink, title: d.title };
    if (l?.url) return { url: l.url, title: l.title };
    if (y?.alternateLink) return { url: y.alternateLink, title: y.title };
    if (f?.formUrl) return { url: f.formUrl, title: f.title };
  }
  return { url: item.alternateLink || "", title: "" };
}

/* Classroom posts → rows for the shared course materials (resources table). */
export function toMaterials({ course, code, topics = [], materials = [], work = [], info = {} }) {
  const topicName = new Map(topics.map((t) => [t.topicId, t.name]));
  const row = (item, isWork) => {
    const l = firstLink(item), title = String(item.title || l.title || "Untitled").slice(0, 120);
    return { ext_id: `gc:${course.id}:${item.id}`.slice(0, 123), course: code, type: typeOf(`${title} ${l.title || ""}`, isWork, item.workType), title: title.length < 3 ? `${title} (Classroom)` : title,
      topic: String(topicName.get(item.topicId) || "").slice(0, 80), description: String(item.description || "").slice(0, 1000), link: /^https:\/\//.test(l.url) ? l.url : "",
      source: "classroom", faculty: info.faculty || "", section: String(info.sec || sectionOf(course)).slice(0, 6), semester: info.sem || "" };
  };
  return [...materials.map((m) => row(m, false)), ...work.map((w) => row(w, true))].filter((r) => r.link);
}

/* Assignments with a due date → the app's own Deadlines (tasks). */
export function toTasks({ code, work = [] }) {
  return work.filter((w) => w.dueDate?.year).map((w) => {
    const d = w.dueDate, t = w.dueTime || {};
    const due = new Date(Date.UTC(d.year, d.month - 1, d.day, t.hours ?? 17, t.minutes ?? 59)); // Classroom times are UTC; no time = end of day
    return { id: `gc-${w.id}`, title: String(w.title || "Assignment").slice(0, 120), course: code, type: /quiz/i.test(w.title || "") ? "Quiz" : "Assignment", due: due.toISOString(), done: false, link: w.alternateLink || "", source: "classroom" };
  });
}
