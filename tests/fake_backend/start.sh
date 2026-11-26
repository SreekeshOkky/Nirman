#!/usr/bin/env bash
# Build the web app against the fake backend and serve both on one port.
# Usage: tests/fake_backend/start.sh [port]     (test-only, no real Supabase)
set -euo pipefail
cd "$(dirname "$0")/../.."

port="${1:-${PORT:-4173}}"
dist="dist-fake-$port"

VITE_SUPABASE_URL="http://localhost:$port" \
VITE_SUPABASE_ANON_KEY="fake-anon-key" \
VITE_API_URL="/api" \
VITE_BRAND_NAME="" VITE_BRAND_LOGO="" VITE_THEME_ACCENT="" \
  npx vite build --outDir "$dist" --emptyOutDir

PORT="$port" FAKE_DIST="$dist" exec "${PYTHON:-.venv/bin/python}" -m tests.fake_backend
