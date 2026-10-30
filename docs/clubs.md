# EWUdiots Club

The club platform inside EWUdiots. Students open it from **More → EWUdiots Club**. Every `#/club/…` route draws in
*club mode*: its own header (EWUdiots + lime “Club”, “Unofficial · not affiliated with EWU”), its own bottom bar
(**Home · Clubs · + · Messages · More**), a desktop sidebar, and a way back to the app. Clubs are not added to the
student's main navigation. The screens follow the boards in `UI Design/Ewudiots Club/`.

## Who controls what

```
EWUdiots team (App Admin, public.can('clubs.manage'))
  └─ creates clubs (Register Club) · appoints the Club Admin · verifies claims · locks features · suspends/archives
     └─ Club Admin (rank 2)
          └─ gives positions: President · Vice President · General Secretary · Treasurer (rank 3)
             · Executive Member · Wing Head (4) · Moderator · Merch Manager (5) · Senior Member (6) · General Member (7)
             └─ each position's permissions unlock its tools; the Club Admin switches club features on or off
Everyone else: club pages, public posts, recruitment, events, the store, sponsors, collaborations.
```

- Nobody creates a club except the App Admin. A student's “Your club isn't listed?” makes a *pending* request that
  stays hidden until the team approves it.
- Several positions share a rank. `club_roles.is_default` marks the one used when only a rank is known. Invites,
  role changes, handovers and elections carry the role id (`public.set_member_role`, `invite_member(…, rid)`).
- You can only hand out positions below your rank, with permissions you hold (`club_may_assign`, mirrored by
  `perms.assignableRoles`). Club Admins can create their own positions.
- New clubs start from `club_role_template`, which the team edits in App Admin → Roles & Permissions.
- Features (`clubs.features`): chat, meetings, projects, resources, polls, elections, finance, recruitment and events
  are on by default; store, sponsors and collab are off. The team can lock any feature off (`features_locked`,
  `admin_lock_feature`). RPCs check `club_feature()`.

## Layers

```
supabase/migrations/0016_clubs.sql            v2.13 base: clubs, roles, members, posts, forms, attendance, polls…
supabase/migrations/0018_club_platform.sql    positions, features, chat, notifications, meetings, projects,
                                              resources, elections, recruitment scores, events, handover,
                                              feedback, analytics, support tickets, data export, App Admin
supabase/migrations/0019_club_store_partners.sql  merch store, orders, returns/refunds, sponsors, collaborations
supabase/migrations/0020…0023                 fixes found by the checks (order status params, ticket quota,
                                              archived posts on unclaimed clubs, default rubric, event budgets)
app/src/clubs/
  index.js        install(ctx): routes, club-mode header/nav, + menu, live notification count, invite claiming
  api.js          v2.13 calls · api-more.js the v2.14 calls (merged into one api object; views never call Supabase)
  store.js        cache: use(key, loader) → { loading | value | error }; invalidate(); refresh(key, loader)
  perms.js        permission keys, DEFAULT_ROLES, FEATURES, has/canManage/assignableRoles     ← unit-tested vs SQL
  orders.js       order statuses and allowed moves (= public.order_next_ok), stock keys       ← unit-tested
  cart.js         device cart grouped by club                                                   ← unit-tested
  kanban.js       task board moves · ics.js calendar files · charts.js SVG charts               ← unit-tested
  scan.js         camera QR scanner (BarcodeDetector) for check-in and pickups
  forms.js / checkin.js   v2.13 form logic and rotating attendance codes
  ui.js           shared components (cards, stat cards, tiles, pills, avatars, pager, QR…)
  clubs.css · clubs-v2.css   styles; v2 holds the board design tokens (light + dark) and chart colours
  views/          home, feed, explore, profile, events, eventx (event page, organiser, door check-in), form, mine
                  (My clubs, Me), space (workspace), messages, notifications, members (+ committee/handover),
                  meetings, projects, resources, polls (+ elections), recruit, finance, analytics, shop (store,
                  cart, checkout, orders), merch (manager), sponsors, collab, help, privacy, more, platform (App
                  Admin), manage (+ manage-content/forms/ops) — the club console
app/scripts/import-ewu-clubs.mjs    reads the EWU club site from the Internet Archive → public/data/clubs-ewu.json
app/scripts/seed-ewu-clubs.mjs      puts that into the database (logos re-hosted, only empty fields filled)
app/scripts/sql.mjs                 run SQL / --dry / --apply a migration on the live project
```

Rule: **the database decides.** The app uses `perms.js` only to choose what to show. Every rule that matters is
enforced by row-level security or a `security definer` RPC.

