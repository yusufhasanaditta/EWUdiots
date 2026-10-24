# Google Play listing — EWUdiots

**App name (30 max):** EWUdiots: EWU Student Hub
**Package:** com.ewudiots.app
**Category:** Education · **Tags:** Education, Productivity, Calendar
**Contact email:** civicframe01@gmail.com
**Website:** https://ewudiots.app (replace with your domain)
**Privacy policy:** https://ewudiots.app/privacy.html
**Account deletion URL:** https://ewudiots.app/delete-account.html

## Short description (80 max)
Routine, advising, CGPA, focus timer & flashcards for EWU students. Unofficial.

## Full description (4000 max)
EWUdiots is the all-in-one companion for East West University students, made by EWU students.

Take a screenshot of your portal (or copy-paste it), and EWUdiots builds your profile automatically: weekly routine, CGPA, degree progress, faculty contacts and tuition deadlines. No typing.

PLAN A CLASH-FREE SEMESTER
• Pick courses and pin the sections or faculty you want.
• See every routine with no time clashes, ranked by fewest campus days, least waiting or top-rated faculty.
• Follows your advising rules (max courses per day, credit limits) and shows live seat counts.

NEVER MISS A CLASS
• Next-class countdown with room and faculty.
• Weekly timetable with clash detection.
• Phone reminders before every class.
• Export to Google Calendar.

KNOW YOUR GRADES
• CGPA on EWU's official grade scale, with retake rules.
• Target forecaster: what term GPA you need to reach your goal.
• Marks estimator: what you need in the final for an A.
• Attendance tracker with an 80% warning.
• Degree progress for every requirement category.

STUDY SMARTER
• Focus timer (Pomodoro) with rain and brown-noise sounds, daily goal, streaks and a study heatmap.
• Flashcards with spaced repetition: each card comes back right before you would forget it.
• Exam planner: add topics and the exam date; revision sessions are placed in the free time around your classes.
• A page for every course: classes, faculty, deadlines, attendance, notes and links.
• Earn XP, level up, unlock badges and share your semester card.

NO MORE LATE FEES
• Payment deadlines and late-fee steps from your advising slip.
• Reminders 3 days and 1 day before the deadline.

CAMPUS TOOLS
• Faculty directory with honest, anonymous reviews from verified EWU students.
• Study vault: notes, slides and past papers shared by seniors.
• Free room finder for group study.
• Assignment cover page generator (PDF).
• Deadlines and exam countdowns.

PRIVATE BY DESIGN
• We never ask for your portal password.
• We never read your phone number, address, NID, date of birth or photo.
• Your data stays on your phone unless you choose to back it up.
• Delete your account and data in two taps.

EWUdiots is an independent student project. It is not affiliated with, endorsed by or connected to East West University. Always confirm important information on the official portal.

## Graphics
| Asset | File |
|---|---|
| App icon 512×512 | `store/graphics/play-icon-512.png` |
| Feature graphic 1024×500 | `store/graphics/feature-graphic-1024x500.png` |
| Phone screenshots (1170×2079, 9:16) | `store/screenshots/phone-1-dashboard.png` … `phone-9-dark-routine.png` |

Suggested screenshot order and captions:
1. Dashboard: "Your semester at a glance"
2. Routine: "Your weekly routine, built from one screenshot"
3. Planner: "Every clash-free routine, ranked"
4. CGPA: "CGPA, degree progress and target forecaster"
5. Fees: "Never pay a late fee again"
6. Marks: "Know what you need in the final"
7. Faculty: "Faculty contacts and honest reviews"
8. Sync: "Screenshot, paste or one-click sync"

## Content rating questionnaire (IARC)
- User-generated content: **Yes** (reviews, file sharing). Moderation: reporting + auto-hide after 3 reports. Users can't message each other.
- Violence, sexual content, gambling, drugs: **No**
- Shares location: **No** · Digital purchases: **No**
- Expected rating: Everyone / 3+ (UGC note)

## Target audience
Ages 18+ (university students). Not designed for children.

## App access for reviewers
Google reviewers need access to the signed-in features:
- Explain that the app works without login. Tap "Try with demo data" on the first screen to see every feature.
- Sign-in requires an @std.ewubd.edu email. Create a review account in Supabase (Auth → Users → Add user) with a test EWU-format email, and give its sign-in steps in Play Console → App content → App access.

## Notifications / alarms
The app uses `SCHEDULE_EXACT_ALARM` (via Capacitor Local Notifications) for class and deadline reminders. Declare it as a **calendar / reminder** use case in the Play Console permissions declaration.
