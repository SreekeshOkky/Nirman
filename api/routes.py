from __future__ import annotations

from datetime import date
from datetime import datetime, timezone
from decimal import Decimal
import csv
import io
from typing import Literal

from fastapi.encoders import jsonable_encoder
from fastapi import APIRouter, HTTPException, Query, UploadFile, File, status
from fastapi.responses import StreamingResponse

from .dependencies import Builder, User, ensure_site_access, get_admin_client
from .schemas import CategoryCreate, CategoryUpdate, InvitationCreate, LedgerCreate, LedgerUpdate, NoteCreate, NoteUpdate, SiteCreate, SiteUpdate
from .services import record_audit

router = APIRouter()


@router.get("/me")
def read_me(user: User):
    return {"id": user.id, "email": user.email, "full_name": user.full_name, "role": user.role}


@router.get("/sites")
def list_sites(user: User):
    db = get_admin_client()
    owned = db.table("sites").select("*").eq("owner_id", user.id).execute().data or []
    member_rows = db.table("site_members").select("site_id").eq("user_id", user.id).execute().data or []
    member_ids = [row["site_id"] for row in member_rows]
    invited = []
    if member_ids:
        invited = db.table("sites").select("*").in_("id", member_ids).execute().data or []
    seen = {site["id"] for site in owned}
    return owned + [site for site in invited if site["id"] not in seen]


@router.get("/overview")
def workspace_overview(user: User):
    """Return the aggregate picture across every site the user can access."""
    db = get_admin_client()
    if user.role == "builder":
        sites = db.table("sites").select("id,name,budget,status,location").eq("owner_id", user.id).neq("status", "archived").execute().data or []
    else:
        memberships = db.table("site_members").select("site_id").eq("user_id", user.id).execute().data or []
        site_ids = [row["site_id"] for row in memberships]
        site_response = db.table("sites").select("id,name,budget,status,location").in_("id", site_ids).neq("status", "archived").execute() if site_ids else None
        sites = site_response.data if site_response else []
    site_ids = [site["id"] for site in sites]
    entry_response = db.table("ledger_entries").select("site_id,entry_type,amount,entry_date").in_("site_id", site_ids).is_("deleted_at", "null").execute() if site_ids else None
    entries = entry_response.data if entry_response else []
    totals = {"income": Decimal("0"), "expenses": Decimal("0"), "balance": Decimal("0"), "budget": Decimal("0"), "entry_count": len(entries)}
    by_site = {site["id"]: {"income": Decimal("0"), "expenses": Decimal("0"), "balance": Decimal("0")} for site in sites}
    by_month: dict[str, dict[str, Decimal]] = {}
    for site in sites:
        totals["budget"] += Decimal(str(site.get("budget") or 0))
    for entry in entries:
        amount = Decimal(str(entry["amount"]))
        key = "income" if entry["entry_type"] == "income" else "expenses"
        totals[key] += amount
        site_total = by_site[entry["site_id"]]
        site_total[key] += amount
        month = entry["entry_date"][:7]
        by_month.setdefault(month, {"income": Decimal("0"), "expenses": Decimal("0")})[key] += amount
    totals["balance"] = totals["income"] - totals["expenses"]
    return {
        "totals": totals,
        "sites": [{**site, **by_site[site["id"]], "balance": by_site[site["id"]]["income"] - by_site[site["id"]]["expenses"]} for site in sites],
        "monthly": [{"month": month, **values, "balance": values["income"] - values["expenses"]} for month, values in sorted(by_month.items())],
    }


@router.post("/sites", status_code=status.HTTP_201_CREATED)
def create_site(payload: SiteCreate, user: Builder):
    db = get_admin_client()
    row = payload.model_dump(mode="json", exclude_none=True)
    row["owner_id"] = user.id
    response = db.table("sites").insert(row).execute()
    site = response.data[0]
    record_audit(db, site_id=site["id"], actor_id=user.id, action="site_created", entity_type="site", entity_id=site["id"], description=f"Created site {site['name']}")
    return site


@router.get("/sites/{site_id}")
def read_site(site_id: str, user: User):
    return ensure_site_access(site_id, user)


