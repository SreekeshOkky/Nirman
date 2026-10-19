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


def test_profile_update_route_is_registered():
    paths = {route.path for route in app.routes}

    assert "/api/me" in paths
    assert any(route.path == "/api/me" and "PATCH" in route.methods for route in app.routes)


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


# --- In-memory Supabase stand-in -------------------------------------------
# Mirrors the supabase-py behaviour that matters here: maybe_single() returns
# None (not an empty response) when no row matches.


class _Resp:
    def __init__(self, data):
        self.data = data
        self.count = len(data) if isinstance(data, list) else None


class _Query:
    def __init__(self, db, table):
        self.db, self.table = db, table
        self.filters, self.op, self.payload, self.single = [], "select", None, False

    def select(self, columns="*", **_):
        self.db.selects.append((self.table, columns))
        return self

    def eq(self, key, value):
        self.filters.append(lambda row: row.get(key) == value)
        return self

    def in_(self, key, values):
        self.filters.append(lambda row: row.get(key) in values)
        return self

    def is_(self, key, _value):
        self.filters.append(lambda row: row.get(key) is None)
        return self

    def order(self, *_, **__):
        return self

    def range(self, *_):
        return self

    def maybe_single(self):
        self.single = True
        return self

    def insert(self, row):
        self.op, self.payload = "insert", row
        return self

    def update(self, changes):
        self.op, self.payload = "update", changes
        return self

    def delete(self):
        self.op = "delete"
        return self

    def upsert(self, row, **_):
        self.op, self.payload = "upsert", row
        return self

    def execute(self):
        rows = self.db.tables.setdefault(self.table, [])
        if self.op == "upsert":
            match = [row for row in rows if row.get("site_id") == self.payload.get("site_id") and row.get("user_id") == self.payload.get("user_id")]
            if match:
                match[0].update(self.payload)
                return _Resp(match)
            self.op = "insert"
        if self.op == "insert":
            row = {"id": f"{self.table}-{len(rows) + 1}", "token": "tok", **self.payload}
            rows.append(row)
            return _Resp([row])
        matched = [row for row in rows if all(check(row) for check in self.filters)]
        if self.op == "update":
            for row in matched:
                row.update(self.payload)
        elif self.op == "delete":
            self.db.tables[self.table] = [row for row in rows if row not in matched]
        if self.single:
            return _Resp(matched[0]) if matched else None
        return _Resp(matched)


class _FakeDB:
    def __init__(self, tables=None, auth_user_id="builder-1"):
        self.tables = {name: [dict(row) for row in rows] for name, rows in (tables or {}).items()}
        self.selects = []
        self.invites = []
        db = self

        class _Admin:
            def invite_user_by_email(self, email, options=None):
                db.invites.append((email, (options or {}).get("redirect_to")))

        class _Auth:
            admin = _Admin()

            def get_user(self, _token):
                return type("R", (), {"user": type("U", (), {"id": auth_user_id, "email": ""})()})()

        self.auth = _Auth()

    def table(self, name):
        return _Query(self, name)


BUILDER = {"id": "builder-1", "email": "b@example.com", "role": "builder", "full_name": "Builder"}
SUPERVISOR = {"id": "super-1", "email": "s@example.com", "role": "supervisor", "full_name": "Sup"}
SITE = {"id": "site-1", "owner_id": "builder-1", "name": "Tower A / Phase 2", "status": "active"}


@pytest.fixture
def fake_db(monkeypatch, feature_flags_env):
    import api.dependencies as dependencies
    import api.routes as routes
    from api.dependencies import CurrentUser, get_current_user

    feature_flags_env("")

    def _install(tables=None, user=BUILDER):
        db = _FakeDB(tables)
        monkeypatch.setattr(dependencies, "get_admin_client", lambda: db)
        monkeypatch.setattr(routes, "get_admin_client", lambda: db)
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(**user)
        return db

    yield _install
    app.dependency_overrides.clear()


def test_maybe_one_returns_none_when_nothing_matches():
    from api.dependencies import maybe_one

    db = _FakeDB({"sites": [SITE]})
    assert maybe_one(db.table("sites").select("*").eq("id", "missing")) is None
    assert maybe_one(db.table("sites").select("*").eq("id", "site-1")) == SITE


def test_unknown_site_is_404_and_non_member_supervisor_is_403(fake_db):
    fake_db({"sites": [SITE]})
    assert TestClient(app).get("/api/sites/missing").status_code == 404

    fake_db({"sites": [SITE]}, user=SUPERVISOR)
    assert TestClient(app).get("/api/sites/site-1").status_code == 403


def test_missing_profile_is_403(monkeypatch):
    import api.dependencies as dependencies

    monkeypatch.setattr(dependencies, "get_admin_client", lambda: _FakeDB({"profiles": []}))
    response = TestClient(app).get("/api/me", headers={"Authorization": "Bearer t"})

    assert response.status_code == 403


