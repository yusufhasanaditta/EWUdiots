/* Static reference data + clearly-labelled demo content.
   Real data comes from portal sync and the shared backend. */
import { currentSemester } from "./parser.js";
import { dkey } from "./study.js";

// EWU grade points (from Fall-2023 scale on the official grade report).
// Marks thresholds vary by course outline — verify with your faculty.
export const GRADES = [
  { g: "A+", p: 4.00, min: 80 }, { g: "A", p: 3.75, min: 75 }, { g: "A-", p: 3.50, min: 70 },
  { g: "B+", p: 3.25, min: 65 }, { g: "B", p: 3.00, min: 60 }, { g: "B-", p: 2.75, min: 55 },
  { g: "C+", p: 2.50, min: 50 }, { g: "C", p: 2.25, min: 45 }, { g: "D", p: 2.00, min: 40 },
  { g: "F", p: 0.00, min: 0 }
];
// Grades that never count toward CGPA (Pass, Satisfactory, Unsatisfactory, Retaken, Incomplete, Withdrawal)
export const NON_GPA = new Set(["P", "S", "U", "R", "I", "W"]);

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEK = [6, 0, 1, 2, 3, 4]; // Sat → Thu
export const SLOTS = ["08:30-10:00", "10:10-11:40", "11:50-13:20", "13:30-15:00", "15:10-16:40", "16:50-18:20"];

