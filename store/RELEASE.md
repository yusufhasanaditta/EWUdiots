# Launch guide: website, Play Store, Chrome extension (iOS later)

Do these in order. Costs: Supabase free tier, Cloudflare Pages free, a domain (~$10/yr), Google Play $25 once, Chrome Web Store $5 once. Screenshot and ID card reading runs on the phone, so there are no AI or per-scan costs.

---

## 1. Backend: Supabase (~20 min)
1. Create a project at supabase.com. Region: **Singapore (ap-southeast-1)**, the closest to Dhaka.
2. **SQL Editor** → paste `supabase/migrations/0001_init.sql` → Run.
3. **Authentication → Providers → Email**: enabled. Turn on "Confirm email".
4. **Authentication → Email Templates → Magic Link**: make the body show the code, e.g.
   `Your EWUdiots code is <b>{{ .Token }}</b>. It expires in 10 minutes.`
5. **Authentication → SMTP**: set up a custom SMTP sender (Resend or Brevo have free tiers). Supabase's built-in mailer allows only a few emails per hour, which is not enough for launch day.
6. **Project Settings → API**: copy the URL and the anon key into `app/.env` (template in `app/.env.example`).
7. Test: `cd app && npm run dev`, open http://localhost:5500/app.html → Account → sign in with your @std.ewubd.edu email.

## 2. Website (~15 min)
1. Push this folder to a GitHub repo. `.gitignore` already excludes your portal screenshots and secrets.
2. Cloudflare Pages → Create → connect the repo.
   Root directory `app` · Build command `npm ci && npm run build` · Output `dist`.
   Add env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
3. Add your domain, or use the free `*.pages.dev` address. Then put your site in:
   - `extension/popup.js`: `DEFAULT_APP` = `https://YOUR-SITE/app.html` (where "Send to EWUdiots" opens).
   - `extension/manifest.json`: optional, add `"https://YOUR-SITE/*"` to the `bridge.js` matches so the app's "Import from extension" button also works there. Only list a domain you control: any page on a listed domain can ask the extension for the saved portal pages.
   - `store/play-listing.md`.
4. Supabase → Authentication → URL Configuration → Site URL = your domain.

Your site now serves: `/` landing page · `/app.html` the web app (installable PWA) · `/privacy.html` · `/terms.html` · `/delete-account.html`.

## 3. Android app → Google Play
1. Create a Play Console developer account ($25). Use a **personal** account unless you have a registered organisation.
2. Create an **upload keystore** once. Keep it and its passwords safe forever; losing it means you can't update the app.
   Any machine with Java: `keytool -genkeypair -v -keystore upload.jks -alias ewudiots -keyalg RSA -keysize 2048 -validity 10000`
   (No Java on your PC? Install Android Studio, which bundles it, or run the command in a free GitHub Codespaces terminal.)
