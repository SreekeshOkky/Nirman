import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def fake(monkeypatch):
    """The real API on the in-memory backend, seeded fresh for each test.

    Yields (client, store, headers): headers(email) signs in and returns the
    Authorization header.
    """
    from api.config import get_settings
    from api.features import get_features
    from tests.fake_backend.app import build_app
    from tests.fake_backend.seed import PASSWORD

    app, store = build_app(setattr_=monkeypatch.setattr, setenv=monkeypatch.setenv)
    client = TestClient(app)

    def headers(email: str) -> dict:
        response = client.post("/auth/v1/token?grant_type=password", json={"email": email, "password": PASSWORD})
        assert response.status_code == 200, response.text
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    yield client, store, headers
    monkeypatch.undo()
    get_settings.cache_clear()
    get_features.cache_clear()
