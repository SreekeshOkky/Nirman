# AGENTS.md — Agent Playbook

This repository is a white-label construction-site ledger (React + Vite frontend,
FastAPI backend, Supabase for auth/database/storage). It is designed to be run
**agent-first**: an LLM agent follows the workflow below to rebrand the product
and deploy it for a customer, either locally (Docker) or to the cloud (Supabase
+ Vercel).

Read this file first whenever asked to "rebrand", "deploy", "launch", or "set up
an instance" of this app.

## Ground rules (always)

- **Never commit secrets.** All credentials live in the gitignored `.env` file,
  in each platform's CLI state, or as Vercel/Supabase env vars. Never write keys,
  tokens, or passwords into source files or into `git`.
- Never commit the customer's Supabase project ref (`supabase/.temp/` is already
  gitignored).
- Run the prerequisite checker before any deploy (`scripts/check-prereqs.sh`).
- Verify after deploy: `npm run build` must pass and the seeded builder account
  must be able to sign in.

## The workflow

The agent must drive this exact conversation, in order:

### Step 1 — Rebranding

Ask the user for:

| Setting | Env var | Default |
| --- | --- | --- |
| Product name | `VITE_BRAND_NAME` | `Nirmanam` |
| Logo URL | `VITE_BRAND_LOGO` | built-in mark |
| Accent color (hex) | `VITE_THEME_ACCENT` | `#ef6f39` |

Apply them with:

```bash
./scripts/rebrand.sh --name "Acme Builds" --logo "https://..." --accent "#1a73e8"
```

### Step 2 — Feature flags

Ask which features to disable (default: **all enabled**). Available flags:
`audit_log`, `categories`, `notes`, `signup`.

Example — disable notes and public sign-up:

```bash
./scripts/rebrand.sh --flags '{"notes": false, "signup": false}'
```

Note: `signup: false` only hides the "Create an account" UI entry point. To
hard-block registrations, also disable "Allow new users to sign up" in Supabase
Auth after the project is created.

### Step 3 — Local or cloud?

Ask the user: **local** or **cloud** deployment?

#### Local (single Docker experience)

Run:

```bash
./scripts/deploy-local.sh
```

What it does: checks prerequisites (installs/waits for Docker if needed), starts
the local Supabase stack (`supabase start`), applies migrations, seeds the first
builder account, writes `.env`, then builds and starts the app with one
`docker compose up`. The app is served at `http://localhost:8080`.

Prerequisites that must be available: Docker (with the daemon running) and the
Supabase CLI. The script handles detection and guides installation.

#### Cloud (Supabase + Vercel)

Run:

```bash
./scripts/deploy-cloud.sh
```

What it does: `supabase login` → create a new Supabase project (asks for a name,
database password, region, and org) → apply migrations → fetch API keys → seed
the builder → `vercel login` → create/link a Vercel project → set all env vars
(brand, feature flags, Supabase keys, `VITE_API_URL=/api`) → `vercel --prod`.

The script pauses for interactive logins and for any values it needs that were
not supplied as arguments/`read` prompts. After the first deploy, run the final
step it prints to add the Vercel URL to Supabase Auth redirect URLs and push the
config (`supabase config push`).

## Quick reference (commands the agent may need)

```bash
# Prerequisites (installs Docker/Supabase/Vercel CLIs if missing)
./scripts/check-prereqs.sh            # local path (requires Docker)
./scripts/check-prereqs.sh --cloud    # cloud path (no Docker required)

# Rebrand + flags
./scripts/rebrand.sh --name "X" --logo "URL" --accent "#hex" --flags '{"notes":false}'

# Seed the first builder account (uses SUPABASE_URL + service key)
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... BUILDER_EMAIL=... BUILDER_PASSWORD=... \
  python3 scripts/seed_builder.py

# Local
supabase start
supabase db reset --yes --local
supabase status -o env            # local anon/service keys
docker compose up --build -d

# Cloud
supabase login
supabase projects create <name> --org-id <org> --db-password <pw> --region <region>
supabase link --project-ref <ref> --password <pw>
supabase db push --yes
supabase projects api-keys --project-ref <ref> --reveal -o json
vercel login
vercel env add ... production
vercel --prod
```

## Repo layout (deployment-relevant)

```text
api/                 FastAPI backend (Vercel serverless via api/index.py)
src/                 React frontend (Vite)
supabase/            migrations + config.toml (linked ref is in .temp/, gitignored)
scripts/             Agent automation (check-prereqs, rebrand, seed, deploy-*)
Dockerfile.web       frontend build -> nginx
Dockerfile.api       FastAPI -> uvicorn
docker-compose.yml   local app (web + api)
nginx.conf           SPA fallback + /api reverse proxy
vercel.json          Vercel build + rewrites
```

## Safety & troubleshooting

- **Docker missing/not running**: `check-prereqs.sh` prints install commands and
  waits for `docker info`. On macOS, Docker Desktop must be launched.
- **Local API can't reach Supabase**: the API container talks to Supabase via
  `host.docker.internal` (wired in `docker-compose.yml`); the browser uses
  `http://127.0.0.1:54321`.
- **Email confirmation links**: after a cloud deploy, add the Vercel URL to
  `supabase/config.toml` under `additional_redirect_urls` and run
  `supabase config push` (the deploy script prints this reminder).
- **Failed seed**: `seed_builder.py` is idempotent for an existing email — it
  finds the existing user and sets `role = 'builder'` instead of failing.
