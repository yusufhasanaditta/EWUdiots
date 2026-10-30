# Play Console → Data safety answers

**Does your app collect or share any of the required user data types?** Yes
**Is all user data encrypted in transit?** Yes (HTTPS / TLS to Supabase)
**Do you provide a way for users to request that their data be deleted?** Yes. In-app (Account & settings → Delete my account) and https://ewudiots.vercel.app/delete-account.html

| Data type (Play category) | Collected | Shared* | Optional? | Purpose |
|---|---|---|---|---|
| Personal info → Name | Yes | No | Optional (only if signed in; otherwise stays on device) | App functionality |
| Personal info → Email address | Yes | No | Optional (sign-in) | Account management, app functionality |
| Personal info → Other info (student ID, program, department, advisor) | Yes | No | Optional | App functionality |
| App activity → Other user-generated content (reviews, event posts, shared files; plus course notes, links and flashcards in the private backup) | Yes | No | Optional (backup only if signed in) | App functionality |
| App activity → Other actions (focus sessions, XP, badges, in the private backup) | Yes | No | Optional (backup only if signed in) | App functionality |
| Files and docs (shared study materials) | Yes | No | Optional | App functionality |
| Photos (profile photo; ID card front and back for student verification) | Yes | No | Optional | Account management, app functionality. ID card photos are visible only to the student and EWUdiots admins. Portal screenshots are read on the phone and never uploaded. |
| Other: academic records (courses, grades, tuition amounts) | Yes | No | Optional | App functionality |
| Personal info → Phone number (EWUdiots Club forms that ask for it) | Yes | No | Optional (only when the student fills in such a form) | App functionality: the club's organisers contact applicants. Visible only to that club's organisers with the responses permission; exports are audit-logged. |
| App activity → Other user-generated content (club posts, comments, form answers, poll votes, attendance) | Yes | No | Optional | App functionality. Anonymous poll ballots are stored without the voter. |

\*Under Play's definition, sending data to a service provider that processes it for you (Supabase hosting, Gmail for sign-in codes) is **not** "sharing".

**Not collected:** location, contacts, financial account info, health, messages, calendar, web history, device or advertising IDs, crash or diagnostics (no SDKs).

**On-device processing:** portal screenshots and ID card scans are read on the phone (no upload). Portal sign-in (Android) sends the student's password only to EWU's own portal inside the phone; EWUdiots never receives it. If the student ticks "Remember on this phone", it is stored only on the device, encrypted with an Android keystore key (on-device storage is not "collection" under Play's definition).

### Apple App Store (later): App Privacy "nutrition label"
- Data linked to you: Contact info (email), User content (reviews, files, photos), Other data (academic records). Purpose: App functionality.
- Data not linked to you: none collected.
- Tracking: No.