## EWU club data

`clubs.ewubd.edu` went offline in 2026. `import-ewu-clubs.mjs` reads the Internet Archive's latest copies of
each club's About, Leaders, News and Events pages. It keeps the about text, logo, club email, *present* faculty
moderators (matched to `faculty.json`) and up to 12 news/event items. It never keeps student names, people's photos
or phone numbers, and it drops committee announcements. Archived items become public posts with `source_url` set;
they show on a club's page even before the club is claimed (0022). Re-running the seed is safe: it adds nothing twice
and never overwrites what a club wrote itself. Three newer clubs (Science, Health & Well-Being, Book Reading) had no
archived pages.

## Main flows

- **Club goes live:** App Admin registers or verifies it and appoints the Club Admin, who gives the committee
  their positions.
- **Joining:** invite by student ID or email (the student is a member the next time they sign in), open join, or
  an application form. Accepting a membership application creates the membership.
- **Chat:** `club_channels` are Announcements (writers only), General Members, Executive Team (rank ≤ 4), wing or
  team groups, collaboration channels and DMs. `open_dm` only works between active members of the same club.
  New messages arrive through Supabase Realtime (`club_messages` is in the `supabase_realtime` publication) and
  RLS decides who receives them. Attachments must live in that channel's folder.
- **Elections:** positions, self-nomination, organiser approval, then one anonymous ballot per position.
  `club_election_voted` (who voted) and `club_election_ballots` (what was chosen) are kept apart. After voting
  closes, `apply_election` gives the winners their positions through `handover_term`.
- **Recruitment:** responses move pending → shortlisted → interview → accepted or rejected. They are scored
  against `settings.rubric` (default Motivation 20 · Skills 20 · Portfolio 20 · Fit 40), and interviews go out as
  notifications.
- **Merch:** no in-app payments. `place_order` recomputes prices, stock and coupons under row locks. The buyer pays
  the club's bKash/Nagad/Rocket number (or cash at pickup) and types the TrxID. A Merch Manager with
  `payments.verify` checks it in the club's account. Order status moves are confirmed → processing → ready →
  completed, and processing needs a verified payment unless the order is paid in cash. The pickup QR is
  `ewud:o:<random token>`, and scanning it completes the order. Returns are approved by order managers. Refunds
  need `refunds.approve` (Treasurer and above) and are booked as finance expenses.
- **Sponsors:** sponsors that clubs add wait for team approval. A deal marked received becomes sponsorship income.
  Sponsor pages never show amounts.
- **Notifications:** `club_notifications` is written by triggers and RPCs (posts, tasks, mentions, DMs, meetings,
  orders, applications, elections). It feeds the club bell, live through Realtime.

## Privacy

- Applicants' and buyers' phone numbers are visible only to holders of `forms.view_responses` or
  `orders.manage`. Exports are audit-logged.
- Member directory: members can hide themselves, show their email to executives, and set profile visibility per
  club. `export_my_club_data()` downloads everything clubs hold about you.
- `app/privacy.html` and `store/data-safety.md` describe chat, orders, return photos and support tickets.

## Testing

| Command | What it checks |
|---|---|
| `npm test` | unit tests: perms ↔ SQL template, order moves ↔ `order_next_ok`, cart, board, calendar file, charts, forms, check-in codes |
| `npm run test:clubs-rls` | 106 security checks played as admin, President, Executive Member, Merch Manager, member and outsider (chat, DMs, features, positions, store, refunds, pickup, elections, sponsors, tickets), in one transaction that is **rolled back** |
| `npm run test:clubs` | 84-step run in Chrome against the live backend, with throwaway accounts and a throwaway club, all deleted afterwards. It covers: invite → join; form → accept; attendance; poll; certificates; Treasurer position; live chat between two browsers; merch order → TrxID → verify → ready → QR pickup; a tour of every screen; App Admin; feature lock. Screenshots go to `app/.shots/clubs` |
| `npm run lint` | ESLint |

## Adding a feature

1. Write a migration with RLS and RPCs for anything with rules. Extend `clubs-rls-check.mjs`.
2. Add calls to `api-more.js`.
3. Add a view in `views/` registered in `index.js`, and add it to `ACTIVE` (nav highlight) and `more.js` (and to
   the workspace tiles in `space.js` if it's a member tool).
4. New permission keys go in `perms.js` PERM_GROUPS **and** the SQL (the unit test fails otherwise). A new club
   feature goes in `FEATURES`, `club_features()` and `club_feature_default()`.
5. Don't use `data-page` as an attribute in views: the router's page wrapper uses it (the pager uses `data-pg`).