3. GitHub repo → Settings → Secrets → add: `ANDROID_KEYSTORE_BASE64` (`base64 -w0 upload.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`ewudiots`), `ANDROID_KEY_PASSWORD`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
4. GitHub → Actions → **Android release** → Run workflow. Download `EWUdiots.aab` from the release: it is the Play build, without the in-app updater (see §18).
5. Play Console → Create app "EWUdiots: EWU Student Hub" → fill every section with `store/play-listing.md` and `store/data-safety.md`. Upload graphics from `store/graphics` and `store/screenshots`.
6. **Testing → Closed testing**: upload the .aab. New personal developer accounts must run a closed test with at least **12 testers for 14 continuous days** before production access is granted. Recruit classmates early.
7. Apply for production, then roll out.

Test on a real phone first (optional): install Android Studio → `cd app && npm run android` → Run.

## 4. Chrome extension → Chrome Web Store
1. Chrome Web Store developer account ($5).
2. Zip the **contents** of `extension/` → upload.
3. Privacy tab: single purpose "sync the student's own EWU portal pages to EWUdiots". Permissions: `storage` (keep synced pages), `activeTab` (read the open portal tab when the user clicks Sync), host `portal.ewubd.edu`. Data: "Personally identifiable info (name, student ID)" and "Educational records". Not sold, not used for unrelated purposes.

## 5. Desktop ("software")
- The web app installs as a desktop app from Chrome or Edge (install icon in the address bar).
- For the **Microsoft Store**: go to pwabuilder.com → enter your site URL → package for Windows → submit (free developer account).

## 6. iPhone / App Store (when ready)
1. Apple Developer Program ($99/yr).
2. Build without a Mac: Codemagic (free tier with macOS machines) → connect repo → Capacitor iOS workflow. With a Mac: `cd app && npx cap add ios && npx cap open ios`.
3. Already in place for Apple review: native notifications, offline use, account deletion, privacy policy, and no third-party social login (so "Sign in with Apple" isn't required).
4. Until then, iPhone users can use the web app: Safari → Share → Add to Home Screen.

## 7. Campus map data (rooms + floor plans)
- In the app, go to Campus Map → **Rooms & plans**. Add rooms you know, and upload a plan for each floor (crop it to the building outline, north at the top). Pin rooms on the plans.
- Tap **Export**, rename the file to `overrides.json` and put it at `app/public/campus/overrides.json`. Every student then gets those rooms (shown as "Verified") and plans on their next visit.
- Block shapes, floors and links come from the official campus map and live in `app/src/campus-data.js`. Update `BLOCKS` or `LINKS` there if EWU changes them.
- Or add shared rooms directly in the admin panel → Campus rooms (it can import the same export file).

## 8. Admin panel (`/admin.html`)
1. In Supabase → SQL Editor, run every file in `supabase/migrations/` in order (0001 → 0005).
2. Invite yourself as the first owner (any email, it doesn't have to be an EWU one):
   `insert into public.admin_invites (email, role) values ('you@example.com', 'owner');`
3. Open `https://YOUR-SITE/admin.html`, enter that email and the 6-digit code. You're now the owner.
4. From then on, invite other admins from the panel (Admins → Invite an admin).
- What you can do there: announcements and news posts (with schedule and pinning), the Home banner, switching sections off for everyone, approving alumni profiles, hiding or correcting faculty listings, shared campus rooms, moderating reported reviews and files, and the activity log.
- **Demo mode** (button on the sign-in screen, or `/admin.html#demo`) lets you try everything before the server is connected. It saves only in that browser and never reaches students.

## 9. Direct downloads (no Play Store)
- Every push to `main` that touches `app/` or `extension/` runs **Android release** on GitHub Actions. It builds a signed `EWUdiots.apk`, the Play Store `EWUdiots.aab` and `EWUdiots-extension.zip`, and publishes them as the latest GitHub Release.
- The website's **Download APK** and **Download extension** buttons go to `/download/android` and `/download/extension` (redirects in `app/vercel.json`) → the latest release files.
- The signing key is in `.secrets/` (not in git) and in the repo secrets. **Back up `.secrets/`**: phones only accept updates signed with the same key.
- Repo secrets the build reads: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SITE_URL`, plus the four `ANDROID_*` signing secrets.

## 10. Sign-in codes to student email
- Sign-in needs both sides of the ID card; the 6-digit code goes to `<student id>@std.ewubd.edu`.
- Supabase's built-in mailer only delivers to your own team's addresses, so set a custom SMTP (Authentication → SMTP). Easiest: a Gmail account with 2-step verification → App password → host `smtp.gmail.com`, port 465, user = the Gmail address, password = the app password.
- Email template (Magic Link): `Your EWUdiots code is <b>{{ .Token }}</b>. It expires in 10 minutes.`

## 11. News, notices, faculty and alumni data
- News and notices are read live from ewubd.edu by `app/api/news.js` and `app/api/notices.js` (Vercel functions, cached 1 h and 30 min).
- Faculty directory: re-run `cd app && node scripts/scrape-faculty.mjs` each semester.
- Alumni: `app/public/data/alumni.json` comes from the "Alumni Success Stories" in EWU newsletters. When a new issue comes out, read it with `node scripts/pdf-text.mjs <newsletter.pdf> "Alumni Success"` and add the new people. Alumni can also add themselves in the app; you approve them in the admin panel.

---

## Before every release
- `cd app && npm test` (parser), then `npx vite preview --port 4173` and `node scripts/e2e.mjs` (browser smoke test) and `node scripts/ext-test.mjs` (extension privacy test).
- `cd app && npm run test:ext`: installs the real extension in Chrome, browses portal-shaped pages (`tests/fixtures/portal-pages.mjs`, fake data), sends them to the app and checks every imported value and that nothing private leaked. If the EWU portal changes its layout, update the fixtures to match and re-run.
- `cd app && npm run test:campus`: 3D/2D campus map, routes, walk and tour, room register, floor plans, and the ID card scan (a synthetic card image).
- Bump `version` in `app/package.json` and `extension/manifest.json`, and `APP_VERSION` in `app/src/main.js`.

## 12. Accounts, assistant, alarms and admin tools (v2.5)
- **Sign in:** students create an account with both sides of their ID card + a password; alumni and faculty with any email + password. Every new account verifies its email with a 6-digit code. After that: student ID/email + password, staying signed in until Log out. **Forgot password** emails a code to set a new one. Admins still sign in to `/admin.html` with an email code only.
- **Ask EWUdiots** (app) and **Ask the assistant** (admin): free, run on the device, no AI key. Rules live in `app/src/assistant.js` and `adminAnswer()` in `app/src/admin/admin.js`.
- **Class alarms** (`#/alarms`): any number of minutes/hours before each class, per course too. Android rings through the "Class alarms" notification channel.
- **Admin:** Users (suspend, sign out everywhere, reset code, message), Messages to users, Feedback inbox, Security centre, sign-up chart, alerts bell, post trash with restore, bulk actions, CSV export, maintenance mode.
- Database changes are in `supabase/migrations/0006_accounts_admin_tools.sql`; apply with `node scripts/setup-supabase.mjs` (needs `.secrets/`).

## 13. Update prompts (v2.6)
Before each release, bump `version` in `app/package.json` (and `extension/manifest.json` if the extension changed) and write 2–5 short lines in `app/release.json` → `notes`. After deploying:
- **Phone app:** a sheet "Update available" with your notes and **Update now** (downloads the new APK); Home keeps an Update card.
- **Web / installed desktop app:** a bar "New version available · Refresh".
- **Chrome extension:** an "Update available" banner in the popup with the download link.
For an important fix, set `minVersion` in `release.json` to the new version: older phone apps then can't dismiss the prompt, and open web apps reload once by themselves.

## 14. Website editor, media, automatic feeds, analytics, permissions (v2.7)
- **Automatic content:** `api/cron.js` runs daily (Vercel Cron, `vercel.json` → `crons`). It pulls ewubd.edu news and notices into `feed_items` and finds new newsletters. Admins hide, pin, rename or add items in **News & notices feed**, and their changes survive the next update. **All alumni & import** reads a new newsletter's "Alumni Success Story" pages and drafts entries for review.
- **Website & theme:** homepage text, announcement bar, FAQ, contact and social links, and the brand colour, with a live desktop/tablet/phone preview.
- **Media library**, **Analytics** (cookie-free, `api/track.js`), **Scheduled jobs** (run now), **Change history** (compare and restore) and **Roles & permissions** (owner / admin / editor / moderator, enforced in the database by `public.can()`).
- Server secrets: `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` live only in Vercel's encrypted env and `.secrets/server.env`.
- New logo: `brand/logo.png` → `npm run icons`, then `npx @capacitor/assets generate --android`.

## 15. Events, profile photo, 2-hourly feeds (v2.9)
- **Events** (`#/events`, migration `0010_events.sql`): official events are read from ewubd.edu/events by `api/cron.js` (job `events`) and go live by themselves. Students, teachers and alumni **suggest** events (up to 3 a day); each waits in **Admin → Events** until someone with `events.review` approves or rejects it. The poster gets an inbox message either way. Admins can also add, edit, pin and unpublish events.
- **Every 2 hours:** `.github/workflows/refresh-feeds.yml` calls `/api/cron?job=news,notices,events` with the `CRON_SECRET` repo secret. The daily Vercel cron still runs everything. GitHub pauses scheduled workflows in a repo with no commits for 60 days; push anything (or press "Enable workflow" in Actions) to wake it.
- **Profile:** a photo (cropped to a 320 px JPEG, saved with the rest of the student's data, so it follows them to every device), the details the Chrome extension read from the portal Profile page ("Fill from extension" checks the account's inbox), and an "About me" card (headline, bio, phone, hometown, skills, interests, clubs, links). About-me details are private to the account.
- Fix in `0011_fix_revisions.sql`: change history failed on tables without a `key` column, so admin edits of posts, feed items and alumni were refused. Revisions now read the row key through jsonb.

## 16. Student sign-up options, card verification, OCR fixes, in-app updates (v2.10)
- **Students sign up** with their student ID / EWU email + password (6-digit code to the student mail), or by scanning both sides of the ID card (verified straight away). Accounts made with the email alone show "Verify your student account" on Home and Profile until the student scans their card.
- **Verified** is `app_metadata.card_verified`, written only by `public.verify_my_card()` (both card photos must be in the student's private `idcards` folder and the card's ID must equal the account's ID) or by an admin (`admin_set_card_verified`). Admins with `users.manage` can open the card photos from **Users → a student → ID card** (migration `0012_student_verification.sql`).
- **Sign in** with password, with an emailed code ("Email me a code"), or by scanning the front of the ID card: the ID is read and a code goes to that student's EWU mail. An ID with no account opens sign-up with the ID filled in.
- **OCR fixes:** the English data now ships unzipped (`eng.traineddata`) because Android's packager unzips `*.gz` assets and drops the extension, so the phone app couldn't load it. The parser re-joins table rows that wrap in phone screenshots and fixes common misreads; zoomed-out screenshots get a second, larger pass. The ID card reader retries sideways/upside-down/larger. Probes: `node scripts/ocr-phone-probe.mjs` (portal pages at phone width) and `node scripts/card-probe.mjs` (synthetic card photos).
- **In-app updates (Android):** `ApkUpdaterPlugin.java` downloads the new APK with a progress bar and opens Android's installer; the student taps **Update** once. The first time, Android asks to "Allow from this source". The update sheet shows again whenever the app is opened (at most every 6 hours after "Later"; always for a required update). Apps older than 2.10 still download the first update in the browser.
- **Google Play note:** the Play Store build must not self-update (Play policy). The release workflow handles it: see §18.

## 17. v2.11: portal sign-in, calendar, scholarships, materials, Classroom, analytics, sync fix
- **Sync fix:** each part of the state (profile, routine, grades…) carries its last edit time (`state._t`, `src/syncmerge.js`); devices merge part by part before every upload, so a stale device can't overwrite newer edits. Required update (`minVersion` 2.11.0).
- **Portal sign-in (Android):** `PortalSyncPlugin.java` opens portal.ewubd.edu in a hidden WebView on the phone; the student's ID + password go into EWU's own form (never to EWUdiots, never stored); EWU's "a + b = ?" check is shown to the student. Pages are read with the extension's privacy filter (`src/portal-scrape.js`, generated by `node scripts/build-portal-scrape.mjs`; a test keeps it equal to `extension/portal.js`). Logic: `src/portalsync.js`, test `npm run test:portal`.
- **Academic calendar** (`#/calendar`, `api/calendar.js`, `src/acadcal.js`): EWU's undergraduate calendar + final exam schedule by class days, holidays skipped by "next class", phone reminders the day before deadlines and finals, .ics export.
- **Scholarships** (`#/scholarship`, `src/scholarship.js`): rules from ewubd.edu/scholarships-financial-aid (Oct 2026) and the "what term GPA do I need" maths. Re-check the page each year.
- **Course materials** (course page → Materials; teacher profile): shared files/links tagged with teacher, section, semester and topic; topics form a study path (migration `0013`). 
- **Google Classroom** (`#/classroom`, migration `0014`): needs `VITE_GOOGLE_CLIENT_ID` (see below). Until it's set, the page says it's almost ready.
- **Analytics** (`#/insights`): CGPA/term GPA trend, credits, grade distribution, study time, risk check.
- **Removed** the unused "Smart scan (AI)" option (its server function was never deployed, so it broke screenshots for signed-in users).

### Turning on Google Classroom (free, ~15 minutes)
1. console.cloud.google.com → create a project "EWUdiots".
2. APIs & Services → Library → enable **Google Classroom API**.
3. OAuth consent screen → External → app name EWUdiots, support email ewudiots@gmail.com, add the scopes `classroom.courses.readonly`, `classroom.coursework.me.readonly`, `classroom.courseworkmaterials.readonly`, `classroom.topics.readonly`. While the app is "Testing", add up to 100 test users (student emails); "Publish" and Google verification lift the limit.
4. Credentials → Create credentials → OAuth client ID → Web application → Authorized JavaScript origins: `https://ewudiots.vercel.app` (and `http://localhost:5500` for dev).
5. Put the client ID in Vercel env `VITE_GOOGLE_CLIENT_ID` (and in `app/.env`), then redeploy. If EWU's Google Workspace blocks third-party apps, the EWU IT office must allow the app.

## 18. Launch clean-up (v2.11.1)
- **Two Android files per release.** `EWUdiots.apk` (website download) keeps the in-app updater. `EWUdiots.aab` (Google Play) is built a second time with `VITE_STORE=play` and `app/scripts/play-strip.mjs`, which removes `ApkUpdaterPlugin` and `REQUEST_INSTALL_PACKAGES`; its update button opens the Play Store listing instead. The workflow fails if the bundle still asks to install packages.
- **Admin console** is no longer linked from the student sign-in page. Open it directly at `/admin.html` (not indexed by search engines). Its demo mode is gone from production; it exists only in the test build (`vite --mode test`, `admin.html#demo`) for the end-to-end tests.
- **Student demo** ("Just exploring? Try with demo data") stays: it is labelled on every page, stays on the device and is replaced by the first real sync. Its sample teachers and student use `example.com` addresses.

## 19. v2.12: portal sync fixed, attendance by class, calendar views, degree road map
- **Portal sync (Android):** the old page addresses were guesses (`/Home/StudentClassSchedule` doesn't exist; it's `/Home/ClassSchedule`, and the schedule page opens on "Select Semester"). The app now reads the portal's own JSON with the student's session: `/api/utility/GetSemesterForDropDown`, `/api/Advising/GetSemesterStudentWiseAdvisingCourseListStudent/{semesterId}` for every semester (newest first, stops 3 empty semesters after the first one) and `/api/Advising/GetAllRoutine` for offered courses. Only academic fields leave the page (`API_JS` in `src/portalsync.js`). Other pages (profile, grade report, degree review, rules, curriculum, installments, accounts ledger) are found through the portal's menu links, with fallbacks. Test: `npm run test:portal`. **Still needs one real-account check on a phone.**
- **Remember on this phone:** `PortalSyncPlugin.rememberLogin/savedLogin/forgetLogin`, AES-GCM with an Android keystore key; `login({ useSaved: true })` fills it natively, so the web part never reads it back. EWU's sum is always answered by the student.
- **Attendance:** `src/semplan.js` builds every class of the semester from the routine and EWU's calendar (holidays skipped, "Regular Tuesday Classes" make-up days, first/last day of classes). Marks `S.attendance[code].marks["date|start"] = p | a | c`. Class alarms are dated for 21 days when the calendar is known, so no alarm rings on a holiday.
- **Degree plan:** `src/degreeplan.js` (curriculum + grades + routine → done / ready / locked and a semester road map). Curriculum comes from the portal's Curriculum page.
- **Database:** `0015_material_visibility.sql` (everyone / only me, moderators can delete reported material and its file, moderators' Hide no longer undone by the status guard).
- **Required update** (`minVersion` 2.12.0). Extension 1.8.0 (fee ledger, installments and curriculum rows pass its privacy filter).