@router.patch("/sites/{site_id}")
def update_site(site_id: str, payload: SiteUpdate, user: Builder):
    db = get_admin_client()
    current = ensure_site_access(site_id, user, builder_only=True)
    changes = payload.model_dump(mode="json", exclude_none=True)
    if not changes:
        return current
    site = db.table("sites").update(changes).eq("id", site_id).eq("owner_id", user.id).execute().data[0]
    record_audit(db, site_id=site_id, actor_id=user.id, action="site_updated", entity_type="site", entity_id=site_id, description=f"Updated site {site['name']}", metadata=jsonable_encoder({"before": current, "after": site}))
    return site


@router.post("/sites/{site_id}/archive")
def archive_site(site_id: str, user: Builder):
    db = get_admin_client()
    site = ensure_site_access(site_id, user, builder_only=True)
    updated = db.table("sites").update({"status": "archived"}).eq("id", site_id).execute().data[0]
    record_audit(db, site_id=site_id, actor_id=user.id, action="site_archived", entity_type="site", entity_id=site_id, description=f"Archived site {site['name']}")
    return updated


@router.get("/sites/{site_id}/categories")
def list_categories(site_id: str, user: User):
    ensure_site_access(site_id, user)
    return get_admin_client().table("categories").select("*").eq("site_id", site_id).eq("is_active", True).order("name").execute().data or []


@router.post("/sites/{site_id}/categories", status_code=status.HTTP_201_CREATED)
def create_category(site_id: str, payload: CategoryCreate, user: Builder):
    ensure_site_access(site_id, user, builder_only=True)
    db = get_admin_client()
    response = db.table("categories").insert({**payload.model_dump(), "site_id": site_id, "created_by": user.id}).execute()
    category = response.data[0]
    record_audit(db, site_id=site_id, actor_id=user.id, action="category_created", entity_type="category", entity_id=category["id"], description=f"Created category {category['name']}")
    return category


@router.patch("/sites/{site_id}/categories/{category_id}")
def update_category(site_id: str, category_id: str, payload: CategoryUpdate, user: Builder):
    ensure_site_access(site_id, user, builder_only=True)
    db = get_admin_client()
    current = db.table("categories").select("*").eq("id", category_id).eq("site_id", site_id).maybe_single().execute().data
    if not current:
        raise HTTPException(status_code=404, detail="Category not found")
    changes = payload.model_dump(exclude_none=True)
    if not changes:
        return current
    updated = db.table("categories").update(changes).eq("id", category_id).execute().data[0]
    record_audit(db, site_id=site_id, actor_id=user.id, action="category_updated", entity_type="category", entity_id=category_id, description=f"Updated category {updated['name']}", metadata=jsonable_encoder({"before": current, "after": updated}))
    return updated


@router.post("/sites/{site_id}/categories/{category_id}/disable")
def disable_category(site_id: str, category_id: str, user: Builder):
    ensure_site_access(site_id, user, builder_only=True)
    db = get_admin_client()
    current = db.table("categories").select("*").eq("id", category_id).eq("site_id", site_id).maybe_single().execute().data
    if not current:
        raise HTTPException(status_code=404, detail="Category not found")
    updated = db.table("categories").update({"is_active": False}).eq("id", category_id).execute().data[0]
    record_audit(db, site_id=site_id, actor_id=user.id, action="category_disabled", entity_type="category", entity_id=category_id, description=f"Disabled category {current['name']}")
    return updated


@router.get("/sites/{site_id}/members")
def list_members(site_id: str, user: Builder):
    ensure_site_access(site_id, user, builder_only=True)
    return get_admin_client().table("site_members").select("*, profiles!site_members_user_id_fkey(id,full_name,email,role)").eq("site_id", site_id).order("created_at").execute().data or []


