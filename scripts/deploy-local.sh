#!/usr/bin/env bash
# deploy-local.sh — run the full app locally: local Supabase + app in Docker.
#
# What it does:
#   1. Checks prerequisites (Docker + Supabase CLI).
#   2. Starts the local Supabase stack.
#   3. Applies migrations.
#   4. Seeds the first builder account.
#   5. Writes `.env` with local keys + branding + feature flags.
#   6. Builds and starts the app with `docker compose up`.
#
# The app is served at http://localhost:8080.

set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Checking prerequisites"
./scripts/check-prereqs.sh

echo "==> Starting local Supabase stack"
if ! supabase status >/dev/null 2>&1; then
  supabase start
else
  echo "· Supabase stack already running"
fi

echo "==> Applying migrations"
supabase db reset --yes --local

echo "==> Reading local Supabase keys"
eval "$(supabase status -o env)"
# `supabase status -o env` exposes API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL.
: "${API_URL:?missing API_URL}"
: "${ANON_KEY:?missing ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing SERVICE_ROLE_KEY}"

echo "==> Seeding the first builder account"
BUILDER_EMAIL="${BUILDER_EMAIL:-}"
BUILDER_PASSWORD="${BUILDER_PASSWORD:-}"
if [[ -z "$BUILDER_EMAIL" ]]; then
  read -rp "Builder email: " BUILDER_EMAIL
fi
if [[ -z "$BUILDER_PASSWORD" ]]; then
  read -rsp "Builder password: " BUILDER_PASSWORD
  echo
fi
SUPABASE_URL="$API_URL" \
SUPABASE_SERVICE_KEY="$SERVICE_ROLE_KEY" \
BUILDER_EMAIL="$BUILDER_EMAIL" \
BUILDER_PASSWORD="$BUILDER_PASSWORD" \
  python3 scripts/seed_builder.py

echo "==> Writing .env for the app + docker compose"
tmp="$(mktemp)"
{
  if [[ -f .env ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      case "${line%%=*}" in
        VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY|VITE_API_URL|SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_SECRET_KEY|FRONTEND_URL)
          continue ;;  # replaced below
        *)
          echo "$line" ;;
      esac
    done < .env
  fi
  echo "VITE_SUPABASE_URL=$API_URL"
  echo "VITE_SUPABASE_ANON_KEY=$ANON_KEY"
  echo "VITE_API_URL=/api"
  echo "SUPABASE_URL=$API_URL"
  echo "SUPABASE_ANON_KEY=$ANON_KEY"
  echo "SUPABASE_SECRET_KEY=$SERVICE_ROLE_KEY"
  echo "FRONTEND_URL=http://localhost:8080"
} > "$tmp"
mv "$tmp" .env

echo "==> Building and starting the app (web + api)"
docker compose up --build -d

echo
echo "Done. Open http://localhost:8080"
echo "Sign in with $BUILDER_EMAIL"