export const DEMO = {
  profile: {
    name: "Demo Student", id: "2026-2-60-000", program: "B.Sc. in Computer Science and Engineering", department: "CSE",
    semester: currentSemester(), advisor: "Dr. Sample Advisor", advisorInitial: "SAMP", email: "demo.student@example.com",
    creditsDone: 33, creditsTotal: 140, cgpa: 3.52, source: "demo"
  },
  routine: [
    { code: "CSE207", title: "Data Structures", sec: "3", days: "MW", start: "10:10", end: "11:40", room: "AB2-702", faculty: "NHR" },
    { code: "CSE207", title: "Data Structures", sec: "3", days: "R", start: "08:30", end: "10:30", room: "AB3-501 (Lab)", faculty: "NHR", lab: true },
    { code: "CSE209", title: "Electrical Circuits", sec: "1", days: "ST", start: "11:50", end: "13:20", room: "FUB-603", faculty: "SAK" },
    { code: "MAT205", title: "Linear Algebra", sec: "4", days: "ST", start: "13:30", end: "15:00", room: "FUB-203", faculty: "MZH" },
    { code: "STA102", title: "Statistics", sec: "2", days: "MW", start: "08:30", end: "10:00", room: "AB1-301", faculty: "FRB" },
    { code: "ENG7102", title: "Composition II", sec: "11", days: "TR", start: "15:10", end: "16:40", room: "AB1-201", faculty: "TJN" }
  ],
  grades: [
    { sem: "Summer-2025", code: "CSE103", title: "Structured Programming", cr: 4.5, g: "A" },
    { sem: "Summer-2025", code: "MAT101", title: "Differential & Integral Calculus", cr: 3, g: "A-" },
    { sem: "Summer-2025", code: "ENG099", title: "Remedial English", cr: 0, g: "P" },
    { sem: "Fall-2025", code: "CSE106", title: "Discrete Mathematics", cr: 3, g: "A+" },
    { sem: "Fall-2025", code: "PHY109", title: "Engineering Physics", cr: 4, g: "B+" },
    { sem: "Fall-2025", code: "ENG7101", title: "Composition I", cr: 3, g: "B" },
    { sem: "Spring-2026", code: "CSE110", title: "Object Oriented Programming", cr: 4.5, g: "A" },
    { sem: "Spring-2026", code: "MAT102", title: "Coordinate Geometry & Vectors", cr: 3, g: "B+" },
    { sem: "Spring-2026", code: "CHE109", title: "Engineering Chemistry", cr: 4, g: "A-" },
    { sem: "Summer-2026", code: "MAT104", title: "Differential Equations", cr: 3, g: "A" }
  ],
  degree: [
    { category: "Basic Science Courses", done: 8, total: 11 }, { category: "Mathematics and Statistics Courses", done: 9, total: 15 },
    { category: "Compulsory Language and General Education Courses", done: 3, total: 9 }, { category: "Elective General Education Courses", done: 0, total: 9 },
    { category: "Core Computer Science and Engineering Courses", done: 12, total: 62 }, { category: "Capstone Project", done: 0, total: 6 }
  ],
  rules: { maxCredit: 15, minCredit: 9, maxPerDay: 3, maxCourses: 6, minCourses: 3 },
  // Fictional faculty — the live directory is crowd-sourced from class-schedule syncs.
  faculty: [
    { init: "NHR", name: "Dr. Nadia H. Rahman (demo)", dept: "CSE", email: "nhr@example.com", room: "Room 642", hours: "Sun & Tue 12:00–1:30", rating: 4.7, reviews: 128 },
    { init: "SAK", name: "Sabbir A. Khan (demo)", dept: "EEE", email: "sak@example.com", room: "Room 538", hours: "Mon & Wed 3:00–4:30", rating: 4.2, reviews: 64 },
    { init: "MZH", name: "Dr. M. Zahid Hossain (demo)", dept: "MPS", email: "mzh@example.com", room: "Room 455", hours: "Sun & Tue 3:00–4:30", rating: 3.9, reviews: 91 },
    { init: "FRB", name: "Farhana R. Bushra (demo)", dept: "MPS", email: "frb@example.com", room: "Room 318", hours: "Mon & Wed 10:10–11:40", rating: 4.5, reviews: 52 },
    { init: "TJN", name: "Tasnim J. Noor (demo)", dept: "ENG", email: "tjn@example.com", room: "Room 120", hours: "Sat 2:00–3:30", rating: 4.8, reviews: 77 },
    { init: "NSA", name: "Dr. Nusrat S. Alam (demo)", dept: "CSE", email: "nsa@example.com", room: "Room 640", hours: "Mon & Wed 12:00–1:30", rating: 4.6, reviews: 143 }
  ],
  offered: {
    CSE246: { title: "Algorithms", cr: 3, sections: [
      { sec: "1", days: "ST", start: "08:30", end: "10:00", faculty: "NSA", room: "AB2-702", seats: 4, capacity: 40 },
      { sec: "2", days: "MW", start: "10:10", end: "11:40", faculty: "NHR", room: "AB2-703", seats: 12, capacity: 40 },
      { sec: "3", days: "ST", start: "15:10", end: "16:40", faculty: "NHR", room: "AB2-704", seats: 0, capacity: 40 } ] },
    CSE251: { title: "Electronic Circuits", cr: 4, sections: [
      { sec: "1", days: "MW", start: "08:30", end: "10:00", faculty: "SAK", room: "FUB-603", seats: 9, capacity: 35, lab: { days: "R", start: "11:50", end: "13:50" } },
      { sec: "2", days: "ST", start: "11:50", end: "13:20", faculty: "SAK", room: "FUB-604", seats: 15, capacity: 35, lab: { days: "A", start: "08:30", end: "10:30" } } ] },
    CSE325: { title: "Operating Systems", cr: 4, sections: [
      { sec: "1", days: "ST", start: "10:10", end: "11:40", faculty: "NHR", room: "AB3-301", seats: 3, capacity: 40, lab: { days: "R", start: "08:30", end: "10:30" } },
      { sec: "2", days: "MW", start: "11:50", end: "13:20", faculty: "NSA", room: "AB3-302", seats: 18, capacity: 40, lab: { days: "A", start: "13:30", end: "15:30" } },
      { sec: "3", days: "ST", start: "13:30", end: "15:00", faculty: "NSA", room: "AB3-303", seats: 7, capacity: 40, lab: { days: "R", start: "11:50", end: "13:50" } } ] },
    MAT205: { title: "Linear Algebra", cr: 3, sections: [
      { sec: "1", days: "MW", start: "10:10", end: "11:40", faculty: "MZH", room: "FUB-203", seats: 20, capacity: 45 },
      { sec: "2", days: "ST", start: "08:30", end: "10:00", faculty: "FRB", room: "FUB-204", seats: 11, capacity: 45 },
      { sec: "3", days: "TR", start: "13:30", end: "15:00", faculty: "MZH", room: "FUB-205", seats: 2, capacity: 45 } ] },
    GEN226: { title: "Emerging Technology & Society", cr: 3, sections: [
      { sec: "1", days: "A", start: "08:30", end: "11:40", faculty: "TJN", room: "AB1-110", seats: 25, capacity: 45 },
      { sec: "2", days: "MW", start: "15:10", end: "16:40", faculty: "TJN", room: "AB1-111", seats: 8, capacity: 45 } ] }
  },
  vault: [
    { id: "d1", course: "CSE207", type: "Notes", title: "Trees & graphs — handwritten notes", votes: 142, size_bytes: 4400000 },
    { id: "d2", course: "CSE207", type: "Past paper", title: "Mid-term questions (3 semesters)", votes: 210, size_bytes: 1150000 },
    { id: "d3", course: "CSE209", type: "Slides", title: "Thevenin & Norton — lecture slides", votes: 88, size_bytes: 7100000 },
    { id: "d4", course: "MAT205", type: "Solutions", title: "Eigenvalues practice set — solved", votes: 97, size_bytes: 2500000 },
    { id: "d5", course: "STA102", type: "Cheat sheet", title: "Probability distributions on one page", votes: 175, size_bytes: 300000 }
  ],
  // Fictional study history so the demo shows streaks, the heatmap and due flashcards.
  study(examId) {
    const courses = ["CSE207", "MAT205", "STA102", "CSE209", "ENG7102"];
    const pattern = [50, 75, 25, 100, 50, 0, 125, 50, 25, 75, 0, 50, 100, 25];
    const sessions = [], days = {};
    for (let i = 0; i < 120; i++) {
      const min = i < 9 ? [50, 75, 25, 100, 50, 50, 25, 75, 50][i] : pattern[(i * 5) % pattern.length];
      if (!min) continue;
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(i === 3 ? 23 : 20, 15, 0, 0);
      if (i === 0) d.setTime(Math.min(d.getTime(), Date.now()));
      const k = dkey(d);
      for (let left = min, j = 0; left > 0; j++) {
        const m = Math.min(left, 25 + (j % 2) * 25); left -= m;
        sessions.push({ id: `ds${i}-${j}`, course: courses[(i + j) % courses.length], min: m, at: d.toISOString() });
      }
      days[k] = { m: min, c: i < 4 ? 12 : 0 };
    }
    const today = dkey(), later = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return dkey(d); };
    const card = (course, f, b, due = today, ivl = 0) => ({ id: "dc" + Math.random().toString(36).slice(2, 9), course, f, b, due, ivl, ease: 2.5, reps: ivl ? 2 : 0, created: Date.now() });
    return {
      sessions, days, goal: 120, reviews: 64, xp: 1240, ambient: "off",
      cards: [
        card("CSE207", "Time complexity of binary search?", "O(log n)"),
        card("CSE207", "Stack vs queue: which order does each follow?", "Stack: LIFO (last in, first out). Queue: FIFO (first in, first out)."),
        card("CSE207", "Worst-case time of quicksort?", "O(n²), when the pivot is always the smallest or largest element."),
        card("CSE207", "What is a hash collision?", "Two different keys map to the same bucket.", later(4), 4),
        card("CSE207", "Height of a balanced BST with n nodes?", "About log₂ n", later(9), 9),
        card("MAT205", "When is a square matrix invertible?", "When its determinant is not zero."),
        card("MAT205", "What is the rank of a matrix?", "The number of linearly independent rows (or columns)."),
        card("MAT205", "Write the eigenvalue equation.", "Av = λv, with v ≠ 0", later(2), 3),
        card("STA102", "Mean or median: which resists outliers?", "The median."),
        card("STA102", "Population variance formula?", "σ² = Σ(x − μ)² / N"),
        card("STA102", "What is a p-value?", "The probability of a result at least this extreme if the null hypothesis is true.", later(6), 6),
        card("STA102", "Standard deviation of a data set where every value is equal?", "0", later(21), 21)
      ],
      prep: { [examId]: { topics: [{ id: "t1", name: "Matrices & determinants", conf: 3 }, { id: "t2", name: "Vector spaces", conf: 2 }, { id: "t3", name: "Eigenvalues", conf: 1 }, { id: "t4", name: "Linear transformations", conf: 1 }], done: {} } },
      notes: { CSE207: "Mid-term covers: arrays, linked lists, stacks, queues and recursion.\nLab: bring the BST code next Thursday.\nTrees and graphs will be on the final." },
      links: { CSE207: [{ title: "Course outline (demo link)", url: "https://example.com/cse207-outline" }] }
    };
  }
};
