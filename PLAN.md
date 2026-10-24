# EWUdiots: product plan & status

_Last updated 5 Oct 2026 (v1.1)_

## Decisions
| Topic | Decision | Why |
|---|---|---|
| Name | **EWUdiots**, always shown with "Unofficial" | Your choice. The disclaimer avoids impersonation flags in the stores. |
| Brand | Ultraviolet `#5B3DF5` + Lime `#C8F04A`, winking-graduate mascot | Playful, and clearly different from EWU's navy |
| Platforms | Website + installable web app + **Android (Play Store) first**. iOS-ready, publish later. | Matches your choice. One codebase. |
| App tech | Vite + vanilla JS, wrapped with **Capacitor** for Android/iOS | Same code everywhere. No rewrite needed for iOS. |
| Backend | **Supabase**: Postgres + row-level security, email-code login, storage, edge functions | Relational data (sections, reviews, ratings), free tier, Singapore region |
| Login | 6-digit code to **@std.ewubd.edu** email, enforced in the database | Only real EWU students can post. No Google login, so Apple won't require "Sign in with Apple". |
| Local-first | Everything works offline and without an account. Signing in adds backup and shared features. | Privacy, faster onboarding, app review passes without login |
| Screenshot reading | On-device OCR (Tesseract) by default. **Smart scan** (Claude vision, server-side) for signed-in users, 20 per day. | Free and private by default, accurate when needed |
| Privacy | Allow-list extraction. Phone, address, NID, DOB, blood group, photo and password are never read. | The real portal pages show all of these |

## What the portal screenshots taught us (now built in)
- Day letters **S M T W R F A** (Sun–Sat). Times like `MW 1:30PM-3:00PM` and `F 03:00 PM - 06:00 PM`.
- Rooms `FUB-903`, `AB2-702`, `215 (General Purpose Programming Lab)`. Codes can be 4 letters or 4 digits (`AIML501`, `ENG7101`).
- Class Schedule includes **faculty initials, names and emails**, which crowd-sources the faculty directory.
- Advising Slip has tuition, fees and **payment deadlines with late-fee steps** → Fees page and reminders.
- Grade Report uses the Fall-2023 scale (A+ 4.00 … D 2.00). P, S, U, R, I and W don't count toward CGPA.
- Degree Review gives credits per requirement category → degree progress bars.
- Advising Rules give max/min credit and **max courses per day** → enforced by the planner.
- Offered Courses show capacity `19 / 40` → live seat counts in the planner.
- Pre-Advising lists recommended courses with prerequisites → highlighted in the planner.

## Feature status
✅ built and tested · 🔌 built, needs your Supabase project · ⏳ next

| Feature | Status |
|---|---|
| Sync: screenshot (OCR), paste, Chrome extension, review-before-save | ✅ |
| Smart scan (AI screenshot reading) | 🔌 |
| Dashboard: next-class countdown, today, deadlines, fee and attendance alerts | ✅ |
| Routine: week grid, clash detection, edit, share, Google Calendar export | ✅ |
| Advising planner: clash-free combos, pins, days off, per-day rule, seats, recommended | ✅ |
| CGPA & degree: EWU scale, retakes, what-if, target forecaster, category progress | ✅ |
| Marks estimator + attendance tracker | ✅ |
| Deadlines & exam countdown | ✅ |
| Fees & payments with reminders | ✅ |
| Phone notifications (classes weekly, deadlines, payments) | ✅ (Android native, web fallback) |
| Faculty directory (from your schedule) | ✅ · campus-wide + reviews 🔌 |
| Study vault (upload, vote, download, report) | 🔌 |
| Free room finder | ✅ from your data · campus-wide 🔌 |
| Cover page PDF | ✅ |
| Account: backup/sync, export, delete account | 🔌 / ✅ |
| Website, privacy, terms, delete-account pages | ✅ |
| Store assets: icons, feature graphic, 9 screenshots, listing, data safety | ✅ |
| **v1.1 Study mode:** focus timer (presets, ambient rain/brown noise, daily goal, streak, heatmap, runs across pages, end-of-session notification) | ✅ |
| Flashcards with spaced repetition (decks per course, bulk paste `question :: answer`, keyboard review) | ✅ |
| Exam planner: topics with confidence, revision sessions placed around your routine, weak topics weighted | ✅ |
| Course hub per course: classes, faculty, attendance, marks, deadlines, cards, notes, links | ✅ |
| XP, levels, 16 badges, shareable semester card (PNG, CGPA optional, no student ID) | ✅ |
| Command palette (Ctrl+K), free gaps + free-room tips on the dashboard, study tip of the day | ✅ |
| Redesign: bento dashboard, mascot, floating Focus button, new landing page with download section | ✅ |
| Classmate finder (opt-in, same section) | ⏳ |
| Study groups: shared focus rooms with classmates | ⏳ |
| AI quiz maker: generate flashcards from your notes or vault PDFs | ⏳ |
| Seat-open alerts during advising | ⏳ |
| Section Q&A / course chat | ⏳ |
| AI study helper (summaries, practice questions from vault files) | ⏳ |
| Bangla language option | ⏳ |
| iOS App Store build | ⏳ (see store/RELEASE.md §6) |

## Roadmap
1. **Now**: set up Supabase, deploy the website, internal test on your phone. See [store/RELEASE.md](store/RELEASE.md).
2. **Closed test (14 days, 12+ testers)**: required by Google for new accounts. Use it to tune parsing on real portal pages and collect feedback.
3. **Public launch on Play + Chrome Web Store**: ideally before the next advising week, when the planner is most useful.
4. **v1.1**: seat alerts, classmate finder, Bangla, iOS.

## Known limits / risks
- Faculty and timetable data are crowd-sourced, so any signed-in student can edit them. Add moderation or edit history if vandalism appears.
- OCR accuracy depends on screenshot quality. Paste and the extension are exact.
- Marks cut-offs (A+ = 80 etc.) vary by course outline. The app says so.
- The EWU portal layout may change. The parser has tests; update `tests/parser.test.js` fixtures if it does.
