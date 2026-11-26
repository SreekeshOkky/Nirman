@AGENTS.md

# Rules for changing code

AGENTS.md above covers rebranding and deploying an instance. The rules below
apply to every code change, human or agent. They describe what the code already
does; follow the existing pattern over your defaults.

## Stack
- React 19 + React Router 7, built with Vite 8, installable PWA (`src/sw.js`).
- FastAPI on Python (`api/`), Supabase for auth, database and storage.
- JavaScript (JSX), no TypeScript. npm with `package-lock.json`. Node 22, Python 3.11+.
- Dev servers: `npm run dev` (port 5173) and `uvicorn api.main:app --reload --port 8000`.

## Commands
| Task | Command |
|---|---|
| Install | `npm ci && python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt` |
| Build (static check) | `npm run check` |
| Python tests | `.venv/bin/python -m pytest` |
| Component/unit tests | `npm test` |
| Browser tests | `npm run test:e2e` |
| App on the test Supabase (wipes it) | `npm run start:test -- 4173` |
| Format | `npm run format` |

## Layout
- `src/pages/`: one component per screen. Routes are in `src/App.jsx`.
- `src/components/`: layout, modals and shared pieces (`Shared.jsx`: `money`, `formatDate`, `EntryRow`, `PageHeading`).
- `src/lib/`: API client (`api.js`), Supabase client, brand, theme, feature flags, UPI scanning.
- `src/styles.css`: all styles and design tokens.
- `api/`: `routes.py` (endpoints), `schemas.py` (Pydantic), `dependencies.py` (auth and access checks), `services.py` (audit log), `features.py` (flags).
- `supabase/migrations/`: SQL schema and RLS policies.

## Code conventions
- JSX: function components, default export per page, double quotes, 2-space indent, Prettier formatting. Relative imports. Example: `src/pages/MePage.jsx`.
- All API calls go through `api` in `src/lib/api.js`. Pages get `token`, `flash`, `features` and friends as props from `App.jsx`.
- Short comments that explain why, above the code they describe.
- Python: `from __future__ import annotations`, type hints, 4-space indent. Pydantic models for every request body.
- Format money with `money()` and dates with `formatDate()` (Indian rupees and locale).

## API rules
- The API uses the service-role client, which bypasses RLS. Every endpoint that touches site data must call `ensure_site_access` (and `ensure_site_active` for writes). Example: `create_ledger_entry` in `api/routes.py`.
- Builder-only endpoints take the `Builder` dependency; others take `User`.
- The ledger is append-only in spirit: deletes are soft (`deleted_at`) and every change calls `record_audit`.
- Supervisors can add entries and notes, never change or delete past entries.
- Use `maybe_one()`, not `.maybe_single().execute().data`.

## Styling
- Plain CSS in `src/styles.css`. Use the tokens in `:root` (`--surface`, `--ink`, `--accent`, ...); don't hardcode colors.
- Dark mode is `:root[data-theme="dark"]`. The brand accent is white-labelled: derive shades with `color-mix()`.
- Main breakpoint is `max-width: 800px` (sidebar becomes a bottom bar).

## Accessibility
- Buttons that hold only an icon need an `aria-label` or `title`.
- Dialogs use `src/components/Modal.jsx`. Name regions with `aria-label`, as `HomePage.jsx` does.

## Sync points
- New or changed table, column or policy: add a **new** migration in `supabase/migrations/` (with RLS policies). Update `tests/supabase/seed.py` if the demo data needs it.
- New feature flag: `api/features.py` and `src/lib/features.js`, plus README.
- New route: `src/App.jsx` and `docs/app-navigation.md`.
- Brand name or accent defaults: `src/lib/brand.js`, `vite.config.js`, `src/styles.css`.
- New environment variable: `.env.example` (human only), `docker-compose.yml`, README.

## Tests
- Python tests live in `tests/`; copy `tests/test_supabase.py` (the `api` fixture runs the real API on a real test Supabase, rebuilt from the migrations once per run).
- Test row-level security by calling Supabase directly with a user's token, as in the last test there.
- Component tests live in `tests/unit/` (Vitest + Testing Library); copy `tests/unit/shared.test.jsx`.
- Browser tests live in `tests/e2e/` (Playwright); copy `tests/e2e/sign-in.spec.js`.
- Tests need the factory's local Supabase (`services/supabase.yml` in the factory repo) and nothing else: no secrets, internet or hosted project. `tests/supabase/env.py` says where it is; `FACTORY_SUPABASE_*` variables point elsewhere.
- `reset()` wipes the database. It refuses any host but the factory's unless `FACTORY_SUPABASE_ALLOW_RESET=1`.

## Commits
- Prefixes: `feat:`, `fix:`, `perf:`, `refactor:`, `test:`, `docs:`, followed by a plain sentence. Example: `feat: site-first layout with bottom navigation`.
- No ticket keys in the subject; the factory adds a `Jira: KEY` trailer.

## Off limits
Changes to these need a human. Agents must not edit them:
- `.env*`: secrets.
- Existing files in `supabase/migrations/`: already applied to databases. Add a new file.
- `supabase/config.toml`, `vercel.json`: hosted configuration.
- `scripts/deploy-*.sh`, `scripts/rebrand.sh`, `opencode.json`: deploys and tooling.
- `factory.yml`.

## Factory
This repo is served by the software factory (`factory.yml`).
- `factory.yml` `check && test` is the red/green gate: it must fail on the red commit and pass on the final one.
- `ticket_modes` in `factory.yml` say what the red tests must assert.
- The factory has only its throwaway local Supabase and no deploy access: ignore the AGENTS.md deploy workflow while working on a ticket.
- The verifier uses `docs/app-navigation.md`. Update it when you add or move a route or persistent UI.
