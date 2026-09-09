# Nirmanam

Nirmanam is a construction-site ledger for builders and supervisors. Builders can create sites, manage categories and team access, track income and expenses, add notes, and review reports and audit history. Supervisors can access only invited sites and add ledger entries and notes.

## Stack

- React and Vite
- Supabase Auth
- Supabase PostgreSQL and Row Level Security
- Supabase Storage for private receipt files
- FastAPI and Pydantic
- Vercel for frontend and Python serverless API deployment
- Recharts-compatible chart UI built into the frontend

## Requirements

- Node.js 20 or newer recommended
- npm
- Python 3.11 or newer recommended
- Supabase CLI 2.x
- A Supabase account with access to the project

Python 3.9 can work with the current dependency set, but Python 3.11 is the deployment target.

## Project layout

```text
.
├── api/                         FastAPI application
│   ├── main.py                  App and CORS setup
│   ├── index.py                 Vercel Python entrypoint
│   ├── dependencies.py          Auth and role checks
│   ├── routes.py                API endpoints
│   ├── schemas.py               Request validation
│   └── services.py              Audit helpers
├── src/                         React application
│   ├── components/              Shared components (AppLayout, PageSkeleton, etc.)
│   ├── lib/api.js               FastAPI client
│   ├── lib/supabase.js          Supabase browser client
│   ├── pages/                   Route pages
│   ├── main.jsx                 UI and application state
│   └── styles.css               UI styles
├── supabase/
│   ├── config.toml              Linked project/Auth configuration
│   └── migrations/              Database migrations
├── PLAN.md                      Product and architecture plan
├── SUPABASE.md                  Supabase setup reference
├── requirements.txt             Python dependencies
└── vercel.json                  Vercel routing configuration
```

## 1. Install dependencies

Install frontend dependencies:

```bash
npm install
```

Create a Python virtual environment, activate it, and install the API dependencies:

```bash
python3 -m venv .venv
. .venv/bin/activate
.venv/bin/python -m pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
```

The virtual environment is ignored by git.

When the environment is activated, these commands also work without the `.venv/bin/` prefix:

```bash
python -m pip install -r requirements.txt
uvicorn api.main:app --reload --port 8000
```

To leave the virtual environment:

```bash
deactivate
```

On Windows PowerShell, activate it with:

```powershell
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

## 2. Configure environment variables

Copy the example file for reference:

```bash
cp .env.example .env
```

For the frontend, create `.env.local`:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
VITE_API_URL=http://localhost:8000/api
```

For FastAPI, create or extend `.env`:

```bash
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
SUPABASE_SECRET_KEY=YOUR_SERVER_ONLY_SUPABASE_SECRET_KEY
FRONTEND_URL=http://localhost:5173
```

### Feature flags

Every feature ships enabled. On a deployment, set `FEATURE_FLAGS` to a JSON
object to turn features off; the flags are enforced by the API and the UI hides
the disabled features too. Features that can be flagged: `audit_log`,
`categories` (adding/managing your own categories), and `notes`.

```bash
FEATURE_FLAGS={"audit_log": false, "notes": false}
```

Never expose `SUPABASE_SECRET_KEY` to the browser. Only variables prefixed with `VITE_` are bundled into the frontend.

Get the publishable/anon and secret keys from **Supabase Dashboard > Project Settings > API** or with:

```bash
supabase projects api-keys --project-ref YOUR_PROJECT_REF
```

Do not paste keys into source files or commit local environment files.

## 3. Supabase setup

Check CLI authentication:

```bash
supabase login
supabase projects list
```

Link the repository to your Supabase project if needed:

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

Apply the database migration:

```bash
supabase db push
```

Apply the checked-in Auth/API configuration:

```bash
supabase config push
```

The migration creates:

- `profiles`
- `sites`
- `site_members`
- `invitations`
- `categories`
- `ledger_entries`
- `notes`
- `attachments`
- `audit_logs`

It also creates default user-level categories, profile creation triggers, timestamp triggers, RLS policies, and the private `receipts` bucket.

Verify migration state:

```bash
supabase migration list
supabase inspect db table-stats --linked
```

For local Supabase development:

```bash
supabase start
supabase db reset
```

`supabase db reset` destroys the local database. Never use it to reset the hosted project.

## 4. Auth configuration

Hosted Auth is configured through `supabase/config.toml`:

- Email sign-up enabled
- Email confirmation enabled
- Secure password changes enabled
- TOTP MFA preserved and enabled
- Local redirect URL set to `http://localhost:5173/**`

Before production deployment, add the Vercel URL under `additional_redirect_urls` and push the configuration again:

```toml
additional_redirect_urls = [
  "http://localhost:5173/**",
  "https://your-vercel-domain.vercel.app/**"
]
```

For production email confirmation and invitations, configure an SMTP provider in the Supabase dashboard. The default Supabase email service has sending limits.

New users receive a `profiles` record through the `on_auth_user_created` trigger. The migration defaults new profiles to `supervisor`; builder access should be granted through a controlled server-side/admin workflow rather than trusting a browser-provided role.

### Promote a user to builder

New registrations are supervisors by default. To create the initial builder account, run this once in **Supabase Dashboard > SQL Editor**:

```sql
update public.profiles
set role = 'builder',
    updated_at = now()
where email = 'your-email@example.com';
```

Verify the role:

```sql
select id, email, full_name, role
from public.profiles
where email = 'your-email@example.com';
```

