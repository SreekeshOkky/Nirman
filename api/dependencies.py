from __future__ import annotations

from dataclasses import dataclass
import logging
import time
import jwt
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from supabase import Client, ClientOptions, create_client
import httpx

from .config import get_settings
from .features import is_enabled

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
    logger.info("Received bearer token: present=true length=%s", len(token))
    return token


def get_current_user(authorization: Annotated[str | None, Header()] = None) -> CurrentUser:
    token = _bearer_token(authorization)
    try:
        claims = jwt.decode(token, options={"verify_signature": False})
        logger.info("Token claims: issuer=%s audience=%s expired=%s", claims.get("iss"), claims.get("aud"), claims.get("exp", 0) < time.time())
    except Exception:
        logger.warning("Received token is not a decodable JWT")
    try:
        auth_user = get_admin_client().auth.get_user(token).user
    except Exception as exc:
        logger.warning("Supabase token validation failed: error_type=%s message=%s", type(exc).__name__, str(exc)[:160])
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired Supabase access token", headers={"WWW-Authenticate": "Bearer"}) from exc

    profile_response = get_admin_client().table("profiles").select("id,email,role,full_name").eq("id", auth_user.id).single().execute()
    if not profile_response.data:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Profile is not configured")
    profile = profile_response.data
    return CurrentUser(
        id=profile["id"],
        email=profile.get("email") or auth_user.email or "",
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


def get_site(site_id: str, user: CurrentUser, *, builder_only: bool = False) -> dict:
    query = get_admin_client().table("sites").select("*").eq("id", site_id)
    if builder_only:
        query = query.eq("owner_id", user.id)
    else:
        query = query.or_(f"owner_id.eq.{user.id},id.in.(select site_id from site_members where user_id.eq.{user.id})")
    response = query.maybe_single().execute()
    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")
    return response.data


def ensure_site_access(site_id: str, user: CurrentUser, *, builder_only: bool = False) -> dict:
    # Keep membership verification in Python as well as RLS. The service-role
    # client bypasses RLS, so this check is required for every API query.
    admin = get_admin_client()
    site_response = admin.table("sites").select("*").eq("id", site_id).maybe_single().execute()
    site = site_response.data
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")
    if site["owner_id"] == user.id:
        return site
    if builder_only or user.role != "supervisor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this site")
    member = admin.table("site_members").select("id").eq("site_id", site_id).eq("user_id", user.id).maybe_single().execute()
    if not member.data:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this site")
    return site


User = Annotated[CurrentUser, Depends(get_current_user)]
Builder = Annotated[CurrentUser, Depends(require_builder)]
