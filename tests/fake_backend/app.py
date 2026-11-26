"""The real API wired to the in-memory fake, plus fake auth, receipt storage and
(optionally) the built web app, all on one origin.

Test-only: never deployed. Run it with tests/fake_backend/start.sh.
"""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response

from .auth import JWT_SECRET, FakeAuth, auth_router
from .seed import seed
from .store import Store

# Always override: a developer's .env must never point this at a real project.
ENV = {
    "SUPABASE_URL": "http://fake-supabase.invalid",
    "SUPABASE_ANON_KEY": "fake-anon-key",
    "SUPABASE_SECRET_KEY": "fake-secret-key",
    "SUPABASE_JWT_SECRET": JWT_SECRET,
    "FEATURE_FLAGS": os.environ.get("FAKE_FEATURE_FLAGS", ""),
}


def build_app(dist: Path | None = None, *, setattr_=setattr, setenv=os.environ.__setitem__) -> tuple[FastAPI, Store]:
    """`setattr_`/`setenv` let tests pass pytest's monkeypatch so changes are undone."""
    for key, value in ENV.items():
        setenv(key, value)

    from api import dependencies
    from api.config import get_settings
    from api.features import get_features

    get_settings.cache_clear()
    get_features.cache_clear()
    from api.main import app as real_app

    store = Store()
    auth = FakeAuth(store)
    seed(store, auth)
    setattr_(dependencies, "create_client", lambda *args, **kwargs: store)
    setattr_(dependencies, "_admin_client", store)
    dependencies._profiles.clear()

    app = FastAPI(title="Nirmanam (fake backend)")
    app.include_router(auth_router(auth))

    @app.get("/fake-storage/{path:path}")
    def stored_file(path: str):
        if path not in store.files:
            raise HTTPException(status_code=404)
        content, content_type = store.files[path]
        return Response(content, media_type=content_type)

    app.router.routes.extend(real_app.router.routes)

    if dist is not None:
        root = dist.resolve()

        @app.get("/{path:path}")
        def web(path: str):
            if path.startswith(("api/", "auth/", "_vercel/")):
                raise HTTPException(status_code=404)
            file = (root / path).resolve()
            if path and file.is_relative_to(root) and file.is_file():
                return FileResponse(file)
            return FileResponse(root / "index.html")

    return app, store
