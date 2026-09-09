from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    supabase_url: str
    supabase_anon_key: str
    supabase_secret_key: str
    frontend_url: str = "http://localhost:5173"
    api_prefix: str = "/api"
    # JSON object of feature-flag overrides, e.g. '{"audit_log": false}'
    feature_flags: str | None = None

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
