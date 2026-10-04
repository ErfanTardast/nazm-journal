# Releasing Nazm

How a version of Nazm is cut, and how someone who hosts it upgrades. Versions follow [Semantic Versioning](https://semver.org/);
while the version is 0.x, a minor version can change behaviour.

## Cutting a version

1. **Write the changelog section.** Add `## [X.Y.Z] - YYYY-MM-DD` at the top of `CHANGELOG.md`, with the changes grouped
   under Added, Changed and Fixed, and the link line `[X.Y.Z]: ...releases/tag/vX.Y.Z` at the bottom. Say in the section
   when the release adds a migration (a new folder in `prisma/migrations`) or a new setting (a new line in
   `.env.example`), because a person who upgrades needs to know.
2. **Set the version.** `npm version X.Y.Z --no-git-tag-version` changes the version in `package.json` and
   `package-lock.json` together. A test fails when either differs from the newest changelog section.
3. **Run the four checks** that CI runs, and wait for all of them to pass:

   ```bash
   npm run typecheck
   npm run lint
   npm run test
   npm run build
   ```

4. **Commit** the changelog and the version (`Release X.Y.Z`), push to `main`, and wait for CI to pass.
5. **Tag** that commit and push the tag:

   ```bash
   git tag -a vX.Y.Z -m "Nazm X.Y.Z"
   git push origin vX.Y.Z
   ```

6. **Publish a GitHub release** for the tag, with the changelog section as its notes (Releases, then "Draft a new
   release", or `gh release create vX.Y.Z --title "Nazm X.Y.Z" --notes-file <file with the section>`).

## Upgrading a server you host

1. **Read the changelog** from your version up to the new one. A migration or a new setting is named there.
2. **Back up the database first**, for example
   `pg_dump -Fc -h <host> -U <user> <database> > nazm-before-upgrade.dump`. Migrations only go forward: to go back,
   restore the backup and run the older image.
3. **Get the new code:** `git pull`, or `git fetch --tags` and `git checkout vX.Y.Z`.
4. **Rebuild the image:** `docker build -t nazm .` (the compose file is a local stack, not for a server). The build
   compiles `NEXT_PUBLIC_PAYMENTS_ENABLED` and `NEXT_PUBLIC_DEMO_MODE` in, so pass the same `--build-arg` values you
   used before; empty keeps payments and demo mode off.
5. **Start the new container** with the same environment variables. On start it runs `prisma migrate deploy`, which
   applies the migrations that are new, and then starts the app. If a migration fails, the container exits without
   starting: read its log, restore the backup if the database was changed, and report the problem.
6. **Check it.** `GET /api/health` answers `{"status":"ok","database":"ok"}`. On a server with invite-only sign-up and
   payments and demo mode off, `npm run verify:deploy -- https://your.host` repeats the checks from outside: security
   headers, payment and demo routes hidden, sign-up needing the invite code, no stack traces in error answers, the
   redirect from http to https, and that a forged `X-Forwarded-For` cannot get around the sign-in limit. It creates no
   accounts, and its last check blocks sign-in from your address for about a minute.

Changing `SESSION_SECRET` signs everyone out. Keep it the same across upgrades.

## The installable app (PWA)

- A web app manifest at `/manifest.webmanifest`: short name Nazm, standalone display, and the PNG icons in
  `public/icons` (192, 256, 384 and 512 pixels, and a 512-pixel maskable icon).
- A service worker, `public/sw.js`, that production builds register. It caches the offline page and static files, and
  never caches API answers or pages that hold a signed-in person's data.
- An offline page at `/offline`, in both languages, that the service worker shows when a page cannot be fetched.
- Only GET requests are handled; nothing is queued while offline.
- Browsers offer to install the app only over HTTPS (or on `localhost`).
