# Security

EWUdiots is an unofficial student project. If you find a security problem, please email **ewudiots@gmail.com** instead of opening a public issue. We'll reply within a few days.

## How the project is protected
- **No secrets in this repository.** The only keys in the code are the Supabase URL and its public "anon" key, which are meant to be public: every table is protected by Row Level Security, so the key alone can read nothing private.
- **Server-side rules.** Students can only read and change their own data. Admin actions (users, suspensions, security events) run as database functions that check the admin role on the server.
- **Accounts.** New accounts verify their email with a one-time code; students also scan both sides of their EWU ID card. Passwords need 8+ characters with letters and numbers; resets use one-time codes.
- **Website.** Strict security headers (Content-Security-Policy, HSTS, no framing, no sniffing).
- **GitHub.** Secret scanning with push protection, Dependabot security updates, and a protected `main` branch (no force-push or deletion). Signing keys, SMTP and Supabase credentials live only in a local `.secrets/` folder and in encrypted repository secrets.
