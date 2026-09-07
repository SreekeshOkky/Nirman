import os

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "anon")
os.environ.setdefault("SUPABASE_SECRET_KEY", "secret")

from fastapi.testclient import TestClient

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