def test_invite_succeeds_when_no_pending_invitation(fake_db):
    db = fake_db({"sites": [SITE]})
    response = TestClient(app).post("/api/sites/site-1/members/invite", json={"email": "New@Example.com"}, headers={"Origin": "https://acme.example"})

    assert response.status_code == 201
    assert response.json()["added"] is False
    assert [email for email, _ in db.invites] == ["new@example.com"]
    assert db.invites[0][1] == "https://acme.example/welcome"
    assert db.tables["invitations"][0]["email"] == "new@example.com"
    assert "site_members" not in db.tables


def test_invite_adds_existing_supervisor_immediately(fake_db):
    db = fake_db({"sites": [SITE], "profiles": [SUPERVISOR]})
    response = TestClient(app).post("/api/sites/site-1/members/invite", json={"email": "s@example.com"})

    assert response.status_code == 201
    assert response.json()["added"] is True
    assert db.invites == []
    assert db.tables["site_members"][0]["user_id"] == "super-1"
    assert db.tables["invitations"][0]["status"] == "accepted"


def test_invite_rejects_builder_accounts_and_duplicates(fake_db):
    other_builder = {**BUILDER, "id": "builder-2", "email": "b2@example.com"}
    fake_db(
        {
            "sites": [SITE],
            "profiles": [other_builder, SUPERVISOR],
            "site_members": [{"id": "m-1", "site_id": "site-1", "user_id": "super-1"}],
        }
    )
    client = TestClient(app)

    assert client.post("/api/sites/site-1/members/invite", json={"email": "b2@example.com"}).status_code == 409
    assert client.post("/api/sites/site-1/members/invite", json={"email": "s@example.com"}).status_code == 409
    assert client.post("/api/sites/site-1/members/invite", json={"email": "b@example.com"}).status_code == 400


def test_accept_pending_joins_invited_sites_on_sign_in(fake_db):
    future = "2999-01-01T00:00:00+00:00"
    db = fake_db(
        {
            "sites": [SITE],
            "invitations": [
                {"id": "i-1", "site_id": "site-1", "email": "s@example.com", "status": "pending", "invited_by": "builder-1", "expires_at": future},
                {"id": "i-2", "site_id": "site-2", "email": "s@example.com", "status": "pending", "invited_by": "builder-1", "expires_at": "2000-01-01T00:00:00+00:00"},
            ],
        },
        user=SUPERVISOR,
    )
    response = TestClient(app).post("/api/invitations/accept-pending")

    assert response.json() == {"accepted": ["site-1"]}
    assert [row["site_id"] for row in db.tables["site_members"]] == ["site-1"]


def test_pending_invitations_can_be_listed_and_cancelled(fake_db):
    db = fake_db({"sites": [SITE], "invitations": [{"id": "i-1", "site_id": "site-1", "email": "x@example.com", "status": "pending"}]})
    client = TestClient(app)

    assert [row["id"] for row in client.get("/api/sites/site-1/invitations").json()] == ["i-1"]
    assert client.delete("/api/sites/site-1/invitations/i-1").status_code == 200
    assert db.tables["invitations"][0]["status"] == "cancelled"
    assert client.get("/api/sites/site-1/invitations").json() == []


def test_remove_member_uses_unambiguous_profiles_join(fake_db):
    db = fake_db({"sites": [SITE], "site_members": [{"id": "m-1", "site_id": "site-1", "user_id": "super-1"}]})
    client = TestClient(app)

    assert client.delete("/api/sites/site-1/members/m-1").status_code == 200
    assert ("site_members", "*, profiles!site_members_user_id_fkey(email)") in db.selects
    assert client.delete("/api/sites/site-1/members/m-1").status_code == 404


def test_attachment_rejects_entry_from_another_site(fake_db):
    fake_db({"sites": [SITE], "ledger_entries": [{"id": "e-other", "site_id": "site-2", "deleted_at": None}]})
    response = TestClient(app).post(
        "/api/sites/site-1/attachments?ledger_entry_id=e-other",
        files={"file": ("r.png", b"png", "image/png")},
    )

    assert response.status_code == 404


def test_workspace_audit_logs_only_cover_owned_sites(fake_db):
    fake_db(
        {
            "sites": [SITE, {"id": "site-2", "owner_id": "someone-else", "name": "Other", "status": "active"}],
            "site_members": [{"id": "m-1", "site_id": "site-2", "user_id": "builder-1"}],
            "audit_logs": [{"id": "a-1", "site_id": "site-1"}, {"id": "a-2", "site_id": "site-2"}],
        }
    )
    items = TestClient(app).get("/api/audit-logs").json()["items"]

    assert [item["id"] for item in items] == ["a-1"]


def test_export_filename_uses_site_name(fake_db):
    fake_db({"sites": [SITE]})
    response = TestClient(app).get("/api/sites/site-1/reports/export")

    assert response.status_code == 200
    assert 'filename="tower-a-phase-2-ledger.csv"' in response.headers["content-disposition"]

