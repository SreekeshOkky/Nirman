"""Demo data for the fake backend. Dates are relative to today so that this
month's figures and the Updates page are never empty. IDs are stable so that
docs/app-navigation.md can link to them.
"""
from __future__ import annotations

import base64
from datetime import date, datetime, timedelta, timezone

from .auth import FakeAuth
from .store import Store

# Fake accounts that exist only in memory.
PASSWORD = "factory-test-password"
BUILDER_EMAIL = "builder@nirman.test"
SUPERVISOR_EMAIL = "supervisor@nirman.test"


def _id(group: int, number: int) -> str:
    return f"00000000-0000-4000-8{group:03d}-{number:012d}"


BUILDER_ID, SUPERVISOR_ID = _id(1, 1), _id(1, 2)
LAKEVIEW_ID, HILLSIDE_ID, WAREHOUSE_ID = _id(2, 1), _id(2, 2), _id(2, 3)
RECEIPT_ENTRY_ID = _id(3, 1)

_PIXEL = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")


def seed(store: Store, auth: FakeAuth) -> None:
    auth.create_user(BUILDER_EMAIL, PASSWORD, "Asha Menon", "builder", BUILDER_ID)
    auth.create_user(SUPERVISOR_EMAIL, PASSWORD, "Ravi Kumar", "supervisor", SUPERVISOR_ID)
    category = {row["name"]: row["id"] for row in store.tables["categories"]}

    for site_id, name, location, budget, status in [
        (LAKEVIEW_ID, "Lakeview Villa", "Kochi", 500000, "active"),
        (HILLSIDE_ID, "Hillside Apartments", "Thrissur", 2000000, "active"),
        (WAREHOUSE_ID, "Old Warehouse", "Aluva", 300000, "archived"),
    ]:
        store.insert("sites", {"id": site_id, "owner_id": BUILDER_ID, "name": name, "location": location, "budget": budget, "status": status, "client_name": "Demo Client"})
    store.insert("site_members", {"site_id": LAKEVIEW_ID, "user_id": SUPERVISOR_ID, "invited_by": BUILDER_ID, "joined_at": datetime.now(timezone.utc).isoformat()})
    store.insert("invitations", {"site_id": HILLSIDE_ID, "email": "pending@nirman.test", "invited_by": BUILDER_ID})

    # (number, site, type, category, amount, days ago, paid to, description, method, author)
    for number, site_id, kind, name, amount, days, paid_to, description, method, author in [
        (1, LAKEVIEW_ID, "expense", "Materials", 245000, 0, "Kerala Cement Traders", "Cement, 500 bags", "UPI", BUILDER_ID),
        (2, LAKEVIEW_ID, "expense", "Labour", 215000, 1, "Suresh Masonry", "Weekly wages", "Cash", SUPERVISOR_ID),
        (3, LAKEVIEW_ID, "income", "Client payment", 600000, 3, "Demo Client", "Second instalment", "Bank transfer", BUILDER_ID),
        (4, HILLSIDE_ID, "expense", "Equipment", 42000, 5, "City Rentals", "Concrete mixer hire", "UPI", BUILDER_ID),
        (5, HILLSIDE_ID, "income", "Advance", 400000, 40, "Demo Client", "Booking advance", "Bank transfer", BUILDER_ID),
        (6, WAREHOUSE_ID, "expense", "Transport", 18000, 90, "Fast Movers", "Debris removal", "Cash", BUILDER_ID),
    ]:
        when = datetime.now(timezone.utc) - timedelta(days=days, minutes=number)
        store.insert("ledger_entries", {"id": _id(3, number), "site_id": site_id, "entry_type": kind, "category_id": category[name], "amount": amount, "entry_date": (date.today() - timedelta(days=days)).isoformat(), "paid_to": paid_to, "description": description, "payment_method": method, "created_by": author, "created_at": when.isoformat(), "updated_at": when.isoformat()})

    path = f"{LAKEVIEW_ID}/{RECEIPT_ENTRY_ID}/receipt.png"
    store.storage.from_("receipts").upload(path, _PIXEL, {"content-type": "image/png"})
    store.insert("attachments", {"site_id": LAKEVIEW_ID, "ledger_entry_id": RECEIPT_ENTRY_ID, "uploaded_by": BUILDER_ID, "file_name": "receipt.png", "storage_path": path, "mime_type": "image/png", "file_size": len(_PIXEL)})
    store.insert("notes", {"site_id": LAKEVIEW_ID, "created_by": SUPERVISOR_ID, "content": "Plastering starts on Monday."})
    store.insert("audit_logs", {"site_id": LAKEVIEW_ID, "actor_id": BUILDER_ID, "action": "site_created", "entity_type": "site", "entity_id": LAKEVIEW_ID, "description": "Created site Lakeview Villa"})
