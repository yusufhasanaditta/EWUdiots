# EWUdiots Club

The club platform inside EWUdiots. Students open it from **More → EWUdiots Club**. Every `#/club/…` route draws in
*club mode*, with its own navigation (Feed · Explore · Events · My clubs · Me), its own accent and a way back to the
app. Clubs are not added to the student's sidebar or bottom bar.

## Layers

```
supabase/migrations/0016_clubs.sql   tables, row-level security, RPCs, storage, the 23 EWU clubs
supabase/migrations/0017_…sql        my_clubs() returns each club's name, slug, colour and logo
app/src/clubs/
  index.js       install(ctx): routes, club-mode navigation, invite claiming on sign-in, the shared `kit`
  api.js         every database call (views never touch Supabase directly), friendly error messages
  store.js       cache: use(key, loader) → { loading | value | error }; invalidate() after writes; refresh() for polling
  perms.js       permission keys, default ranks, has()/canManage()/assignableRanks()
  forms.js       form schema, templates, validation (mirrors the server), summaries, CSV export     ← unit-tested
  checkin.js     rotating 6-digit attendance codes (same formula as public.club_code)              ← unit-tested
  ui.js          shared components: logos, cards, badges, states, form controls, file helpers
  clubs.css      club styles (app tokens, so light and dark both work)
  views/         feed, explore, profile, events, form, mine (+ Me), space, cert, posts (shared post card)
                 manage.js (console shell, overview, people, settings, handover, audit)
                 manage-content.js · manage-forms.js · manage-ops.js
app/src/admin/clubs-admin.js         Admin → Clubs: claims, all clubs, appoint admins, suspend, reports
```

Rule: **the database decides**. The app uses `perms.js` only to choose what to show. Every rule that matters
(audiences, ranks, limits, deadlines, anonymity) is enforced by row-level security or a `security definer` RPC.

## Who can do what

| Layer | How it's checked |
|---|---|
| Platform (EWUdiots team) | `public.can('clubs.manage' \| 'clubs.verify' \| 'clubs.moderate')`, the existing admin roles |
| Club | `public.club_can(club, 'perm')`, from the caller's active membership → `club_roles.perms`. `'*'` = everything |

Default ranks (renamable per club; 1 is the most senior):

| Rank | Role | Default permissions |
|---|---|---|
| 1 | Faculty Advisor | everything |
| 2 | Club Admin | everything |
| 3 | Executive Panel | posts, public posts, events, forms + responses + export, invite/approve/promote, attendance, polls, tasks, docs, see finance, certificates, moderate comments, audit |
| 4 | Wing Head | posts, events, create forms (no applicant phone numbers), attendance, polls, tasks, docs |
| 5 | Club Moderator | posts, moderate comments, attendance |
| 6 | Senior General Member | attendance |
| 7 | General Member | members' space only |

Nobody can give a rank at or above their own (Club Admins may add co-admins), and nobody can give a permission they
don't hold.

## Main flows

- **A club goes live.** The 23 clubs from ewubd.edu/clubs are seeded as `unclaimed`. A president taps *I run this
  club* (`claim_club`), or asks for a missing club (`request_club`). Admin → Clubs → *Verify* (`review_claim`) makes
  them Club Admin and the club `active` with the verified badge. The team can also appoint an admin directly
  (`admin_set_club_admin`).
- **Access granted by the club.** An organiser invites a student ID or email (`invite_member`). On sign-in the app
  calls `claim_club_invites()`, so the student simply *is* a member the next time they open Clubs.
- **Joining.** Open clubs: `join_club` makes you a member at once. Apply clubs: a join request, or the club's open
  membership form. Accepting either one creates the membership.
- **Forms.** The builder saves `fields` (JSON) and `settings`. `submit_response` re-checks the form is open, the
  deadline, the audience, required answers and the phone number, and puts people on the waitlist once the limit is
  reached (with an advisory lock, so the last place isn't given twice). `review_responses` changes status in bulk and
  messages each person.
- **Attendance.** A session has a secret (in `club_session_keys`, which members can't read). The screen shows
  `club_code(secret, floor(now/30s))`; `club_checkin` accepts the current and the previous code.
- **Elections.** `club_voted` (who voted) and `club_ballots` (what was chosen, no user on anonymous polls) are kept
  apart. Results come only from `poll_results`.
- **Year change.** `handover_term` saves the outgoing committee to `club_terms` (shown in History), moves executives
  and wing heads to Senior General Member, then applies the new roles.

Notifications use the existing in-app inbox (`user_messages`), written by the RPCs and triggers.

## Privacy

- Applicants' phone numbers: only roles with `forms.view_responses`.
- Exports go through `club_log_export`, which writes to `club_audit`.
- Member emails and student IDs: only roles with `members.approve` (`club_member_list`).
- Fellow members see name, role and wing.
- The privacy policy (`app/privacy.html`) and the Play data-safety answers (`store/data-safety.md`) describe this.

## Testing

| Command | What it checks |
|---|---|
| `npm test` | unit tests, including `tests/clubs.test.js` (permissions match the SQL, form validation, CSV injection, check-in codes) |
| `npm run test:clubs-rls` | 51 security checks played as admin, executive, member, applicant and outsider against the live database, in one transaction that is **rolled back** |
| `npm run test:clubs` | 30-step end-to-end run in Chrome against the live backend, with throwaway accounts (created confirmed, so no emails) and a throwaway club, all deleted afterwards. Screenshots go to `app/.shots/clubs` |
| `npm run lint` | ESLint on the whole app (also runs in CI) |

## Adding a feature

1. If it needs data, add a migration with RLS and, for anything with rules, an RPC. Extend `clubs-rls-check.mjs`.
2. Add the calls to `api.js`.
3. Add a view section. For console sections, use `{ label, icon, group, perm, render, mount }`; the console lists
   only sections the person may use.
4. If you add a permission, put it in `PERM_GROUPS` (perms.js) **and** the SQL. The unit test fails if they differ.
