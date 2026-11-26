"""Fake Supabase Auth: what supabase-js (browser) and the API call.

Test-only. Accounts live in memory and tokens are signed with a fixed secret
that the API verifies locally.
"""
from __future__ import annotations

import time
import uuid
from types import SimpleNamespace

import jwt
from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse, Response

from .store import Store, new_id, now

JWT_SECRET = "fake-backend-jwt-secret-for-tests-only-0123456789"


class FakeAuth:
    def __init__(self, store: Store):
        self.store = store
        self.users: dict[str, dict] = {}  # email -> user
        self.refresh_tokens: dict[str, str] = {}  # refresh token -> email
        self.admin = SimpleNamespace(invite_user_by_email=self.invite_user_by_email)
        store.auth = self

    def create_user(self, email: str, password: str | None, full_name: str = "", role: str = "supervisor", user_id: str | None = None) -> dict:
        email = email.strip().lower()
        user = {"id": user_id or new_id(), "email": email, "password": password, "full_name": full_name}
        self.users[email] = user
        self.store.insert("profiles", {"id": user["id"], "email": email, "full_name": full_name, "role": role})
        return user

    # supabase-py surface used by the API
    def invite_user_by_email(self, email: str, options: dict | None = None):
        if email.lower() not in self.users:
            self.create_user(email, None)

    def reset_password_for_email(self, email: str, options: dict | None = None):
        return None

    def get_user(self, token: str):
        claims = decode(token)
        return SimpleNamespace(user=SimpleNamespace(id=claims["sub"], email=claims.get("email")))

    # HTTP surface used by supabase-js
    def public(self, user: dict) -> dict:
        return {"id": user["id"], "aud": "authenticated", "role": "authenticated", "email": user["email"], "app_metadata": {"provider": "email"}, "user_metadata": {"full_name": user["full_name"]}, "created_at": now()}

    def session(self, user: dict) -> dict:
        expires_at = int(time.time()) + 3600
        token = jwt.encode({"sub": user["id"], "email": user["email"], "aud": "authenticated", "role": "authenticated", "exp": expires_at, "session_id": str(uuid.uuid4())}, JWT_SECRET, algorithm="HS256")
        refresh = uuid.uuid4().hex
        self.refresh_tokens[refresh] = user["email"]
        return {"access_token": token, "token_type": "bearer", "expires_in": 3600, "expires_at": expires_at, "refresh_token": refresh, "user": self.public(user)}


def decode(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=["HS256"], audience="authenticated")


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse({"code": status, "error_code": code, "msg": message}, status_code=status)


def auth_router(auth: FakeAuth) -> APIRouter:
    router = APIRouter(prefix="/auth/v1")

    def current(authorization: str | None) -> dict | None:
        try:
            email = decode((authorization or "").split(" ", 1)[1])["email"]
        except Exception:
            return None
        return auth.users.get(email)

    @router.post("/token")
    async def token(request: Request, grant_type: str):
        body = await request.json()
        if grant_type == "password":
            user = auth.users.get(str(body.get("email", "")).strip().lower())
            if not user or not user["password"] or user["password"] != body.get("password"):
                return _error(400, "invalid_credentials", "Invalid login credentials")
        elif grant_type == "refresh_token":
            user = auth.users.get(auth.refresh_tokens.pop(body.get("refresh_token", ""), ""))
            if not user:
                return _error(400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found")
        else:
            return _error(400, "unsupported_grant_type", "Not supported by the fake backend")
        return auth.session(user)

    @router.post("/signup")
    async def signup(request: Request):
        body = await request.json()
        email = str(body.get("email", "")).strip().lower()
        if email in auth.users:
            return _error(422, "user_already_exists", "User already registered")
        # No session: like a project that requires email confirmation.
        return auth.public(auth.create_user(email, body.get("password"), (body.get("data") or {}).get("full_name", "")))

    @router.post("/recover")
    def recover():
        return {}

    @router.get("/user")
    def read_user(authorization: str | None = Header(default=None)):
        user = current(authorization)
        return auth.public(user) if user else _error(401, "bad_jwt", "Invalid token")

    @router.put("/user")
    async def update_user(request: Request, authorization: str | None = Header(default=None)):
        user = current(authorization)
        if not user:
            return _error(401, "bad_jwt", "Invalid token")
        body = await request.json()
        if body.get("password"):
            user["password"] = body["password"]
        return auth.public(user)

    @router.post("/logout")
    def logout():
        return Response(status_code=204)

    return router
