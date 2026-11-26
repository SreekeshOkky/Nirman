"""Reset and seed the test Supabase, then serve the real API and the built web
app on one port. Test-only: never deployed. Run it with tests/supabase/start.sh.
"""
from __future__ import annotations

import os
from pathlib import Path

import uvicorn
from fastapi import HTTPException
from fastapi.responses import FileResponse

from . import env
from .reset import reset
from .seed import seed

os.environ.update(env.api_env())
from api.main import app  # noqa: E402  (settings are read on import)

root = Path(os.environ["WEB_DIST"]).resolve()


@app.get("/{path:path}")
def web(path: str):
    if path.startswith(("api/", "_vercel/")):
        raise HTTPException(status_code=404)
    file = (root / path).resolve()
    if path and file.is_relative_to(root) and file.is_file():
        return FileResponse(file)
    return FileResponse(root / "index.html")


reset()
seed()
uvicorn.run(app, host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "4173")))
