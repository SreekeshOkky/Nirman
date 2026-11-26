from datetime import date

from tests.fake_backend.seed import BUILDER_EMAIL, HILLSIDE_ID, LAKEVIEW_ID, SUPERVISOR_EMAIL


def test_builder_sees_active_sites(fake):
    client, _, headers = fake

    response = client.get("/api/sites", headers=headers(BUILDER_EMAIL))

    assert response.status_code == 200
    assert {site["name"] for site in response.json()} == {"Lakeview Villa", "Hillside Apartments"}


def test_supervisor_cannot_open_an_unassigned_site(fake):
    client, _, headers = fake

    response = client.get(f"/api/sites/{HILLSIDE_ID}/ledger", headers=headers(SUPERVISOR_EMAIL))

    assert response.status_code == 403


def test_new_ledger_entry_appears_in_ledger_and_audit_log(fake):
    client, _, headers = fake
    auth = headers(BUILDER_EMAIL)
    categories = client.get(f"/api/sites/{LAKEVIEW_ID}/categories", headers=auth).json()
    materials = next(row for row in categories if row["name"] == "Materials")

    created = client.post(
        f"/api/sites/{LAKEVIEW_ID}/ledger",
        headers=auth,
        json={"entry_type": "expense", "category_id": materials["id"], "amount": 1250, "entry_date": date.today().isoformat(), "paid_to": "Test Hardware"},
    )

    assert created.status_code == 201, created.text
    ledger = client.get(f"/api/sites/{LAKEVIEW_ID}/ledger?search=hardware", headers=auth).json()
    assert [item["paid_to"] for item in ledger["items"]] == ["Test Hardware"]
    log = client.get(f"/api/sites/{LAKEVIEW_ID}/audit-logs", headers=auth).json()
    assert log["items"][0]["action"] == "ledger_entry_created"