@router.post("/sites/{site_id}/members/invite", status_code=status.HTTP_201_CREATED)
def invite_member(site_id: str, payload: InvitationCreate, user: Builder):
    ensure_site_access(site_id, user, builder_only=True)
    db = get_admin_client()
    site = db.table("sites").select("name").eq("id", site_id).single().execute().data
    existing = db.table("invitations").select("id").eq("site_id", site_id).eq("email", payload.email.lower()).eq("status", "pending").maybe_single().execute().data
    if existing:
        raise HTTPException(status_code=409, detail="A pending invitation already exists for this email")
    invitation = db.table("invitations").insert({"site_id": site_id, "email": payload.email.lower(), "invited_by": user.id}).execute().data[0]
    try:
        get_admin_client().auth.admin.invite_user_by_email(payload.email, options={"data": {"site_id": site_id, "invitation_token": invitation["token"]}})
    except Exception as exc:
        db.table("invitations").update({"status": "cancelled"}).eq("id", invitation["id"]).execute()
        raise HTTPException(status_code=502, detail="Could not send invitation email") from exc
    record_audit(db, site_id=site_id, actor_id=user.id, action="member_invited", entity_type="invitation", entity_id=invitation["id"], description=f"Invited {payload.email} to {site['name']}")
    return invitation


@router.post("/invitations/{token}/accept")
def accept_invitation(token: str, user: User):
    db = get_admin_client()
    invitation = db.table("invitations").select("*").eq("token", token).eq("status", "pending").maybe_single().execute().data
    if not invitation or datetime.fromisoformat(invitation["expires_at"].replace("Z", "+00:00")) < datetime.now(timezone.utc):
        raise HTTPException(status_code=404, detail="Invitation is missing or expired")
    if invitation["email"].lower() != user.email.lower():
        raise HTTPException(status_code=403, detail="This invitation belongs to a different email address")
    db.table("site_members").upsert({"site_id": invitation["site_id"], "user_id": user.id, "role": "supervisor", "invited_by": invitation["invited_by"], "joined_at": datetime.now(timezone.utc).isoformat()}, on_conflict="site_id,user_id").execute()
    db.table("invitations").update({"status": "accepted", "accepted_at": datetime.now(timezone.utc).isoformat()}).eq("id", invitation["id"]).execute()
    record_audit(db, site_id=invitation["site_id"], actor_id=user.id, action="invitation_accepted", entity_type="invitation", entity_id=invitation["id"], description=f"{user.email} joined the site")
    return {"site_id": invitation["site_id"], "accepted": True}


@router.delete("/sites/{site_id}/members/{member_id}")
def remove_member(site_id: str, member_id: str, user: Builder):
    ensure_site_access(site_id, user, builder_only=True)
    db = get_admin_client()
    member = db.table("site_members").select("*, profiles(email)").eq("id", member_id).eq("site_id", site_id).maybe_single().execute().data
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    db.table("site_members").delete().eq("id", member_id).execute()
    record_audit(db, site_id=site_id, actor_id=user.id, action="member_removed", entity_type="site_member", entity_id=member_id, description=f"Removed {member.get('profiles', {}).get('email', 'supervisor')}")
    return {"removed": True}


@router.get("/sites/{site_id}/ledger")
def list_ledger(
    site_id: str,
    user: User,
    entry_type: Literal["income", "expense"] | None = None,
    category_id: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    search: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
):
    ensure_site_access(site_id, user)
    query = get_admin_client().table("ledger_entries").select("*, categories(name,type)", count="exact").eq("site_id", site_id).is_("deleted_at", "null").order("entry_date", desc=True)
    if entry_type:
        query = query.eq("entry_type", entry_type)
    if category_id:
        query = query.eq("category_id", category_id)
    if from_date:
        query = query.gte("entry_date", from_date.isoformat())
    if to_date:
        query = query.lte("entry_date", to_date.isoformat())
    if search:
        query = query.ilike("description", f"%{search}%")
    start = (page - 1) * page_size
    response = query.range(start, start + page_size - 1).execute()
    return {"items": response.data or [], "page": page, "page_size": page_size, "total": response.count or 0}


def _validate_category(db, site_id: str, category_id: str, entry_type: str) -> dict:
    response = db.table("categories").select("*").eq("id", category_id).eq("site_id", site_id).eq("is_active", True).maybe_single().execute()
    category = response.data
    if not category or category["type"] not in (entry_type, "both"):
        raise HTTPException(status_code=422, detail="Category is not available for this entry type")
    return category


