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

---

## Before every release
- `cd app && npm test` (parser), then `npx vite preview --port 4173` and `node scripts/e2e.mjs` (browser smoke test) and `node scripts/ext-test.mjs` (extension privacy test).
- `cd app && npm run test:ext`: installs the real extension in Chrome, browses portal-shaped pages (`tests/fixtures/portal-pages.mjs`, fake data), sends them to the app and checks every imported value and that nothing private leaked. If the EWU portal changes its layout, update the fixtures to match and re-run.
- `cd app && npm run test:campus`: 3D/2D campus map, routes, walk and tour, room register, floor plans, and the ID card scan (a synthetic card image).
- Bump `version` in `app/package.json` and `extension/manifest.json`, and `APP_VERSION` in `app/src/main.js`.
