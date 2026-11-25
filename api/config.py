from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    supabase_url: str
    supabase_anon_key: str
    supabase_secret_key: str
    # Only for projects still on the legacy shared JWT secret; projects with
    # published signing keys are verified without it.
    supabase_jwt_secret: str | None = None
    frontend_url: str = "http://localhost:5173"
    api_prefix: str = "/api"
    # JSON object of feature-flag overrides, e.g. '{"audit_log": false}'
    feature_flags: str | None = None
    # Shown in bot replies; the same variable brands the web build.
    vite_brand_name: str = "Nirmanam"
    # Telegram bot (optional): token from @BotFather, the bot's @username, and
    # the secret Telegram echoes on every webhook call (setup_telegram.py).
    telegram_bot_token: str | None = None
    telegram_bot_username: str | None = None
    telegram_webhook_secret: str | None = None
    # Screenshot dates fall back to the day the message was sent, in this zone.
    telegram_timezone: str = "Asia/Kolkata"
    # Screenshot OCR service (api/ocr.js) and the secret it expects.
    ocr_url: str | None = None
    internal_api_secret: str | None = None

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
