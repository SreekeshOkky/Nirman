#!/usr/bin/env bash
# deploy-cloud.sh — create a new Supabase project + deploy to Vercel.
#
# Pauses for interactive logins (supabase login / vercel login) and prompts for
# any value not supplied via environment variables.
#
# Optional environment variables (avoids prompts):
#   SUPABASE_PROJECT_NAME   project name
#   SUPABASE_DB_PASSWORD    database password
#   SUPABASE_REGION         e.g. us-east-1
#   SUPABASE_ORG_ID         organization id
#   BUILDER_EMAIL / BUILDER_PASSWORD / BUILDER_NAME
#   VERCEL_SCOPE            Vercel team slug (optional)

set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Checking prerequisites (cloud)"
./scripts/check-prereqs.sh --cloud

json_get() {
  python3 -c "import json,sys; d=json.load(sys.stdin); print(eval(sys.argv[1]))" "$1"
}

echo "==> Supabase login"
supabase login

# --- organization -------------------------------------------------------
ORG_ID="${SUPABASE_ORG_ID:-}"
if [[ -z "$ORG_ID" ]]; then
  ORG_ID="$(supabase orgs list -o json | json_get "d[0]['id'] if d else ''" 2>/dev/null || true)"
fi
if [[ -z "$ORG_ID" ]]; then
  read -rp "Supabase org id: " ORG_ID
fi

# --- project ------------------------------------------------------------
NAME="${SUPABASE_PROJECT_NAME:-}"
[[ -z "$NAME" ]] && read -rp "Supabase project name: " NAME
DB_PASSWORD="${SUPABASE_DB_PASSWORD:-}"
[[ -z "$DB_PASSWORD" ]] && read -rsp "Database password: " DB_PASSWORD && echo
REGION="${SUPABASE_REGION:-us-east-1}"

echo "==> Creating Supabase project '$NAME' (region $REGION)"
supabase projects create "$NAME" \
  --org-id "$ORG_ID" \
  --db-password "$DB_PASSWORD" \
  --region "$REGION" \
  --output-format json

# Resolve the project ref by name (the ref is the 20-char id).
REF="$(supabase projects list -o json | \
  python3 -c "import json,sys; rows=json.load(sys.stdin); print(next((r.get('ref') or r.get('id') for r in rows if (r.get('name') or '')=='$NAME'), ''))")"
if [[ -z "$REF" ]]; then
  read -rp "Could not auto-detect project ref — enter it: " REF
fi
echo "· Project ref: $REF"

echo "==> Linking and pushing migrations"
supabase link --project-ref "$REF" --password "$DB_PASSWORD"
supabase db push --yes

echo "==> Fetching API keys"
KEYS="$(supabase projects api-keys --project-ref "$REF" --reveal -o json)"
ANON_KEY="$(printf '%s' "$KEYS" | python3 -c "import json,sys; rows=json.load(sys.stdin); print(next((r.get('api_key') or r.get('value') or '' for r in rows if any(t in (r.get('name') or '').lower() for t in ('anon','publishable','public'))), ''))")"
SERVICE_KEY="$(printf '%s' "$KEYS" | python3 -c "import json,sys; rows=json.load(sys.stdin); print(next((r.get('api_key') or r.get('value') or '' for r in rows if 'service' in (r.get('name') or '').lower()), ''))")"
: "${ANON_KEY:?could not detect anon key}"
: "${SERVICE_KEY:?could not detect service key}"

echo "==> Seeding the first builder account"
BUILDER_EMAIL="${BUILDER_EMAIL:-}"
BUILDER_PASSWORD="${BUILDER_PASSWORD:-}"
[[ -z "$BUILDER_EMAIL" ]] && read -rp "Builder email: " BUILDER_EMAIL
[[ -z "$BUILDER_PASSWORD" ]] && read -rsp "Builder password: " BUILDER_PASSWORD && echo
SUPABASE_URL="https://$REF.supabase.co" \
SUPABASE_SERVICE_KEY="$SERVICE_KEY" \
BUILDER_EMAIL="$BUILDER_EMAIL" \
BUILDER_PASSWORD="$BUILDER_PASSWORD" \
  python3 scripts/seed_builder.py

# --- Vercel -------------------------------------------------------------
echo "==> Vercel login"
vercel login

echo "==> Linking Vercel project"
vercel link --yes

set_env() {
  local key="$1" value="$2"
  for target in production preview development; do
    printf '%s' "$value" | vercel env add "$key" "$target" >/dev/null 2>&1 || \
      printf '%s' "$value" | vercel env add "$key" "$target"
  done
}

echo "==> Setting Vercel environment variables"
set_env VITE_SUPABASE_URL "https://$REF.supabase.co"
set_env VITE_SUPABASE_ANON_KEY "$ANON_KEY"
set_env VITE_API_URL "/api"
set_env SUPABASE_URL "https://$REF.supabase.co"
set_env SUPABASE_ANON_KEY "$ANON_KEY"
set_env SUPABASE_SECRET_KEY "$SERVICE_KEY"

# Branding + feature flags, if already set via scripts/rebrand.sh.
if [[ -f .env ]]; then
  for key in VITE_BRAND_NAME VITE_BRAND_LOGO VITE_THEME_ACCENT FEATURE_FLAGS; do
    val="$(grep -E "^${key}=" .env | head -1 | cut -d= -f2- || true)"
    [[ -n "$val" ]] && set_env "$key" "$val"
  done
fi

echo "==> Deploying to production"
vercel --prod

echo
echo "Deploy complete. Finish Supabase Auth redirect configuration:"
echo "  1. Add the new Vercel URL to supabase/config.toml under additional_redirect_urls."
echo "  2. Run: supabase config push"
echo "  3. Verify sign-up/sign-in at the deployed URL."
