import json
import os

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "anon")
os.environ.setdefault("SUPABASE_SECRET_KEY", "secret")

import pytest
from fastapi.testclient import TestClient

from api.config import get_settings
from api.features import FEATURE_AUDIT_LOG, DEFAULT_FEATURES, get_features, is_enabled
from api.main import app


def test_health_endpoint():
    response = TestClient(app).get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "nirmanam-api"}


def test_protected_route_requires_bearer_token():
    response = TestClient(app).get("/api/me")

    assert response.status_code == 401


def test_feature_routes_are_registered():
    paths = {route.path for route in app.routes}

    assert "/api/sites/{site_id}/members/invite" in paths
    assert "/api/invitations/{token}/accept" in paths
    assert "/api/sites/{site_id}/reports/export" in paths
    assert "/api/sites/{site_id}/attachments" in paths
    assert "/api/overview" in paths
    assert "/api/audit-logs" in paths
    assert "/api/features" in paths


def test_site_status_routes_are_registered():
    paths = {route.path for route in app.routes}

    assert "/api/sites/{site_id}/archive" in paths
    assert "/api/sites/{site_id}/activate" in paths


def test_archived_sites_are_read_only():
    from fastapi import HTTPException

    from api.dependencies import ensure_site_active

    with pytest.raises(HTTPException) as exc:
        ensure_site_active({"status": "archived"})
    assert exc.value.status_code == 409

    ensure_site_active({"status": "active"})
    ensure_site_active({"status": "planning"})


def test_features_endpoint_defaults_to_all_enabled(monkeypatch):
    monkeypatch.setenv("FEATURE_FLAGS", "")
    get_settings.cache_clear()
    get_features.cache_clear()
    response = TestClient(app).get("/api/features")

    assert response.status_code == 200
    assert response.json() == DEFAULT_FEATURES
    assert all(DEFAULT_FEATURES.values())


@pytest.fixture
def feature_flags_env(monkeypatch):
    def _set(raw: str):
        monkeypatch.setenv("FEATURE_FLAGS", raw)
        get_settings.cache_clear()
        get_features.cache_clear()
    yield _set
    get_settings.cache_clear()
    get_features.cache_clear()


def test_env_json_disables_features_in_api_and_ui_payload(feature_flags_env):
    feature_flags_env(
        json.dumps(
            {"audit_log": False, "notes": False, "categories": False, "signup": False}
        )
    )
    client = TestClient(app)

    features = client.get("/api/features").json()
    assert features["audit_log"] is False
    assert features["notes"] is False
    assert features["categories"] is False
    assert features["signup"] is False

    # Feature dependency is declared before auth, so a disabled feature is
    # rejected with 403 even without a bearer token.
    assert client.get("/api/audit-logs").status_code == 403
    assert client.get("/api/sites/some-id/audit-logs").status_code == 403
    assert client.get("/api/sites/some-id/notes").status_code == 403
    assert client.post("/api/categories", json={"name": "x", "type": "expense"}).status_code == 403

    # Unrelated routes still behave as before (401 without a token).
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/sites").status_code == 401


def test_invalid_feature_flags_json_falls_back_to_defaults(feature_flags_env):
    feature_flags_env("not-json")

    assert get_features() == DEFAULT_FEATURES
    assert is_enabled(FEATURE_AUDIT_LOG) is True


def test_unknown_and_non_boolean_flags_are_ignored(feature_flags_env):
    feature_flags_env(json.dumps({"made_up_feature": True, "notes": "no"}))

    features = get_features()
    assert "made_up_feature" not in features
    # Non-boolean values are ignored, so notes keeps its default (enabled).
    assert features["notes"] is True
