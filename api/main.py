from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routes import router
from .telegram import link_router as telegram_link_router, router as telegram_router

settings = get_settings()
app = FastAPI(title="Nirmanam API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "nirmanam-api"}


app.include_router(router, prefix=settings.api_prefix)
app.include_router(telegram_router, prefix=settings.api_prefix)
app.include_router(telegram_link_router, prefix=settings.api_prefix)
