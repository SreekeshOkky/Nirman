#!/usr/bin/env bash
# Build the web app against the test Supabase and serve it with the API.
# Usage: tests/supabase/start.sh [port]     WIPES the test database.
set -euo pipefail
cd "$(dirname "$0")/../.."

port="${1:-${PORT:-4173}}"
dist="dist-test-$port"
python="${PYTHON:-.venv/bin/python}"

url="$("$python" -c 'from tests.supabase import env; print(env.URL)')"
key="$("$python" -c 'from tests.supabase import env; print(env.ANON_KEY)')"

VITE_SUPABASE_URL="$url" VITE_SUPABASE_ANON_KEY="$key" VITE_API_URL="/api" \
VITE_BRAND_NAME="" VITE_BRAND_LOGO="" VITE_THEME_ACCENT="" \
  npx vite build --outDir "$dist" --emptyOutDir

PORT="$port" WEB_DIST="$dist" exec "$python" -m tests.supabase.serve
