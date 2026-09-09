#!/usr/bin/env bash
# check-prereqs.sh — verify (and help install) the toolchain for a deploy.
#
# Usage:
#   ./scripts/check-prereqs.sh           # local path (requires Docker)
#   ./scripts/check-prereqs.sh --cloud   # cloud path (Docker not required)
#
# Exits non-zero with an actionable message if something required is missing.

set -euo pipefail

MODE="local"
[[ "${1:-}" == "--cloud" ]] && MODE="cloud"

need_docker="yes"
[[ "$MODE" == "cloud" ]] && need_docker="no"

fail() {
  echo "✗ $1" >&2
  exit 1
}

ok() {
  echo "✓ $1"
}

have() {
  command -v "$1" >/dev/null 2>&1
}

is_macos() { [[ "$(uname -s)" == "Darwin" ]]; }
is_linux() { [[ "$(uname -s)" == "Linux" ]]; }

# --- Docker -------------------------------------------------------------
if [[ "$need_docker" == "yes" ]]; then
  if have docker; then
    ok "docker ($(docker --version | sed 's/^Docker version //'))"
    if docker info >/dev/null 2>&1; then
      ok "docker daemon is running"
    else
      echo "! Docker is installed but the daemon is not running." >&2
      if is_macos; then
        echo "  Start Docker Desktop (open -a Docker) or 'colima start', then retry." >&2
      else
        echo "  Run: sudo systemctl start docker   (or start your Docker daemon)." >&2
      fi
      fail "Waiting for the Docker daemon is required for the local deploy."
    fi
    if docker compose version >/dev/null 2>&1; then
      ok "docker compose v2"
    else
      fail "Docker Compose v2 not found. Install it (https://docs.docker.com/compose/install/)."
    fi
  else
    echo "! Docker is not installed." >&2
    if is_macos; then
      if have brew; then
        echo "  Install with: brew install --cask docker   (or: brew install docker colima)" >&2
      else
        echo "  Install Docker Desktop from https://www.docker.com/products/docker-desktop/" >&2
      fi
    elif is_linux; then
      echo "  Install with: https://docs.docker.com/engine/install/ (then install compose v2)." >&2
    else
      echo "  Install Docker Desktop from https://www.docker.com/products/docker-desktop/" >&2
    fi
    fail "Docker is required for the local deploy."
  fi
else
  echo "· docker skipped (cloud deploy does not need it)"
fi

# --- Supabase CLI -------------------------------------------------------
if have supabase; then
  ok "supabase CLI ($(supabase --version | head -1))"
else
  echo "! Supabase CLI is not installed." >&2
  if is_macos && have brew; then
    echo "  Install with: brew install supabase/tap/supabase" >&2
  else
    echo "  Install with: npm install -g supabase   (or see https://supabase.com/docs/guides/cli)" >&2
  fi
  fail "Supabase CLI is required."
fi

# --- Vercel CLI (cloud only) -------------------------------------------
if [[ "$MODE" == "cloud" ]]; then
  if have vercel; then
    ok "vercel CLI ($(vercel --version))"
  else
    echo "! Vercel CLI is not installed." >&2
    echo "  Install with: npm install -g vercel" >&2
    fail "Vercel CLI is required for the cloud deploy."
  fi
fi

# --- Node / npm / Python ------------------------------------------------
have node && ok "node ($(node --version))" || fail "Node.js is required (https://nodejs.org)."
have npm && ok "npm ($(npm --version))" || fail "npm is required."
have python3 && ok "python3 ($(python3 --version 2>&1))" || fail "Python 3 is required."

echo
echo "All required prerequisites are satisfied."
