# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue:

1. Open the repository's **Security** tab and choose **Report a vulnerability**
   (https://github.com/ErfanTardast/nazm-journal/security/advisories/new).
2. If that button is not there, use the bug report form and write only "security contact request" in every required
   field, with no details. We will answer there with a private way to send them.

Say what is affected (a page, an API route, a setting), how to reproduce it, and what an attacker could do with it.
Nazm is a small project maintained in spare time: reports are answered as soon as possible, and fixes are released
on the `main` branch and in the next version. Please give us a reasonable time to fix a problem before you publish it.

> **فارسی:** مشکل امنیتی را در ایشوی عمومی ننویسید. از زبانهٔ Security گزینهٔ «Report a vulnerability» را بزنید. اگر
> نبود، فرم گزارش باگ را باز کنید و در هر خانهٔ اجباری فقط بنویسید «security contact request»، بدون هیچ جزئیاتی؛
> همان‌جا راه تماس خصوصی را می‌فرستیم.

## Supported versions

Only the latest release and the `main` branch get security fixes.

## Running your own instance

You are responsible for the instance you host: a long random `SESSION_SECRET`, HTTPS, closed or invite-only sign-up
(`REGISTRATION_INVITE_CODE`), the right `TRUSTED_PROXY_HOPS`, backups of the database, and keeping up with releases.
Every setting is described in `.env.example`. Never commit a `.env` file.

## What the app does to protect accounts and data

- Passwords are hashed with bcrypt. Changing the password signs out every other device.
- A session is a random token: the database keeps only its hash, and the browser keeps it in a signed, `httpOnly`,
  `SameSite=Lax` cookie (`Secure` in production).
- API input is validated with zod schemas; unknown fields are refused where a route says so. Every route that answers
  without a session limits the body size (a few KB for sign-in, sign-up, password reset and the risk calculators),
  and a CSV import may be up to 2 MB; a bigger body gets 413.
- Sign-in, sign-up, password changes and other sensitive routes are rate limited (Redis, or memory when Redis is not
  configured), by the client address the nearest trusted proxy saw.
- Production builds close sign-up unless an invite code or `REGISTRATION_OPEN=true` is set, and keep payment pages and
  demo mode off unless they are switched on at build time.
- Sensitive actions are written to an audit log; admin pages need the admin role.
- Responses carry security headers: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy`, and `Strict-Transport-Security` in production.
- The coach runs on the server with local rules by default (`AI_PROVIDER=local`). An outside AI provider is optional
  and off unless you configure one.
- No broker or exchange credentials are ever asked for or stored: Nazm imports the trader's own report files only.
