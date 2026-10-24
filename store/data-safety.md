# Play Console → Data safety answers

**Does your app collect or share any of the required user data types?** Yes
**Is all user data encrypted in transit?** Yes (HTTPS / TLS to Supabase and Anthropic)
**Do you provide a way for users to request that their data be deleted?** Yes. In-app (Account & settings → Delete my account) and https://ewudiots.app/delete-account.html

| Data type (Play category) | Collected | Shared* | Optional? | Purpose |
|---|---|---|---|---|
| Personal info → Name | Yes | No | Optional (only if signed in; otherwise stays on device) | App functionality |
| Personal info → Email address | Yes | No | Optional (sign-in) | Account management, app functionality |
| Personal info → Other info (student ID, program, department, advisor) | Yes | No | Optional | App functionality |
| App activity → Other user-generated content (reviews, shared files; plus course notes, links and flashcards in the private backup) | Yes | No | Optional (backup only if signed in) | App functionality |
| App activity → Other actions (focus sessions, XP, badges, in the private backup) | Yes | No | Optional (backup only if signed in) | App functionality |
| Files and docs (shared study materials) | Yes | No | Optional | App functionality |
| Photos (portal screenshots, Smart scan only) | Yes, processed ephemerally | No | Optional | App functionality. Not stored. |
| Other: academic records (courses, grades, tuition amounts) | Yes | No | Optional | App functionality |

\*Under Play's definition, sending data to a service provider that processes it for you (Supabase hosting, Anthropic for Smart scan) is **not** "sharing".

**Not collected:** location, contacts, phone number, financial account info, health, messages, calendar, web history, device or advertising IDs, crash or diagnostics (no SDKs).

**Ephemeral processing:** screenshots sent for Smart scan are processed in memory and not retained by EWUdiots.

### Apple App Store (later): App Privacy "nutrition label"
- Data linked to you: Contact info (email), User content (reviews, files), Other data (academic records). Purpose: App functionality.
- Data not linked to you: none collected.
- Tracking: No.
