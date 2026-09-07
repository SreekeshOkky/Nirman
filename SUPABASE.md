# Supabase Setup

This project uses Supabase for authentication, PostgreSQL, storage, and row-level access control. The migration in `supabase/migrations/202409230001_initial_schema.sql` creates the initial application schema.

The repository is linked to the existing hosted project **Nirman** with reference `yyvzvuycubhddfpfpdmk`.

## 1. Create the project

1. Create a project at [supabase.com](https://supabase.com).
2. Choose a strong database password and keep it outside the repository.
3. From **Project Settings > API**, copy:
   - Project URL
   - Publishable/anon key
   - Service role key
4. From **Authentication > URL Configuration**, add the local and production URLs:
   - `http://localhost:5173`
   - The Vercel production URL
   - Any Vercel preview URL pattern used by the team

The Supabase secret key bypasses RLS. It must only be used by FastAPI server-side code and must never be placed in `VITE_*` variables or shipped to the browser.

## 2. Install the Supabase CLI

The CLI can be installed with Homebrew on macOS:

```bash
brew install supabase/tap/supabase
supabase login
```

Link the local repository to the hosted project:

```bash
supabase link --project-ref yyvzvuycubhddfpfpdmk
```

The linked project URL is `https://yyvzvuycubhddfpfpdmk.supabase.co`.

## 3. Apply migrations

The migration files are ordered by filename. Apply them to a linked project with:

```bash
supabase db push
supabase config push
```

For local development, start the Supabase stack and apply migrations locally:

```bash
supabase start
supabase db reset
```

`db reset` is destructive for the local database. Do not use it against production.

The checked-in `supabase/config.toml` configures hosted Auth for email signup and confirmation, keeps TOTP MFA enabled, and uses local development redirects. Add the production Vercel URL to `additional_redirect_urls` before running `supabase config push` for production.

Inspect the generated database plan before applying a new migration:

```bash
supabase db diff --schema public
```

## 4. Environment variables

Create `.env.local` for Vite:

```bash
VITE_SUPABASE_URL=https://yyvzvuycubhddfpfpdmk.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_KEY
VITE_API_URL=http://localhost:8000/api
```

Create a separate server environment for FastAPI:

```bash
SUPABASE_URL=https://yyvzvuycubhddfpfpdmk.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=YOUR_SUPABASE_SECRET_KEY
SUPABASE_JWT_SECRET=YOUR_JWT_SECRET
```

Do not commit either file. Keep `.env.example` as the safe template for the repository.

## 5. Authentication configuration

The first version uses email and password authentication:

1. Open **Authentication > Providers**.
2. Enable **Email**.
3. Keep email confirmation enabled for production.
4. Configure an SMTP provider before inviting real users. Supabase's default email service is intended for development and has sending limits.

On sign-up, the database trigger creates a `public.profiles` row from the new `auth.users` record. The frontend should collect the user's name and intended role, then update the profile through a protected API route. Do not allow a browser to promote itself to builder; builder creation or role changes should be controlled by an admin workflow or a server-side invite process.

## 6. Storage for receipts

The initial migration creates the `receipts` bucket as private. Upload files using a path scoped to the site and entry:

```text
{site_id}/{ledger_entry_id}/{uuid}-{filename}
```

Use signed URLs for viewing. Do not make the bucket public. Storage policies should verify that the requesting user owns or belongs to the referenced site. A later migration can add these policies once receipt uploads are enabled in the API.

## 7. RLS behavior

The migration enables RLS on every application table.

- Builders can fully manage sites they own.
- Supervisors can read sites where they are members.
- Supervisors can insert ledger entries and notes for assigned sites.
- Supervisors cannot update or delete ledger entries.
- Only builders can create or change categories and members.
- Audit logs are selectable only by the site owner.
- Audit logs cannot be updated or deleted by normal users.

FastAPI should still perform the same checks for useful error responses. RLS remains the database-level protection if a client bypasses the API.

## 8. Audit log implementation

Audit rows are created by FastAPI after a successful mutation using the secret-key client. This prevents a user from fabricating or removing their own history. The table is append-only from the application perspective.

Each event should include:

- `site_id`
- `actor_id`
- `action`
- `entity_type`
- `entity_id`
- Human-readable `description`
- Before/after information in `metadata` where appropriate

Examples include `ledger_entry_created`, `ledger_entry_updated`, `ledger_entry_deleted`, `member_invited`, `category_created`, and `report_exported`.

## 9. Production checklist

- Apply migrations to the production project with `supabase db push`.
- Confirm RLS is enabled for all public tables.
- Confirm the service role key is not present in the frontend bundle.
- Configure production auth redirect URLs.
- Configure SMTP for invitations and password resets.
- Set a database and storage backup policy.
- Add the Vercel deployment URL to Supabase allowed origins.
- Verify a supervisor cannot read another site's data.
- Verify a supervisor cannot read audit logs.
- Verify deleted ledger entries remain represented in audit history.
