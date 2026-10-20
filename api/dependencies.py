from __future__ import annotations

from dataclasses import dataclass
import logging
import threading
import time
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from supabase import Client, ClientOptions, create_client
import httpx

from .config import get_settings
from .features import is_enabled
from .tokens import InvalidTokenError, verify_token

logger = logging.getLogger("nirmanam.auth")


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str
    role: str
    full_name: str


def _retrying_http() -> httpx.Client:
    # Retry transient transport failures (SSL handshake timeouts, connection
    # resets, 5xx) before surfacing an error to callers.
    return httpx.Client(
        transport=httpx.HTTPTransport(retries=3),
        timeout=httpx.Timeout(30.0, connect=10.0),
    )


_admin_client: Client | None = None


def get_admin_client() -> Client:
    global _admin_client
    if _admin_client is None:
        settings = get_settings()
        _admin_client = create_client(
            settings.supabase_url,
            settings.supabase_secret_key,
            options=ClientOptions(httpx_client=_retrying_http()),
        )
    return _admin_client


def get_auth_client() -> Client:
    settings = get_settings()
    return create_client(
        settings.supabase_url,
        settings.supabase_anon_key,
        options=ClientOptions(httpx_client=_retrying_http()),
    )


def _bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        logger.warning("Rejected request: Authorization bearer header missing")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token required")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        logger.warning("Rejected request: bearer token was empty")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token required")
    return token


def maybe_one(query) -> dict | None:
    """Run a query expected to match at most one row.

    supabase-py returns None (not an empty response) from maybe_single() when
    nothing matches, so `.maybe_single().execute().data` would crash.
    """
    response = query.maybe_single().execute()
    return response.data if response else None


# Profiles change rarely (name edits go through forget_profile), so each warm
# API instance keeps them briefly instead of reading them on every request.
PROFILE_TTL = 60
_profile_lock = threading.Lock()
_profiles: dict[str, tuple[float, dict]] = {}


def _load_profile(user_id: str) -> dict | None:
    now = time.monotonic()
    with _profile_lock:
        cached = _profiles.get(user_id)
    if cached and now - cached[0] < PROFILE_TTL:
        return cached[1]
    profile = maybe_one(get_admin_client().table("profiles").select("id,email,role,full_name").eq("id", user_id))
    if profile:
        with _profile_lock:
            _profiles[user_id] = (now, profile)
    return profile


def forget_profile(user_id: str) -> None:
    with _profile_lock:
        _profiles.pop(user_id, None)


def _unauthorized(exc: Exception) -> HTTPException:
    logger.warning("Supabase token validation failed: error_type=%s message=%s", type(exc).__name__, str(exc)[:160])
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired Supabase access token", headers={"WWW-Authenticate": "Bearer"})


def get_current_user(authorization: Annotated[str | None, Header()] = None) -> CurrentUser:
    token = _bearer_token(authorization)
    # Check the signature locally; only ask Supabase Auth when that's not
    # possible (e.g. a legacy-secret project without SUPABASE_JWT_SECRET set).
    try:
        claims = verify_token(token)
    except InvalidTokenError as exc:
        raise _unauthorized(exc) from exc
    if claims:
        user_id, token_email = claims["sub"], claims.get("email") or ""
    else:
        try:
            auth_user = get_admin_client().auth.get_user(token).user
        except Exception as exc:
            raise _unauthorized(exc) from exc
        user_id, token_email = auth_user.id, auth_user.email or ""

    profile = _load_profile(user_id)
    if not profile:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Profile is not configured")
    return CurrentUser(
        id=profile["id"],
        email=profile.get("email") or token_email,
        role=profile["role"],
        full_name=profile.get("full_name") or "",
    )


def require_builder(user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
    if user.role != "builder":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Builder access required")
    return user


def require_feature(feature: str):
    """Dependency factory that rejects requests when a feature flag is off."""
    def _check() -> None:
        if not is_enabled(feature):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"The '{feature}' feature is disabled",
            )
    return _check


def ensure_site_access(site_id: str, user: CurrentUser, *, builder_only: bool = False) -> dict:
    # Keep membership verification in Python as well as RLS. The service-role
    # client bypasses RLS, so this check is required for every API query.
    admin = get_admin_client()
    site = maybe_one(admin.table("sites").select("*").eq("id", site_id))
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")
    if site["owner_id"] == user.id:
        return site
    if builder_only or user.role != "supervisor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this site")
    member = maybe_one(admin.table("site_members").select("id").eq("site_id", site_id).eq("user_id", user.id))
    if not member:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this site")
    return site


def ensure_site_active(site: dict) -> None:
    """Archived (inactive) sites are read-only until reactivated."""
    if site.get("status") == "archived":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This site is inactive and read-only. Reactivate it to make changes.",
        )


User = Annotated[CurrentUser, Depends(get_current_user)]
Builder = Annotated[CurrentUser, Depends(require_builder)]