@router.post("/sites/{site_id}/ledger", status_code=status.HTTP_201_CREATED)
def create_ledger_entry(site_id: str, payload: LedgerCreate, user: User):
    ensure_site_access(site_id, user)
    db = get_admin_client()
    category = _validate_category(db, site_id, str(payload.category_id), payload.entry_type)
    row = payload.model_dump(mode="json", exclude={"note"})
    row.update({"site_id": site_id, "created_by": user.id})
    response = db.table("ledger_entries").insert(row).execute()
    entry = response.data[0]
    if payload.note:
        db.table("notes").insert({"site_id": site_id, "ledger_entry_id": entry["id"], "created_by": user.id, "content": payload.note}).execute()
    record_audit(db, site_id=site_id, actor_id=user.id, action="ledger_entry_created", entity_type="ledger_entry", entity_id=entry["id"], description=f"Added {payload.entry_type} for {category['name']}", metadata={"amount": str(payload.amount), "category": category["name"]})
    return entry


@router.get("/sites/{site_id}/ledger/{entry_id}")
def read_ledger_entry(site_id: str, entry_id: str, user: User):
    ensure_site_access(site_id, user)
    response = get_admin_client().table("ledger_entries").select("*, categories(name,type), notes(*)").eq("site_id", site_id).eq("id", entry_id).is_("deleted_at", "null").maybe_single().execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Ledger entry not found")
    return response.data


@router.patch("/sites/{site_id}/ledger/{entry_id}")
def update_ledger_entry(site_id: str, entry_id: str, payload: LedgerUpdate, user: Builder):
    ensure_site_access(site_id, user, builder_only=True)
    db = get_admin_client()
    current_response = db.table("ledger_entries").select("*").eq("site_id", site_id).eq("id", entry_id).is_("deleted_at", "null").maybe_single().execute()
    current = current_response.data
    if not current:
        raise HTTPException(status_code=404, detail="Ledger entry not found")
    changes = payload.model_dump(mode="json", exclude_none=True)
    if "entry_type" in changes and changes["entry_type"] != current["entry_type"]:
        raise HTTPException(status_code=400, detail="The entry type cannot be changed when editing. Delete and recreate the entry instead.")
    entry_type = changes.get("entry_type", current["entry_type"])
    if "category_id" in changes or "entry_type" in changes:
        _validate_category(db, site_id, changes.get("category_id", current["category_id"]), entry_type)
    updated = db.table("ledger_entries").update({**changes, "updated_by": user.id}).eq("id", entry_id).execute().data[0]
    record_audit(db, site_id=site_id, actor_id=user.id, action="ledger_entry_updated", entity_type="ledger_entry", entity_id=entry_id, description="Updated ledger entry", metadata=jsonable_encoder({"before": current, "after": updated}))
    return updated


@router.delete("/sites/{site_id}/ledger/{entry_id}")
def delete_ledger_entry(site_id: str, entry_id: str, user: Builder):
    ensure_site_access(site_id, user, builder_only=True)
    db = get_admin_client()
    current = db.table("ledger_entries").select("*").eq("site_id", site_id).eq("id", entry_id).is_("deleted_at", "null").maybe_single().execute().data
    if not current:
        raise HTTPException(status_code=404, detail="Ledger entry not found")
    updated = db.table("ledger_entries").update({"deleted_at": datetime.now(timezone.utc).isoformat(), "updated_by": user.id}).eq("id", entry_id).execute().data[0]
    record_audit(db, site_id=site_id, actor_id=user.id, action="ledger_entry_deleted", entity_type="ledger_entry", entity_id=entry_id, description="Deleted ledger entry", metadata=jsonable_encoder({"deleted_entry": current}))
    return {"id": updated["id"], "deleted": True}


