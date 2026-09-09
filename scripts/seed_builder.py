#!/usr/bin/env python3
"""Create the first builder (admin) account for a Nirmanam deployment.

Uses the Supabase Auth Admin API + PostgREST (service role), so it works against
both a local stack (`supabase start`) and a hosted project. No third-party
dependencies beyond the Python standard library.

Required environment variables:
    SUPABASE_URL            e.g. http://127.0.0.1:54321  or  https://<ref>.supabase.co
    SUPABASE_SERVICE_KEY    service role (secret) key
                            (falls back to SUPABASE_SECRET_KEY)
    BUILDER_EMAIL           email for the first builder
    BUILDER_PASSWORD        password (min length per Supabase policy)
    BUILDER_NAME            optional display name (defaults to "Builder")

Idempotent: if the email already exists, the user's profile is set to
`role = 'builder'` instead of failing.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


def env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        print(f"Missing required environment variable: {name}", file=sys.stderr)
        sys.exit(2)
    return value


def request(method: str, url: str, token: str, payload: dict | None = None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("apikey", token)
    req.add_header("Content-Type", "application/json")
    if payload is not None and method in ("PATCH", "POST", "PUT"):
        req.add_header("Prefer", "return=representation")
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode()
            return resp.status, (json.loads(body) if body else {})
    except urllib.error.HTTPError as exc:
        body = exc.read().decode()
        try:
            detail = json.loads(body)
        except json.JSONDecodeError:
            detail = body
        return exc.code, detail


def main() -> int:
    supabase_url = env("SUPABASE_URL").rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_KEY") or env("SUPABASE_SECRET_KEY")
    email = env("BUILDER_EMAIL")
    password = env("BUILDER_PASSWORD")
    full_name = os.environ.get("BUILDER_NAME", "").strip() or "Builder"

    create_url = f"{supabase_url}/auth/v1/admin/users"
    payload = {
        "email": email,
        "password": password,
        "email_confirm": True,
        "user_metadata": {"full_name": full_name},
    }

    status, result = request("POST", create_url, service_key, payload)
    user_id = None

    if status in (200, 201):
        user_id = result.get("id")
    else:
        message = result.get("msg") or result.get("message") or str(result)
        if "already" in str(message).lower() or "registered" in str(message).lower():
            # Email exists — find the user id.
            list_url = f"{supabase_url}/auth/v1/admin/users?page=1&per_page=200"
            _, users = request("GET", list_url, service_key)
            for u in users.get("users", []):
                if u.get("email", "").lower() == email.lower():
                    user_id = u.get("id")
                    break
            if not user_id:
                print(f"Could not locate existing user {email}: {message}", file=sys.stderr)
                return 1
        else:
            print(f"Failed to create user: {message}", file=sys.stderr)
            return 1

    # Set the profile role to builder (bypasses RLS via service key).
    profile_url = f"{supabase_url}/rest/v1/profiles?id=eq.{user_id}"
    status, _ = request("PATCH", profile_url, service_key, {"role": "builder"})
    if status not in (200, 204):
        print(f"Failed to set role for {email} (status {status})", file=sys.stderr)
        return 1

    print(f"Builder account ready: {email} (id {user_id})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
