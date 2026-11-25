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
#   TELEGRAM_BOT_TOKEN      Telegram bot token from @BotFather (optional;
#                           empty skips the bot)
#   APP_URL                 production URL, for the Telegram webhook

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

# Telegram bot (optional): screenshots sent to it become site expenses.
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
if [[ -z "$TELEGRAM_BOT_TOKEN" && -t 0 ]]; then
  read -rsp "Telegram bot token from @BotFather (Enter to skip): " TELEGRAM_BOT_TOKEN && echo
fi
if [[ -n "$TELEGRAM_BOT_TOKEN" ]]; then
  echo "==> Configuring the Telegram bot"
  TELEGRAM_BOT_USERNAME="$(curl -fsS "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe" | json_get "d['result']['username']")"
  TELEGRAM_WEBHOOK_SECRET="$(openssl rand -hex 24)"
  INTERNAL_API_SECRET="$(openssl rand -hex 24)"
  set_env TELEGRAM_BOT_TOKEN "$TELEGRAM_BOT_TOKEN"
  set_env TELEGRAM_BOT_USERNAME "$TELEGRAM_BOT_USERNAME"
  set_env TELEGRAM_WEBHOOK_SECRET "$TELEGRAM_WEBHOOK_SECRET"
  set_env INTERNAL_API_SECRET "$INTERNAL_API_SECRET"
  echo "· Bot: @$TELEGRAM_BOT_USERNAME"
fi

# Run the API in the Vercel region closest to the database: every request
# makes several database calls, so distance between them adds up fast.
case "$REGION" in
  us-east-1) VERCEL_REGION=iad1 ;; us-east-2) VERCEL_REGION=cle1 ;;
  us-west-1) VERCEL_REGION=sfo1 ;; us-west-2) VERCEL_REGION=pdx1 ;;
  ca-central-1) VERCEL_REGION=yul1 ;; sa-east-1) VERCEL_REGION=gru1 ;;
  eu-west-1) VERCEL_REGION=dub1 ;; eu-west-2) VERCEL_REGION=lhr1 ;;
  eu-west-3) VERCEL_REGION=cdg1 ;; eu-central-1) VERCEL_REGION=fra1 ;;
  eu-north-1) VERCEL_REGION=arn1 ;; ap-south-1) VERCEL_REGION=bom1 ;;
  ap-southeast-1) VERCEL_REGION=sin1 ;; ap-southeast-2) VERCEL_REGION=syd1 ;;
  ap-northeast-1) VERCEL_REGION=hnd1 ;; ap-northeast-2) VERCEL_REGION=icn1 ;;
  *) VERCEL_REGION="" ;;
esac
if [[ -n "$VERCEL_REGION" ]]; then
  echo "==> Running the API in Vercel region $VERCEL_REGION (next to $REGION)"
  VERCEL_REGION="$VERCEL_REGION" python3 - <<'PY'
import json, os
config = json.load(open("vercel.json"))
config["regions"] = [os.environ["VERCEL_REGION"]]
open("vercel.json", "w").write(json.dumps(config, indent=2) + "\n")
PY
else
  echo "! No Vercel region mapped for $REGION; set \"regions\" in vercel.json by hand."
fi

echo "==> Deploying to production"
vercel --prod

if [[ -n "$TELEGRAM_BOT_TOKEN" ]]; then
  APP_URL="${APP_URL:-}"
  [[ -z "$APP_URL" ]] && read -rp "Production URL (e.g. https://acme.vercel.app): " APP_URL
  echo "==> Pointing the Telegram bot at $APP_URL"
  TELEGRAM_BOT_TOKEN="$TELEGRAM_BOT_TOKEN" TELEGRAM_WEBHOOK_SECRET="$TELEGRAM_WEBHOOK_SECRET" \
    python3 scripts/setup_telegram.py --webhook-url "$APP_URL"
fi

echo
echo "Deploy complete. Finish Supabase Auth redirect configuration:"
echo "  1. Set site_url to the Vercel URL and add \"<vercel-url>/**\" to"
echo "     additional_redirect_urls in supabase/config.toml (invite and"
echo "     password-reset emails link to <vercel-url>/welcome)."
echo "  2. Run: supabase config push"
echo "  3. Verify sign-up/sign-in at the deployed URL."