The user must sign out and sign in again after the role is changed. Do not expose a public role-change endpoint, because that would allow users to promote themselves.

## 5. Run the application locally

Make sure the Supabase environment variables from the previous section are set before starting the app. Use two terminal windows.

### Terminal 1: FastAPI

```bash
. .venv/bin/activate
uvicorn api.main:app --reload --port 8000
```

The API will be available at:

```text
http://localhost:8000
http://localhost:8000/docs
```

### Terminal 2: React frontend

```bash
npm install
npm run dev
```

Open the application at:

```text
http://localhost:5173
```

For a frontend-only production check:

```bash
npm run build
npm run preview
```

If `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are not set, the UI displays a setup screen and does not load application data.

## 6. API endpoints

All protected endpoints expect:

```http
Authorization: Bearer SUPABASE_ACCESS_TOKEN
```

### Health and profile

```text
GET /health
GET /api/me
GET /api/overview
```

`/api/overview` is the workspace dashboard endpoint. It aggregates totals, budget, monthly status, and site-by-site balances across all non-archived sites the authenticated user can access. Site-specific ledger and report routes remain scoped to the selected site.

### Sites

```text
GET  /api/sites
POST /api/sites
GET  /api/sites/{site_id}
PATCH /api/sites/{site_id}
POST /api/sites/{site_id}/archive
```

### Members and invitations

```text
GET    /api/sites/{site_id}/members
POST   /api/sites/{site_id}/members/invite
DELETE /api/sites/{site_id}/members/{member_id}
POST   /api/invitations/{token}/accept
```

### Categories

Categories are user-level and shared across all sites a user owns.

```text
GET    /api/categories
POST   /api/categories
PATCH  /api/categories/{category_id}
POST   /api/categories/{category_id}/disable
GET    /api/sites/{site_id}/categories
```

`GET /api/sites/{site_id}/categories` returns the site owner's shared categories (deduplicated by name) plus any legacy site-level rows.

### Ledger

```text
GET    /api/sites/{site_id}/ledger
POST   /api/sites/{site_id}/ledger
GET    /api/sites/{site_id}/ledger/{entry_id}
PATCH  /api/sites/{site_id}/ledger/{entry_id}
DELETE /api/sites/{site_id}/ledger/{entry_id}
```

Ledger filters include `entry_type`, `category_id`, `from_date`, `to_date`, `search`, `page`, and `page_size`.

### Notes

```text
GET  /api/sites/{site_id}/notes
POST /api/sites/{site_id}/notes
```

### Reports

```text
GET /api/sites/{site_id}/summary
GET /api/sites/{site_id}/reports/monthly
GET /api/sites/{site_id}/reports/export
```

### Receipts

```text
POST /api/sites/{site_id}/attachments
```

Receipts accept JPG, PNG, and PDF files up to 10MB. Files are stored privately and returned with a one-hour signed URL.

### Builder-only audit history

```text
GET /api/audit-logs
GET /api/sites/{site_id}/audit-logs
```

`/api/audit-logs` returns audit history across **all** sites the builder can access, ordered by most recent. The Activity log page uses this endpoint and does not require a site to be selected.

`/api/sites/{site_id}/audit-logs` returns audit history for a single site and is available for any future per-site filtering needs.

Audit logs are written server-side after successful mutations and are append-only from the application perspective. Supervisors cannot read them.

## 7. Roles and security

### Builder

- Creates and manages sites
- Manages categories and supervisors
- Adds, edits, and soft-deletes ledger entries
- Views reports and audit logs across all accessible sites
- Adds notes

### Supervisor

- Sees only invited sites
- Adds ledger entries
- Adds notes
- Cannot manage sites, categories, or members
- Cannot edit/delete ledger history
- Cannot view audit logs

These rules are enforced in both FastAPI and PostgreSQL RLS. The FastAPI service-role client bypasses RLS, so every backend request performs its own access check before querying data.

## 8. Tests and checks

Run backend tests:

```bash
SUPABASE_URL=https://example.supabase.co \
SUPABASE_ANON_KEY=anon \
SUPABASE_SECRET_KEY=secret \
.venv/bin/pytest -q
```

Run the frontend production build:

```bash
npm run build
```

Compile-check the Python package:

```bash
python3 -m compileall api
```

## 9. Vercel deployment

Import the repository into Vercel. The existing `vercel.json` serves the Vite `dist` output and routes `/api/*` to the FastAPI Python function.

Set these Vercel environment variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_API_URL=/api
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SECRET_KEY
FRONTEND_URL=https://your-vercel-domain.vercel.app
```

Use the Supabase secret key only in Vercel server-side environment variables. Redeploy after adding environment variables.

After deployment:

1. Add the Vercel URL to `supabase/config.toml`.
2. Run `supabase config push`.
3. Add the same URL under Supabase Auth redirect URLs if needed.
4. Test sign-up, email confirmation, sign-in, site access, ledger creation, and supervisor restrictions.

## 10. Current limitations

- PDF report generation is not included; ledger CSV export is supported.
- Category edit/disable controls are available in the API and can be expanded in the UI.
- Vercel Python functions are serverless and are not intended for long-running workers or WebSocket connections.
- Skeleton loading replaces page content during site switch; stale site data is never shown alongside the loading state.

See `PLAN.md` and `SUPABASE.md` for the detailed architecture and database setup reference.
