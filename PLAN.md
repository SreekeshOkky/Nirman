# Nirmanam Construction Ledger

## Product goal

Nirmanam helps builders track income, expenses, notes, and accountability across construction sites. Builders own sites and have full control. Supervisors see only invited sites and can add ledger entries, but cannot manage site configuration or modify history.

## Stack

- React + Vite + TypeScript for the client
- FastAPI + Pydantic for the API
- Supabase PostgreSQL for data
- Supabase Auth for sign-in and invitations
- Supabase Storage for optional receipts
- Vercel for the frontend and FastAPI serverless function
- Recharts for financial visualizations

## Core data model

- `profiles`: authenticated user profile and role (`builder`, `supervisor`)
- `sites`: owned construction sites, budget, location, and lifecycle status
- `site_members`: supervisor-to-site access grants
- `invitations`: pending site invitations
- `categories`: default and site-specific income/expense categories
- `ledger_entries`: dated income and expense transactions
- `notes`: site or ledger-entry notes
- `attachments`: optional receipt metadata pointing to Supabase Storage
- `audit_logs`: append-only server-created history, visible only to builders

## Access model

Supabase Row Level Security is the final enforcement layer. A builder can manage owned sites. A supervisor can read and add entries only for invited sites. Supervisors cannot edit or delete entries, manage categories, invite members, or read audit logs. FastAPI repeats these checks for clear API behavior.

## Main API areas

- `/api/me`
- `/api/sites`
- `/api/sites/{site_id}/members`
- `/api/sites/{site_id}/categories`
- `/api/sites/{site_id}/ledger`
- `/api/sites/{site_id}/notes`
- `/api/sites/{site_id}/reports`
- `/api/sites/{site_id}/audit-logs` (builder only)

## Delivery phases

1. Establish the responsive dashboard and domain language.
2. Connect Supabase Auth and profile roles.
3. Add site creation, invitations, categories, and RLS policies.
4. Add create-only supervisor ledger access and builder editing.
5. Add monthly reports, CSV export, receipts, and audit-log persistence.
6. Add API tests, RLS tests, accessibility review, and Vercel deployment.

## Audit log

`audit_logs` is append-only and records actor, site, action, entity, timestamp, description, and JSON metadata. Events include site changes, invitations, category changes, ledger creation/edits/deletes, notes, uploads, and report exports. Only the site owner can select audit records; normal users cannot update or delete them.

## Local development

```bash
npm install
npm run dev
```

The current build uses local state to validate the product experience. The API boundary and domain objects are intentionally kept separate so Supabase can replace the local data without redesigning the UI.
