import httpx
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def database():
    """A freshly migrated and seeded test Supabase, rebuilt once per test run."""
    from tests.supabase.reset import reset
    from tests.supabase.seed import seed

    reset()
    seed()


@pytest.fixture
def api(database, monkeypatch):
    """The real API on the real test Supabase.

    Yields (client, headers): headers(email) signs in through Supabase Auth and
    returns the Authorization header. Data persists between tests in a run, so
    create what you assert on and don't depend on test order.
    """
    from api import dependencies
    from api.config import get_settings
    from api.features import get_features
    from api.main import app
    from tests.supabase import env
    from tests.supabase.seed import PASSWORD

    for key, value in env.api_env().items():
        monkeypatch.setenv(key, value)
    monkeypatch.setattr(dependencies, "_admin_client", None)
    get_settings.cache_clear()
    get_features.cache_clear()
    dependencies._profiles.clear()

    def headers(email: str) -> dict:
        response = httpx.post(f"{env.URL}/auth/v1/token?grant_type=password", headers={"apikey": env.ANON_KEY}, json={"email": email, "password": PASSWORD})
        assert response.status_code == 200, response.text
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    yield TestClient(app), headers
    monkeypatch.undo()
    get_settings.cache_clear()
    get_features.cache_clear()
