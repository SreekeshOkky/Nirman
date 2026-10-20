"""Verify Supabase access tokens inside the API.

Asking Supabase Auth to check every token costs a network round trip per
request. Supabase signs tokens with keys it publishes at
/auth/v1/.well-known/jwks.json (or, on older projects, a shared JWT secret),
so the API can check the signature itself and skip that trip.

verify_token() returns the token's claims, raises InvalidTokenError for a bad
or expired token, and returns None when it cannot check the token locally
(unknown signing key, keys unreachable, legacy secret not configured) so the
caller can fall back to asking Supabase.
"""
from __future__ import annotations

import logging
import threading
import time

import httpx
import jwt
from jwt import InvalidTokenError, PyJWK

from .config import get_settings

logger = logging.getLogger("nirmanam.auth")

ASYMMETRIC_ALGORITHMS = {"ES256", "RS256", "EdDSA"}
KEYS_MAX_AGE = 10 * 60  # refresh published keys every 10 minutes
KEYS_RETRY_AFTER = 60  # but look up an unknown key id at most once a minute

_lock = threading.Lock()
_keys: dict[str, PyJWK] = {}
_keys_fetched_at = 0.0


def _jwks_url() -> str:
    return f"{get_settings().supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"


def _refresh_keys() -> None:
    global _keys, _keys_fetched_at
    _keys_fetched_at = time.monotonic()
    try:
        response = httpx.get(_jwks_url(), timeout=5.0)
        response.raise_for_status()
        keys = {}
        for jwk in response.json().get("keys", []):
            try:
                keys[jwk["kid"]] = PyJWK(jwk)
            except Exception:  # unsupported key type: skip it
                continue
        _keys = keys
    except Exception as exc:
        logger.warning("Could not load Supabase signing keys: %s", str(exc)[:160])


def _signing_key(kid: str | None) -> PyJWK | None:
    with _lock:
        age = time.monotonic() - _keys_fetched_at
        if age > KEYS_MAX_AGE or (kid not in _keys and age > KEYS_RETRY_AFTER):
            _refresh_keys()
        return _keys.get(kid)


def verify_token(token: str) -> dict | None:
    header = jwt.get_unverified_header(token)
    algorithm = header.get("alg")
    if algorithm in ASYMMETRIC_ALGORITHMS:
        jwk = _signing_key(header.get("kid"))
        if jwk is None:
            return None
        key = jwk.key
    elif algorithm == "HS256" and get_settings().supabase_jwt_secret:
        key = get_settings().supabase_jwt_secret
    else:
        return None
    # The issuer is not checked: in local Docker the API reaches Supabase on a
    # different host name than the one baked into the token. The signature
    # already proves the token came from this project.
    return jwt.decode(
        token,
        key,
        algorithms=[algorithm],
        audience="authenticated",
        options={"require": ["exp", "sub"]},
    )


__all__ = ["InvalidTokenError", "verify_token"]
