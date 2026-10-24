# EWUdiots: EWU Student Hub

An unofficial all-in-one app for East West University students. It ships as a website, an installable web app, an Android app (Capacitor), and a Chrome extension that syncs the portal. iOS is ready to add later.

```
app/                 Website + web app + Android project (Vite, vanilla JS)
  index.html         Marketing site (redirects into the app inside the Android shell)
  app.html           The app
  privacy.html, terms.html, delete-account.html
  src/main.js        App shell, dashboard, academics and campus pages
  src/study.js       Study mode: focus timer, flashcards, exam planner, course hubs, XP and badges
  src/art.js         Mascot, confetti, chime, ambient sounds
  src/site.js        Landing page: install button, scroll reveal
  src/parser.js      EWU portal text → structured data (tested)
  src/cloud.js       Supabase: sign-in, backup, faculty, reviews, vault, smart scan
  src/native.js      Android/iOS: notifications, share, back button
  tests/             Parser tests (node --test)
  scripts/           e2e browser test, extension privacy test, icon builder
  android/           Generated Capacitor Android project
extension/           Chrome MV3 extension (allow-list portal reader)
supabase/            Database schema (RLS) + Smart-scan edge function (Claude vision)
brand/               Logo source (SVG)
store/               Play listing, data safety, release guide, graphics, screenshots
.github/workflows/   Cloud builds: website, signed Android .aab
```

## Develop
```
cd app
npm install
npm run dev          # http://localhost:5500 (site) and /app.html (app)
npm test             # parser tests
npm run build        # production build → app/dist
```
With no `.env`, the app runs fully on-device: every feature works locally, and the cloud features show sign-in prompts. To turn on accounts, copy `app/.env.example` to `app/.env` with your Supabase keys.

## Ship it
Follow **[store/RELEASE.md](store/RELEASE.md)**: Supabase → website → Google Play → Chrome Web Store → (later) App Store.

## Brand
- Colours: Ultraviolet `#5B3DF5` · Lime `#C8F04A` · Ink `#15122E` · Paper `#F6F5FB`
- Font: Plus Jakarta Sans
- Mascot: the winking graduate
- Re-render all icons after editing `brand/logo.svg`: `cd app && npm run icons`
