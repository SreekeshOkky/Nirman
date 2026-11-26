"""Demo data. Dates are relative to today so that this month's figures and the
Updates page are never empty. IDs are stable so that docs/app-navigation.md can
link to them.
"""
from __future__ import annotations

import base64
from datetime import date, datetime, timedelta, timezone

import httpx

from . import env
from .reset import connect

# Local test accounts only.
PASSWORD = "factory-test-password"
BUILDER_EMAIL = "builder@nirman.test"
SUPERVISOR_EMAIL = "supervisor@nirman.test"


def _id(group: int, number: int) -> str:
    return f"00000000-0000-4000-8{group:03d}-{number:012d}"


BUILDER_ID, SUPERVISOR_ID = _id(1, 1), _id(1, 2)
LAKEVIEW_ID, HILLSIDE_ID, WAREHOUSE_ID = _id(2, 1), _id(2, 2), _id(2, 3)
RECEIPT_ENTRY_ID = _id(3, 1)

CATEGORIES = [(name, "expense") for name in ("Materials", "Labour", "Equipment", "Transport", "Subcontractor", "Permits and Fees", "Utilities", "Miscellaneous")] + [(name, "income") for name in ("Client payment", "Advance", "Loan", "Refund")]

_PIXEL = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")


def _post(path: str, **kwargs) -> None:
    headers = {"apikey": env.SERVICE_KEY, "Authorization": f"Bearer {env.SERVICE_KEY}", **kwargs.pop("headers", {})}
    response = httpx.post(f"{env.URL}{path}", headers=headers, timeout=30, **kwargs)
    if response.is_error:
        raise RuntimeError(f"Seeding failed: {path} -> {response.status_code} {response.text[:300]}")


def seed() -> None:
    for user_id, email, name in [(BUILDER_ID, BUILDER_EMAIL, "Asha Menon"), (SUPERVISOR_ID, SUPERVISOR_EMAIL, "Ravi Kumar")]:
        _post("/auth/v1/admin/users", json={"id": user_id, "email": email, "password": PASSWORD, "email_confirm": True, "user_metadata": {"full_name": name}})

    receipt = f"{LAKEVIEW_ID}/{RECEIPT_ENTRY_ID}/receipt.png"
    _post(f"/storage/v1/object/receipts/{receipt}", content=_PIXEL, headers={"Content-Type": "image/png", "x-upsert": "true"})

    with connect() as db, db.transaction():
        # Same as scripts/seed_builder.py: promote the account to builder.
        db.execute("update public.profiles set role = 'builder' where id = %s", [BUILDER_ID])
        # The category trigger only fires when a profile is inserted as a
        # builder, so the demo adds the default categories itself.
        category = {}
        for name, kind in CATEGORIES:
            category[name] = db.execute(
                "insert into public.categories (name, type, is_default, created_by) values (%s, %s, true, %s) returning id",
                [name, kind, BUILDER_ID],
            ).fetchone()[0]

        for site_id, name, location, budget, status in [
            (LAKEVIEW_ID, "Lakeview Villa", "Kochi", 500000, "active"),
            (HILLSIDE_ID, "Hillside Apartments", "Thrissur", 2000000, "active"),
            (WAREHOUSE_ID, "Old Warehouse", "Aluva", 300000, "archived"),
        ]:
            db.execute(
                "insert into public.sites (id, owner_id, name, location, budget, status, client_name) values (%s, %s, %s, %s, %s, %s, 'Demo Client')",
                [site_id, BUILDER_ID, name, location, budget, status],
            )
        db.execute("insert into public.site_members (site_id, user_id, invited_by, joined_at) values (%s, %s, %s, now())", [LAKEVIEW_ID, SUPERVISOR_ID, BUILDER_ID])
        db.execute("insert into public.invitations (site_id, email, invited_by) values (%s, 'pending@nirman.test', %s)", [HILLSIDE_ID, BUILDER_ID])

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
            db.execute(
                "insert into public.ledger_entries (id, site_id, entry_type, category_id, amount, entry_date, paid_to, description, payment_method, created_by, created_at, updated_at) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                [_id(3, number), site_id, kind, category[name], amount, date.today() - timedelta(days=days), paid_to, description, method, author, when, when],
            )

        db.execute(
            "insert into public.attachments (site_id, ledger_entry_id, uploaded_by, file_name, storage_path, mime_type, file_size) values (%s, %s, %s, 'receipt.png', %s, 'image/png', %s)",
            [LAKEVIEW_ID, RECEIPT_ENTRY_ID, BUILDER_ID, receipt, len(_PIXEL)],
        )
        db.execute("insert into public.notes (site_id, created_by, content) values (%s, %s, 'Plastering starts on Monday.')", [LAKEVIEW_ID, SUPERVISOR_ID])
        db.execute(
            "insert into public.audit_logs (site_id, actor_id, action, entity_type, entity_id, description) values (%s, %s, 'site_created', 'site', %s, 'Created site Lakeview Villa')",
            [LAKEVIEW_ID, BUILDER_ID, LAKEVIEW_ID],
        )
