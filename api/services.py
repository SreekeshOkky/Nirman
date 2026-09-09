from __future__ import annotations

from datetime import date
from typing import Any

from supabase import Client

from .features import FEATURE_AUDIT_LOG, is_enabled


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