@router.post("/sites/{site_id}/notes", status_code=status.HTTP_201_CREATED)
def create_site_note(site_id: str, payload: NoteCreate, user: User):
    ensure_site_access(site_id, user)
    db = get_admin_client()
    note = db.table("notes").insert({"site_id": site_id, "created_by": user.id, "content": payload.content}).execute().data[0]
    note = db.table("notes").select("*, profiles!notes_created_by_fkey(full_name,email)").eq("id", note["id"]).single().execute().data
    record_audit(db, site_id=site_id, actor_id=user.id, action="note_created", entity_type="note", entity_id=note["id"], description="Added a site note")
    return note


@router.get("/sites/{site_id}/notes")
def list_site_notes(site_id: str, user: User):
    ensure_site_access(site_id, user)
    return get_admin_client().table("notes").select("*, ledger_entries(description,entry_type,amount), profiles!notes_created_by_fkey(full_name,email)").eq("site_id", site_id).order("created_at", desc=True).execute().data or []


def _get_standalone_note(db, site_id: str, note_id: str, user: User) -> dict:
    note = db.table("notes").select("*").eq("site_id", site_id).eq("id", note_id).is_("ledger_entry_id", "null").maybe_single().execute().data
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if user.role != "builder" and note["created_by"] != user.id:
        raise HTTPException(status_code=403, detail="Only the author or a builder can manage this note")
    return note


@router.patch("/sites/{site_id}/notes/{note_id}")
def update_site_note(site_id: str, note_id: str, payload: NoteUpdate, user: User):
    ensure_site_access(site_id, user)
    db = get_admin_client()
    _get_standalone_note(db, site_id, note_id, user)
    updated = db.table("notes").update({"content": payload.content}).eq("id", note_id).execute().data[0]
    updated = db.table("notes").select("*, ledger_entries(description,entry_type,amount), profiles!notes_created_by_fkey(full_name,email)").eq("id", updated["id"]).single().execute().data
    record_audit(db, site_id=site_id, actor_id=user.id, action="note_updated", entity_type="note", entity_id=note_id, description="Updated a site note")
    return updated


@router.delete("/sites/{site_id}/notes/{note_id}")
def delete_site_note(site_id: str, note_id: str, user: User):
    ensure_site_access(site_id, user)
    db = get_admin_client()
    _get_standalone_note(db, site_id, note_id, user)
    db.table("notes").delete().eq("id", note_id).execute()
    record_audit(db, site_id=site_id, actor_id=user.id, action="note_deleted", entity_type="note", entity_id=note_id, description="Deleted a site note")
    return {"id": note_id, "deleted": True}


@router.get("/sites/{site_id}/summary")
def site_summary(site_id: str, user: User):
    ensure_site_access(site_id, user)
    entries = get_admin_client().table("ledger_entries").select("entry_type,amount,entry_date,category_id,categories(name)").eq("site_id", site_id).is_("deleted_at", "null").execute().data or []
    income = sum((Decimal(str(row["amount"])) for row in entries if row["entry_type"] == "income"), Decimal("0"))
    expenses = sum((Decimal(str(row["amount"])) for row in entries if row["entry_type"] == "expense"), Decimal("0"))
    by_category: dict[str, Decimal] = {}
    for row in entries:
        if row["entry_type"] == "expense":
            category = (row.get("categories") or {}).get("name", "Other")
            by_category[category] = by_category.get(category, Decimal("0")) + Decimal(str(row["amount"]))
    return {"income": income, "expenses": expenses, "balance": income - expenses, "expense_by_category": [{"category": key, "amount": value} for key, value in by_category.items()], "entry_count": len(entries)}


@router.get("/sites/{site_id}/reports/monthly")
def monthly_report(site_id: str, user: User, year: int | None = None):
    ensure_site_access(site_id, user)
    entries = get_admin_client().table("ledger_entries").select("entry_type,amount,entry_date").eq("site_id", site_id).is_("deleted_at", "null").execute().data or []
    months: dict[str, dict[str, Decimal]] = {}
    for row in entries:
        month = row["entry_date"][:7]
        if year and int(month[:4]) != year:
            continue
        months.setdefault(month, {"income": Decimal("0"), "expenses": Decimal("0"), "balance": Decimal("0")})
        key = "income" if row["entry_type"] == "income" else "expenses"
        months[month][key] += Decimal(str(row["amount"]))
        months[month]["balance"] = months[month]["income"] - months[month]["expenses"]
    return [{"month": month, **values} for month, values in sorted(months.items())]


