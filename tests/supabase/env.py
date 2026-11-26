"""Where the test Supabase lives. Test-only.

The defaults are the software factory's local stack (services/supabase.yml in the
factory repo). Its secrets are fixed local test values, reachable only inside
that Docker network. FACTORY_SUPABASE_* variables point the tests elsewhere;
the app's own SUPABASE_* variables and .env are deliberately ignored.
"""
from __future__ import annotations

import os

URL = os.environ.get("FACTORY_SUPABASE_URL", "http://factory-supabase:8000")
DB_HOST = os.environ.get("FACTORY_SUPABASE_DB_HOST", "factory-supabase-db")
DB_PORT = int(os.environ.get("FACTORY_SUPABASE_DB_PORT", "5432"))
DB_PASSWORD = os.environ.get("FACTORY_SUPABASE_DB_PASSWORD", "factory-local-db")
JWT_SECRET = os.environ.get("FACTORY_SUPABASE_JWT_SECRET", "factory-local-test-only-jwt-secret-not-for-production")
ANON_KEY = os.environ.get("FACTORY_SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJmYWN0b3J5LWxvY2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MjAwMDAwMDAwMH0.8gBbnonC8ep5zdCyehKhIQ2EqY5EC_1K0HQY6pBA-SM")
SERVICE_KEY = os.environ.get("FACTORY_SUPABASE_SERVICE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJmYWN0b3J5LWxvY2FsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoyMDAwMDAwMDAwfQ.Dkv7I2mjxm_vcz4gLQI0B-_goWm0bHloDGIciDQsSY8")


def api_env() -> dict[str, str]:
    """Settings for the FastAPI app."""
    return {
        "SUPABASE_URL": URL,
        "SUPABASE_ANON_KEY": ANON_KEY,
        "SUPABASE_SECRET_KEY": SERVICE_KEY,
        "SUPABASE_JWT_SECRET": JWT_SECRET,
        "FEATURE_FLAGS": os.environ.get("TEST_FEATURE_FLAGS", ""),
    }
