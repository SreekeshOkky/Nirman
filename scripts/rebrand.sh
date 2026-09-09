#!/usr/bin/env bash
# rebrand.sh — apply white-label branding and feature flags into `.env`.
#
# Usage:
#   ./scripts/rebrand.sh --name "Acme Builds" --logo "https://..." --accent "#1a73e8"
#   ./scripts/rebrand.sh --flags '{"notes": false, "signup": false}'
#
# Only the keys you pass are updated; everything else in `.env` is preserved.
# `.env` is gitignored, so no secrets or branding leak into the repo.

set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=".env"

name=""
logo=""
accent=""
flags=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) name="${2:-}"; shift 2 ;;
    --logo) logo="${2:-}"; shift 2 ;;
    --accent) accent="${2:-}"; shift 2 ;;
    --flags) flags="${2:-}"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -n "$flags" ]]; then
  python3 -c "import json,sys; json.loads(sys.argv[1])" "$flags" \
    || { echo "flags is not valid JSON: $flags" >&2; exit 2; }
fi

if [[ -z "$name" && -z "$logo" && -z "$accent" && -z "$flags" ]]; then
  echo "No values provided (use --name/--logo/--accent/--flags)." >&2
  exit 2
fi

# Is this a key we are about to (re)write? Returns 0 if yes.
is_update_key() {
  local key="$1"
  [[ "$key" == "VITE_BRAND_NAME" && -n "$name" ]] && return 0
  [[ "$key" == "VITE_BRAND_LOGO" && -n "$logo" ]] && return 0
  [[ "$key" == "VITE_THEME_ACCENT" && -n "$accent" ]] && return 0
  [[ "$key" == "FEATURE_FLAGS" && -n "$flags" ]] && return 0
  return 1
}

tmp="$(mktemp)"
{
  if [[ -f "$ENV_FILE" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      if [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)= ]]; then
        if is_update_key "${BASH_REMATCH[1]}"; then
          continue
        fi
      fi
      echo "$line"
    done < "$ENV_FILE"
  fi
  [[ -n "$name" ]] && echo "VITE_BRAND_NAME=$name"
  [[ -n "$logo" ]] && echo "VITE_BRAND_LOGO=$logo"
  [[ -n "$accent" ]] && echo "VITE_THEME_ACCENT=$accent"
  [[ -n "$flags" ]] && echo "FEATURE_FLAGS=$flags"
} > "$tmp"

mv "$tmp" "$ENV_FILE"

[[ -n "$name" ]] && echo "· brand name    -> $name"
[[ -n "$logo" ]] && echo "· brand logo    -> $logo"
[[ -n "$accent" ]] && echo "· accent color  -> $accent"
[[ -n "$flags" ]] && echo "· feature flags -> $flags"
echo "Wrote $ENV_FILE"
