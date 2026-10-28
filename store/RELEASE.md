# Launch guide: website, Play Store, Chrome extension (iOS later)

Do these in order. Costs: Supabase free tier, Cloudflare Pages free, a domain (~$10/yr), Google Play $25 once, Chrome Web Store $5 once, and Anthropic API usage for Smart scan (pay as you go, capped at 20 scans per student per day).

---

## 1. Backend: Supabase (~20 min)
1. Create a project at supabase.com. Region: **Singapore (ap-southeast-1)**, the closest to Dhaka.
2. **SQL Editor** → paste `supabase/migrations/0001_init.sql` → Run.
3. **Authentication → Providers → Email**: enabled. Turn on "Confirm email".
4. **Authentication → Email Templates → Magic Link**: make the body show the code, e.g.
   `Your EWUdiots code is <b>{{ .Token }}</b>. It expires in 10 minutes.`
5. **Authentication → SMTP**: set up a custom SMTP sender (Resend or Brevo have free tiers). Supabase's built-in mailer allows only a few emails per hour, which is not enough for launch day.
6. **Smart scan function** (needs the Supabase CLI: `npm i -g supabase`):
   ```
   supabase login
   supabase link --project-ref YOUR_REF
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase functions deploy parse-screenshot
   ```
7. **Project Settings → API**: copy the URL and the anon key into `app/.env` (template in `app/.env.example`).
8. Test: `cd app && npm run dev`, open http://localhost:5500/app.html → Account → sign in with your @std.ewubd.edu email.

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
4. GitHub → Actions → **Android release** → Run workflow. Download the `.aab` artifact.
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
- **Google Play note:** the Play Store build must not self-update (Play policy). Before uploading to Play, remove `REQUEST_INSTALL_PACKAGES` and the plugin, or make the update button open the Play listing.
