import os
from pathlib import Path

import uvicorn

from .app import build_app

dist = Path(os.environ["FAKE_DIST"])
app, _ = build_app(dist)
uvicorn.run(app, host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "4173")))