@router.get("/sites/{site_id}/reports/export")
def export_report(site_id: str, user: User):
    ensure_site_access(site_id, user)
    rows = get_admin_client().table("ledger_entries").select("entry_date,entry_type,amount,description,payment_method,reference,categories(name)").eq("site_id", site_id).is_("deleted_at", "null").order("entry_date", desc=True).execute().data or []
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Type", "Category", "Amount", "Description", "Payment method", "Reference"])
    for row in rows:
        writer.writerow([row.get("entry_date", ""), row.get("entry_type", ""), (row.get("categories") or {}).get("name", ""), row.get("amount", ""), row.get("description", ""), row.get("payment_method", ""), row.get("reference", "")])
    record_audit(get_admin_client(), site_id=site_id, actor_id=user.id, action="report_exported", entity_type="report", description="Exported ledger report")
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="nirmanam-{site_id}-ledger.csv"'})


@router.post("/sites/{site_id}/attachments", status_code=status.HTTP_201_CREATED)
def upload_attachment(site_id: str, user: User, file: UploadFile = File(...), ledger_entry_id: str | None = None):
    ensure_site_access(site_id, user)
    if file.content_type not in {"image/jpeg", "image/png", "application/pdf"}:
        raise HTTPException(status_code=415, detail="Only JPG, PNG, and PDF receipts are supported")
    content = file.file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Receipt must be smaller than 10MB")
    db = get_admin_client()
    path = f"{site_id}/{ledger_entry_id or 'site'}/{datetime.now(timezone.utc).timestamp()}-{file.filename}"
    db.storage.from_("receipts").upload(path, content, {"content-type": file.content_type or "application/octet-stream"})
    attachment = db.table("attachments").insert({"site_id": site_id, "ledger_entry_id": ledger_entry_id, "uploaded_by": user.id, "file_name": file.filename, "storage_path": path, "mime_type": file.content_type, "file_size": len(content)}).execute().data[0]
    signed = db.storage.from_("receipts").create_signed_url(path, 3600)
    record_audit(db, site_id=site_id, actor_id=user.id, action="receipt_uploaded", entity_type="attachment", entity_id=attachment["id"], description=f"Uploaded {file.filename}")
    return {**attachment, "signed_url": signed.get("signedURL") or signed.get("signedUrl")}


@router.get("/audit-logs")
def workspace_audit_logs(user: Builder, page: int = Query(default=1, ge=1), page_size: int = Query(default=50, ge=1, le=100)):
    """Audit history across every site the builder can access."""
    db = get_admin_client()
    owned = db.table("sites").select("id").eq("owner_id", user.id).execute().data or []
    owner_ids = [site["id"] for site in owned if site.get("id")]
    member_ids = [row["site_id"] for row in db.table("site_members").select("site_id").eq("user_id", user.id).execute().data or []]
    site_ids = list(dict.fromkeys(owner_ids + member_ids))
    if not site_ids:
        return {"items": [], "page": page, "page_size": page_size, "total": 0}
    start = (page - 1) * page_size
    query = db.table("audit_logs").select("*, sites(name), profiles(full_name,email)", count="exact").in_("site_id", site_ids).order("created_at", desc=True)
    response = query.range(start, start + page_size - 1).execute()
    return {"items": response.data or [], "page": page, "page_size": page_size, "total": response.count or 0}


@router.get("/sites/{site_id}/audit-logs")
def list_audit_logs(site_id: str, user: Builder, page: int = Query(default=1, ge=1), page_size: int = Query(default=50, ge=1, le=100)):
    ensure_site_access(site_id, user, builder_only=True)
    start = (page - 1) * page_size
    response = get_admin_client().table("audit_logs").select("*, profiles(full_name,email)", count="exact").eq("site_id", site_id).order("created_at", desc=True).range(start, start + page_size - 1).execute()
    return {"items": response.data or [], "page": page, "page_size": page_size, "total": response.count or 0}
