"""Vercel function for the Telegram bot webhook.

Telegram's webhook gets its own function (vercel.json routes
/api/telegram/webhook here), so slow screenshot reads don't hold up the main
API function, and the bot has its own logs and timeout. Docker/uvicorn still
serve the same route from api.main.
"""

from __future__ import annotations

from fastapi import FastAPI

from .config import get_settings
from .telegram import router

app = FastAPI(title="Nirmanam Telegram bot", version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok", "service": "nirmanam-bot"}


app.include_router(router, prefix=get_settings().api_prefix)
