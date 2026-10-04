# Contributing to Nazm

Thank you for helping. Nazm is a trading journal and discipline tool in two languages: Persian (right to left, the
primary language) and English. This page says how to set up, how changes are tested, and the few rules every change
follows.

> **فارسی:** مشارکت به فارسی هم پذیرفته است. ایشو و درخواست ادغام (pull request) را به فارسی یا انگلیسی بنویسید.
> قانون‌های پایین برای هر تغییری برقرارند، به‌خصوص «دامنهٔ محصول» و «دو زبان».

## What Nazm is, and what it will not become

Nazm helps a trader plan a trade, record it, review it and keep risk inside their own limits. It is a review and
discipline tool. Changes that move it toward any of these are out of scope and will not be merged:

- placing, routing or executing orders, or connecting to a broker or exchange account;
- trading signals, price predictions, "buy/sell" calls, copy trading or auto trading;
- financial advice, or any wording that promises or implies profit.

Read-only import of the trader's own history (the MT5 report, CSV) is in scope. When in doubt, open an issue first.
`tests/unit/product-scope.test.ts` fails when forbidden wording appears in the screens it lists.

Payments exist in the code. Production builds keep them off unless `NEXT_PUBLIC_PAYMENTS_ENABLED=true` at build time;
in development they are on. Please do not build on them without talking to the maintainers first.

## Set up

Follow [Develop locally](README.md#develop-locally) in the README: Node.js 24, Docker for PostgreSQL (or your own
PostgreSQL 16), then `npm ci`, the database, `npm run db:seed` and `npm run dev`.

## Checks

Every pull request must pass the same four steps that CI runs:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

CI also runs `npm audit --omit=dev --audit-level=critical`. If it fails on a package your change does not touch, say so in
the pull request: a new advisory is the maintainers' to fix.

`npm run test` runs the unit and component tests (Vitest and Testing Library, about 3,000 tests, a few minutes). While
you work, run only the files you touch, for example `npx vitest run tests/unit/mt5-report.test.ts`.

The end-to-end tests (`tests/e2e`, Playwright) are optional for a contribution; see
[End-to-end tests](README.md#end-to-end-tests) in the README.

## How a change is made

- **Test first.** For a behaviour change, write or extend a test that fails, then make it pass. A test asserts what a
  user or a caller would notice (the text on screen, the API answer, the stored row), not that a mock was called.
- **Small pull requests, one topic each.** Say what changed, why, and how you checked it. For a screen, add a
  screenshot in both languages, on a phone width (375 px) and a desktop width.
- **Database changes** go through Prisma migrations in `prisma/migrations`: change `prisma/schema.prisma`, then
  `npx prisma migrate dev --name <what-changed>`. Never edit a migration that is already merged.
- **Dependencies:** add them only when needed. `package-lock.json` must install with `npm ci` on Linux (CI and the
  Docker image run on Linux); an `npm install` on Windows or macOS can leave out packages for other platforms, and
  `tests/unit/lockfile-complete.test.ts` catches that.
- **Errors:** never show raw server error text on a screen. API errors carry a code; map it to the screen's own text, and
  use `apiErrorText` (`src/lib/api/error-text.ts`) for the rest.
- **Empty pages** say what to do next: `EmptyState` (`src/components/ui/state.tsx`) takes `actions`.
- **Every claim in the product's text must be true for what the code does.** If a sentence says "not sent to an outside
  service", the code must guarantee it.

## Two languages

- Every text a user sees exists in Persian and English. Shared strings live in `src/messages/fa.json` and
  `src/messages/en.json`; many screens keep a `copy = { en: {...}, fa: {...} }` object next to the component.
- A Persian page is fully Persian and an English page fully English (brand names, symbols such as EURUSD and "MT5"
  are fine).
- Persian text is natural Persian, with the half-space (ZWNJ, `‌`) where it belongs: «می‌شود», «معامله‌ها».
  Numbers, dates and money on Persian pages use the helpers in `src/lib/i18n/format.ts`, which print Persian digits.
- Layouts work right to left: use logical properties (`ms-`, `me-`, `ps-`, `pe-`, `start`, `end`) instead of
  left/right, and check the page at 375 px for sideways scrolling.
- Glossary, used everywhere:

  | English | Persian |
  |---|---|
  | Trade | معامله |
  | Journal | ژورنال |
  | Review | مرور |
  | Plan | پلن (never «برنامه» for a plan; «برنامه‌ریزی» is the activity) |
  | Strategy | استراتژی |
  | Playbook | پلی‌بوک |
  | Scenario simulator | شبیه‌ساز سناریو |
  | Nazm (the product) | نظم; in running text «اپ نظم» where the bare word could read as "discipline" |

## Reporting a security problem

Please do not open a public issue. See [SECURITY.md](SECURITY.md).

## Conduct

Be kind and specific. Criticise code, not people. Maintainers may close issues or pull requests that are hostile or
off topic.

## License

Nazm is licensed under the GNU Affero General Public License, version 3 or later. By sending a contribution you agree
that it is licensed under the same terms (see [LICENSE](LICENSE)).
