# EWUdiots — rules for coding agents

Unofficial student app for East West University students: a Vite vanilla-JS web app (`app/`), wrapped for Android with
Capacitor, backed by Supabase (Postgres + Auth + Storage + Realtime), hosted on Vercel. EWUdiots Club lives in
`app/src/clubs/`. Read `DESIGN.md` before any UI work and `SECURITY.md` before any data work.

## Commands (run from `app/`)

- `npm run dev` · `npm run build` · `npm run lint`
- `npm run typecheck` — TypeScript check of every `.ts` file (strict). Must pass before every commit.
- `npm test` — unit tests (`tests/*.test.js` and `tests/*.test.ts`, node:test; Node runs `.ts` directly). Must pass before every commit.
- `node scripts/ux-audit.mjs [routes…]` — every screen at phone + desktop: small tap targets, overflow, unlabelled controls, JS errors.
- `npm run test:app` — browser check of every page, no JS errors.
- `npm run test:clubs` — club end-to-end against the live database (can be flaky on invites; rerun before blaming code).
- `npm run test:clubs-rls` — row-level security checks for clubs.
- `node scripts/club-shots.mjs <screen…>` — screenshots of club screens (`SHOTS_W=1366` for desktop) into `.shots/design/`.

## Architecture

- `src/main.js` holds the app context `ctx` (state `S`, `save`, `rerender`, `openModal`, `modalHead`, `confirmModal`,
  `toast`, `busy`, `esc`, `icon`, router). Pages register on `ctx.pages[route]` as `() => html` with an optional
  `.mount(el)` for event listeners. Rendering is string templates; `.mount` wires events after each render.
- Clubs: `src/clubs/index.js` builds `kit` (`ui`, `icon`, `esc`, `api`, `store`, `charts`, permission helpers).
  Data goes through `src/clubs/api.js` only; cache with `store.use(key, loader, { ttl })` and `store.invalidate`.
- Pure logic (parsers, the assistant's matchers, merging) lives in its own module with no DOM access, so it can be tested.
- TypeScript, step by step: new modules are `.ts` (strict, erasable syntax only: no `enum`/`namespace`), imported with the
  `.ts` extension. Typed so far: `drop.ts`, `motion.ts`, `tide.ts`. Move a `.js` file to `.ts` when you change it a lot;
  Vercel `api/` handlers and what they import stay `.js`.
- CSS: base `styles.css`, `mobile.css`, `clubs/clubs*.css`, then one file per release (`v2NN.css`, imported last in
  `main.js`). The minifier may reorder same-specificity rules: if a newer rule must beat an older one, make it more specific.
- Database changes are numbered migrations in `supabase/migrations/NNNN_name.sql`; every table has RLS.

## Coding standards

- Smallest complete change (ponytail): reuse existing helpers (`ui.*`, `kit.*`, `ctx.*`) before writing new ones; no new
  dependency for a few lines; no speculative options. Finish callers and tests the change touches.
- Escape every value that reaches HTML with `esc()` (or a helper that escapes: `modalHead`, `toast`, `ui.st`, `ui.select`).
  `confirmModal`'s body and the assistant's answer text are raw HTML: escape data inside them.
- Comments say why, in one line; file headers say what the module is for. Plain English, no jargon in UI text.
- New non-trivial logic gets a unit test in `tests/`. Test data is made up: never real student IDs, names, phone
  numbers, portal screenshots or ID-card data.
- UI text: active voice, specific button labels, errors say how to fix, loading text ends with "…".

## Design rules (see DESIGN.md)

- Use the tokens. Premium look: gradients, glow, aurora blobs and 3D are allowed on surfaces as DESIGN.md §2/§6 say;
  never gradient text or blobs behind reading text.
- SVG icons from the icon set, never emoji as icons. One primary action per section.
- Touch targets ≥ 44×44px on phones, 24×24px minimum anywhere; visible `:focus-visible` rings.
- Never disable zoom (`user-scalable=no`, `maximum-scale=1`), never block paste, never `transition: all`.
- Every async button shows a busy state (`ctx.busy(btn, true)`) until the request ends.
- Honour `prefers-reduced-motion`; animate transform/opacity only. Reuse `motion.ts` / `tide.ts` patterns (reveal, sliding
  indicator, tilt, coverflow, tide, start clock) instead of writing new animation code.
- Motion follows Emil Kowalski's skills in `.claude/skills/` (`emil-design-eng`, `animate`, `review-animations`,
  `improve-animations`, `mobile-native`): use `animate` when adding motion and `review-animations` before finishing.
- Feature-tile icons: `ctx.tileIcon(ic, tone)` (animated Kubai Icons, `src/kicons.ts`; add new names to its import list).
- After UI changes: render the screen (club-shots or the Playwright MCP in `.mcp.json`), screenshot phone (393px) and
  desktop (1366px), and fix overflow, overlapping text, clipped buttons and horizontal scroll before finishing.

## Security rules

- Secrets only in `.secrets/` and Vercel/GitHub encrypted secrets. Only the Supabase URL and anon key ship in the app.
- Every table: `enable row level security` plus policies; signed-out users (`anon`) never get write grants; nobody gets
  `TRUNCATE`/`TRIGGER`/`REFERENCES` (migration 0030 sets default privileges for new tables).
- `security definer` functions always `set search_path = public`, check permissions inside (`club_can`, `can`,
  `is_admin`) and validate their arguments. Dynamic SQL only with `format('%I', …)` / `%L` and an allowlist.
- Client queries use the Supabase query builder with values as arguments; never build `.or()` / filter strings from
  user text. Validate at trust boundaries (Vercel `api/` handlers, database checks), not only in the UI.
- Serverless proxies allow-list their target host and re-check it after redirects; compare secrets in constant time.
- Keep the CSP in `app/vercel.json` strict: no `unsafe-inline` scripts, no new script hosts without a reason.
- Portal password goes only to EWU, stored only on the phone (opt-in, encrypted). Never bypass the portal captcha.

## Product constraints

- Unofficial: no EWU branding; keep the "Unofficial · not affiliated with EWU" line.
- The Google Play build must never self-update.
- "Ask EWUdiots" is free and on-device: no paid AI service or key; answers from the user's own data and public data.

## Release checklist

1. Bump `app/package.json` (`npm version X.Y.Z --no-git-tag-version`) and write `app/release.json` notes (each < 120 chars).
2. `npm run typecheck`, `npm test`, `npm run test:app`, `npm run test:clubs` pass.
3. Commit (trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`); never commit `UI Design/`, `.secrets/` or `.shots/`.
4. Push, wait for the `android.yml` run (`gh run watch`), then `npx vercel deploy --prod --yes` from `app/` (retry on
   network errors) and confirm `https://ewudiots.vercel.app/version.json` shows the new version.
