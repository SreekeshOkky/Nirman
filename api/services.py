from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import HTTPException
from supabase import Client

from .dependencies import maybe_one
from .features import FEATURE_AUDIT_LOG, FEATURE_NOTES, is_enabled
from .schemas import LedgerCreate


def record_audit(
    db: Client,
    *,
    site_id: str,
    actor_id: str,
    action: str,
    entity_type: str,
    description: str,
    entity_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    if not is_enabled(FEATURE_AUDIT_LOG):
        return
    db.table("audit_logs").insert({
        "site_id": site_id,
        "actor_id": actor_id,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "description": description,
        "metadata": metadata or {},
    }).execute()


def parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("Dates must use YYYY-MM-DD format") from exc


def accessible_sites(db: Client, user_id: str, *, include_archived: bool = False) -> list[dict]:
    """Sites the user owns plus those they were added to as a supervisor."""
    query = db.table("sites").select("*").eq("owner_id", user_id)
    if not include_archived:
        query = query.neq("status", "archived")
    owned = query.execute().data or []
    member_rows = db.table("site_members").select("site_id").eq("user_id", user_id).execute().data or []
    member_ids = [row["site_id"] for row in member_rows]
    invited = []
    if member_ids:
        invited_query = db.table("sites").select("*").in_("id", member_ids)
        if not include_archived:
            invited_query = invited_query.neq("status", "archived")
        invited = invited_query.execute().data or []
    seen = {site["id"] for site in owned}
    return owned + [site for site in invited if site["id"] not in seen]


def site_categories(db: Client, site: dict) -> list[dict]:
    """Active categories usable on a site: its own plus the owner's own list."""
    site_rows = (
        db.table("categories").select("*").eq("site_id", site["id"]).eq("is_active", True).execute().data or []
    )
    user_rows = (
        db.table("categories")
        .select("*")
        .is_("site_id", "null")
        .eq("created_by", site["owner_id"])
        .eq("is_active", True)
        .execute()
        .data
        or []
    )
    by_name: dict[str, dict] = {}
    for row in user_rows + site_rows:
        key = row["name"].lower()
        preferred = row.get("site_id") is None
        if key not in by_name or preferred:
            by_name[key] = row
    return sorted(by_name.values(), key=lambda row: row["name"].lower())


def validate_category(db, site: dict, category_id: str, entry_type: str) -> dict:
    category = maybe_one(db.table("categories").select("*").eq("id", category_id).eq("is_active", True))
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    site_level = category.get("site_id")
    usable = site_level == site["id"] or (
        site_level is None and category.get("created_by") == site["owner_id"]
    )
    if not usable or category["type"] not in (entry_type, "both"):
        raise HTTPException(status_code=422, detail="Category is not available for this entry type")
    return category


def insert_ledger_entry(db: Client, site: dict, user_id: str, payload: LedgerCreate) -> dict:
    """Validate the category, insert the entry (+ optional note) and audit it."""
    site_id = site["id"]
    category = validate_category(db, site, str(payload.category_id), payload.entry_type)
    row = payload.model_dump(mode="json", exclude={"note"})
    row.update({"site_id": site_id, "created_by": user_id})
    response = db.table("ledger_entries").insert(row).execute()
    entry = response.data[0]
    if payload.note and is_enabled(FEATURE_NOTES):
        db.table("notes").insert({"site_id": site_id, "ledger_entry_id": entry["id"], "created_by": user_id, "content": payload.note}).execute()
    who = f" {'to' if payload.entry_type == 'expense' else 'from'} {payload.paid_to}" if payload.paid_to else ""
    record_audit(db, site_id=site_id, actor_id=user_id, action="ledger_entry_created", entity_type="ledger_entry", entity_id=entry["id"], description=f"Added {payload.entry_type} for {category['name']}{who}", metadata={"amount": str(payload.amount), "category": category["name"], "paid_to": payload.paid_to})
    return entry


def attach_receipt(db: Client, *, site_id: str, user_id: str, ledger_entry_id: str | None, storage_path: str, file_name: str, mime_type: str | None, file_size: int) -> dict:
    """Record an already-uploaded receipt file against a site/entry and audit it."""
    attachment = db.table("attachments").insert({"site_id": site_id, "ledger_entry_id": ledger_entry_id, "uploaded_by": user_id, "file_name": file_name, "storage_path": storage_path, "mime_type": mime_type, "file_size": file_size}).execute().data[0]
    record_audit(db, site_id=site_id, actor_id=user_id, action="receipt_uploaded", entity_type="attachment", entity_id=attachment["id"], description=f"Uploaded {file_name}")
    return attachment
