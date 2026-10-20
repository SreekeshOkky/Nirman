from __future__ import annotations

from datetime import date
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import calendar
import csv
import io
import re
from typing import Literal

from fastapi.encoders import jsonable_encoder
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File, status
from fastapi.responses import StreamingResponse

from .config import get_settings
from .dependencies import Builder, User, ensure_site_access, ensure_site_active, forget_profile, get_admin_client, get_auth_client, maybe_one, require_feature
from .features import FEATURE_AUDIT_LOG, FEATURE_CATEGORIES, FEATURE_NOTES, get_features, is_enabled
from .schemas import CategoryCreate, CategoryUpdate, InvitationCreate, LedgerCreate, LedgerUpdate, NoteCreate, NoteUpdate, ProfileUpdate, SiteCreate, SiteUpdate
from .services import record_audit

router = APIRouter()
# Feature-gated sub-routers: their dependencies run before endpoint-level auth,
# so a disabled feature is rejected even without a valid token.
audit_router = APIRouter(dependencies=[Depends(require_feature(FEATURE_AUDIT_LOG))])
notes_router = APIRouter(dependencies=[Depends(require_feature(FEATURE_NOTES))])
categories_router = APIRouter(dependencies=[Depends(require_feature(FEATURE_CATEGORIES))])


@router.get("/features")
def list_features():
    """Effective feature flags so the UI can hide disabled features too."""
    return get_features()


@router.get("/me")
def read_me(user: User):
    return {"id": user.id, "email": user.email, "full_name": user.full_name, "role": user.role}


@router.patch("/me")
def update_me(update: ProfileUpdate, user: User):
    """Let users rename themselves. Role is immutable and never accepted here."""
    db = get_admin_client()
    updated = (
        db.table("profiles")
        .update({"full_name": update.full_name.strip()})
        .eq("id", user.id)
        .execute()
    )
    profile = (updated.data or [{}])[0]
    forget_profile(user.id)
    return {
        "id": profile.get("id"),
        "email": profile.get("email") or "",
        "full_name": profile.get("full_name") or "",
        "role": profile.get("role") or "",
    }


@router.get("/sites")
def list_sites(user: User, include_archived: bool = Query(default=False)):
    """Active sites by default; archived (inactive) ones stay hidden unless asked for."""
    db = get_admin_client()
    query = db.table("sites").select("*").eq("owner_id", user.id)
    if not include_archived:
        query = query.neq("status", "archived")
    owned = query.execute().data or []
    member_rows = db.table("site_members").select("site_id").eq("user_id", user.id).execute().data or []
    member_ids = [row["site_id"] for row in member_rows]
    invited = []
    if member_ids:
        invited_query = db.table("sites").select("*").in_("id", member_ids)
        if not include_archived:
            invited_query = invited_query.neq("status", "archived")
        invited = invited_query.execute().data or []
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


@router.get("/updates")
def list_updates(user: User, since: datetime | None = Query(default=None)):
    """What needs attention across the user's active sites.

    Builders: sites over (or near) budget, recent payments without a receipt,
    and entries the team added since `since` (default: the last 48 hours).
    Supervisors: only their own recent payments that still need a receipt.
    """
    db = get_admin_client()
    empty = {"over_budget": [], "missing_receipts": [], "new_entries": []}
    builder = user.role == "builder"
    if builder:
        sites = db.table("sites").select("id,name,budget").eq("owner_id", user.id).neq("status", "archived").execute().data or []
    else:
        member_ids = [row["site_id"] for row in db.table("site_members").select("site_id").eq("user_id", user.id).execute().data or []]
        sites = db.table("sites").select("id,name,budget").in_("id", member_ids).neq("status", "archived").execute().data or [] if member_ids else []
    if not sites:
        return empty
    names = {site["id"]: site["name"] for site in sites}
    now = datetime.now(timezone.utc)
    since = since or now - timedelta(hours=48)
    if since.tzinfo is None:
        since = since.replace(tzinfo=timezone.utc)

    over_budget = []
    if builder:
        spent: dict[str, Decimal] = {}
        rows = db.table("ledger_entries").select("site_id,amount").in_("site_id", list(names)).eq("entry_type", "expense").is_("deleted_at", "null").execute().data or []
        for row in rows:
            spent[row["site_id"]] = spent.get(row["site_id"], Decimal("0")) + Decimal(str(row["amount"]))
        for site in sites:
            budget = Decimal(str(site.get("budget") or 0))
            total = spent.get(site["id"], Decimal("0"))
            if budget > 0 and total >= budget * Decimal("0.9"):
                over_budget.append({"site_id": site["id"], "site_name": site["name"], "budget": budget, "spent": total, "pct": int(total * 100 / budget)})
        over_budget.sort(key=lambda item: item["pct"], reverse=True)

    # Recent entries only: older gaps are for the month-end review, not alerts.
    recent = (
        db.table("ledger_entries")
        .select("id,site_id,entry_type,amount,paid_to,entry_date,created_at,created_by,categories(name),attachments(id),profiles!ledger_entries_created_by_fkey(full_name,email)")
        .in_("site_id", list(names))
        .is_("deleted_at", "null")
        .gte("created_at", (now - timedelta(days=30)).isoformat())
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    person = lambda row: (row.get("profiles") or {}).get("full_name") or (row.get("profiles") or {}).get("email") or ""
    missing = [
        {
            "entry_id": row["id"],
            "site_id": row["site_id"],
            "site_name": names[row["site_id"]],
            "amount": row["amount"],
            "paid_to": row.get("paid_to"),
            "category": (row.get("categories") or {}).get("name"),
            "entry_date": row["entry_date"],
            "added_by": person(row),
        }
        for row in recent
        if row["entry_type"] == "expense" and not row.get("attachments") and (builder or row["created_by"] == user.id)
    ][:50]

    new_entries = []
    if builder:
        groups: dict[tuple[str, str], dict] = {}
        for row in recent:
            created = datetime.fromisoformat(row["created_at"].replace("Z", "+00:00"))
            if row["created_by"] == user.id or created <= since:
                continue
            group = groups.setdefault((row["site_id"], row["created_by"]), {"site_id": row["site_id"], "site_name": names[row["site_id"]], "added_by": person(row), "count": 0, "total": Decimal("0"), "latest_at": row["created_at"]})
            group["count"] += 1
            if row["entry_type"] == "expense":
                group["total"] += Decimal(str(row["amount"]))
        new_entries = list(groups.values())

    return {"over_budget": over_budget, "missing_receipts": missing, "new_entries": new_entries}


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
    if site["status"] == "archived":
        raise HTTPException(status_code=409, detail="This site is already inactive")
    updated = db.table("sites").update({"status": "archived"}).eq("id", site_id).execute().data[0]
    record_audit(db, site_id=site_id, actor_id=user.id, action="site_archived", entity_type="site", entity_id=site_id, description=f"Archived site {site['name']}")
    return updated


@router.post("/sites/{site_id}/activate")
def activate_site(site_id: str, user: Builder):
    db = get_admin_client()
    site = ensure_site_access(site_id, user, builder_only=True)
    if site["status"] != "archived":
        raise HTTPException(status_code=409, detail="Only inactive sites can be reactivated")
    updated = db.table("sites").update({"status": "active"}).eq("id", site_id).execute().data[0]
    record_audit(db, site_id=site_id, actor_id=user.id, action="site_activated", entity_type="site", entity_id=site_id, description=f"Reactivated site {site['name']}")
    return updated


@categories_router.get("/categories")
def list_my_categories(user: User):
    return (
        get_admin_client()
        .table("categories")
        .select("*")
        .is_("site_id", "null")
        .eq("created_by", user.id)
        .eq("is_active", True)
        .order("name")
        .execute()
        .data
        or []
    )


@categories_router.post("/categories", status_code=status.HTTP_201_CREATED)
def create_my_category(payload: CategoryCreate, user: User):
    db = get_admin_client()
    existing = (
        db.table("categories")
        .select("id")
        .is_("site_id", "null")
        .eq("created_by", user.id)
        .ilike("name", payload.name)
        .limit(1)
        .execute()
        .data
    )
    if existing:
        raise HTTPException(status_code=409, detail="A category with this name already exists")
    return db.table("categories").insert({**payload.model_dump(), "created_by": user.id}).execute().data[0]


@categories_router.patch("/categories/{category_id}")
def update_my_category(category_id: str, payload: CategoryUpdate, user: User):
    db = get_admin_client()
    current = (
        db.table("categories")
        .select("*")
        .eq("id", category_id)
        .is_("site_id", "null")
        .eq("created_by", user.id)
        .limit(1)
        .execute()
        .data
    )
    if not current:
        raise HTTPException(status_code=404, detail="Category not found")
    current = current[0]
    changes = payload.model_dump(exclude_none=True)
    if not changes:
        return current
    if "name" in changes:
        existing = (
            db.table("categories")
            .select("id")
            .is_("site_id", "null")
            .eq("created_by", user.id)
            .ilike("name", changes["name"])
            .neq("id", category_id)
            .limit(1)
            .execute()
            .data
        )
        if existing:
            raise HTTPException(status_code=409, detail="A category with this name already exists")
    return db.table("categories").update(changes).eq("id", category_id).execute().data[0]


@categories_router.post("/categories/{category_id}/disable")
def disable_my_category(category_id: str, user: User):
    db = get_admin_client()
    current = (
        db.table("categories")
        .select("*")
        .eq("id", category_id)
        .is_("site_id", "null")
        .eq("created_by", user.id)
        .limit(1)
        .execute()
        .data
    )
    if not current:
        raise HTTPException(status_code=404, detail="Category not found")
    return db.table("categories").update({"is_active": False}).eq("id", category_id).execute().data[0]


@router.get("/sites/{site_id}/categories")
def list_categories(site_id: str, user: User):
    site = ensure_site_access(site_id, user)
    db = get_admin_client()
    site_rows = (
        db.table("categories").select("*").eq("site_id", site_id).eq("is_active", True).execute().data or []
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


@router.get("/sites/{site_id}/members")
def list_members(site_id: str, user: Builder):
    ensure_site_access(site_id, user, builder_only=True)
    return get_admin_client().table("site_members").select("*, profiles!site_members_user_id_fkey(id,full_name,email,role)").eq("site_id", site_id).order("created_at").execute().data or []


def _welcome_url(request: Request) -> str:
    # Prefer the app's own origin so links work without configuring FRONTEND_URL.
    # Supabase only redirects to URLs on its allow-list, so this can't be abused.
    origin = request.headers.get("origin") or get_settings().frontend_url
    return f"{origin.rstrip('/')}/welcome"


def _accept(db, invitation: dict, user_id: str, actor_email: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    db.table("site_members").upsert({"site_id": invitation["site_id"], "user_id": user_id, "role": "supervisor", "invited_by": invitation["invited_by"], "joined_at": now}, on_conflict="site_id,user_id").execute()
    db.table("invitations").update({"status": "accepted", "accepted_at": now}).eq("id", invitation["id"]).execute()
    record_audit(db, site_id=invitation["site_id"], actor_id=user_id, action="invitation_accepted", entity_type="invitation", entity_id=invitation["id"], description=f"{actor_email} joined the site")


def _is_expired(invitation: dict) -> bool:
    return datetime.fromisoformat(invitation["expires_at"].replace("Z", "+00:00")) < datetime.now(timezone.utc)


@router.post("/sites/{site_id}/members/invite", status_code=status.HTTP_201_CREATED)
def invite_member(site_id: str, payload: InvitationCreate, user: Builder, request: Request):
    """Invite a supervisor. Existing supervisor accounts are added straight away;
    new people get an email and join the site on their first sign-in."""
    site = ensure_site_access(site_id, user, builder_only=True)
    ensure_site_active(site)
    db = get_admin_client()
    email = payload.email.strip().lower()
    if email == user.email.lower():
        raise HTTPException(status_code=400, detail="You already own this site")
    if maybe_one(db.table("invitations").select("id").eq("site_id", site_id).eq("email", email).eq("status", "pending")):
        raise HTTPException(status_code=409, detail="This person has already been invited. Use Resend on the pending invite.")
    profile = maybe_one(db.table("profiles").select("id,role").eq("email", email))
    if profile and profile["role"] == "builder":
        raise HTTPException(status_code=409, detail="This email belongs to a builder account. Supervisors need their own account.")
    if profile and maybe_one(db.table("site_members").select("id").eq("site_id", site_id).eq("user_id", profile["id"])):
        raise HTTPException(status_code=409, detail="This person is already on the team")
    invitation = db.table("invitations").insert({"site_id": site_id, "email": email, "invited_by": user.id}).execute().data[0]
    if profile:
        _accept(db, invitation, profile["id"], email)
        record_audit(db, site_id=site_id, actor_id=user.id, action="member_added", entity_type="invitation", entity_id=invitation["id"], description=f"Added {email} to {site['name']}")
        return {**invitation, "status": "accepted", "added": True}
    try:
        get_admin_client().auth.admin.invite_user_by_email(email, options={"data": {"site_id": site_id, "invitation_token": invitation["token"]}, "redirect_to": _welcome_url(request)})
    except Exception as exc:
        db.table("invitations").update({"status": "cancelled"}).eq("id", invitation["id"]).execute()
        raise HTTPException(status_code=502, detail="Could not send invitation email") from exc
    record_audit(db, site_id=site_id, actor_id=user.id, action="member_invited", entity_type="invitation", entity_id=invitation["id"], description=f"Invited {email} to {site['name']}")
    return {**invitation, "added": False}


@router.get("/sites/{site_id}/invitations")
def list_invitations(site_id: str, user: Builder):
    ensure_site_access(site_id, user, builder_only=True)
    return get_admin_client().table("invitations").select("id,email,status,expires_at,created_at").eq("site_id", site_id).eq("status", "pending").order("created_at").execute().data or []


def _pending_invitation(db, site_id: str, invitation_id: str) -> dict:
    invitation = maybe_one(db.table("invitations").select("*").eq("id", invitation_id).eq("site_id", site_id).eq("status", "pending"))
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    return invitation


@router.post("/sites/{site_id}/invitations/{invitation_id}/resend")
def resend_invitation(site_id: str, invitation_id: str, user: Builder, request: Request):
    """Extend the invite and email a fresh link to set a password."""
    ensure_site_active(ensure_site_access(site_id, user, builder_only=True))
    db = get_admin_client()
    invitation = _pending_invitation(db, site_id, invitation_id)
    expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    db.table("invitations").update({"expires_at": expires_at}).eq("id", invitation_id).execute()
    try:
        get_auth_client().auth.reset_password_for_email(invitation["email"], {"redirect_to": _welcome_url(request)})
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Could not send invitation email") from exc
    record_audit(db, site_id=site_id, actor_id=user.id, action="invitation_resent", entity_type="invitation", entity_id=invitation_id, description=f"Resent invite to {invitation['email']}")
    return {**invitation, "expires_at": expires_at}


@router.delete("/sites/{site_id}/invitations/{invitation_id}")
def cancel_invitation(site_id: str, invitation_id: str, user: Builder):
    ensure_site_access(site_id, user, builder_only=True)
    db = get_admin_client()
    invitation = _pending_invitation(db, site_id, invitation_id)
    db.table("invitations").update({"status": "cancelled"}).eq("id", invitation_id).execute()
    record_audit(db, site_id=site_id, actor_id=user.id, action="invitation_cancelled", entity_type="invitation", entity_id=invitation_id, description=f"Cancelled invite to {invitation['email']}")
    return {"id": invitation_id, "cancelled": True}


@router.post("/invitations/accept-pending")
def accept_pending_invitations(user: User):
    """Join every site this email was invited to. Called by the app after sign-in,
    so supervisors get access however they reached the app."""
    if user.role != "supervisor" or not user.email:
        return {"accepted": []}
    db = get_admin_client()
    pending = db.table("invitations").select("*").eq("email", user.email.lower()).eq("status", "pending").execute().data or []
    accepted = []
    for invitation in pending:
        if _is_expired(invitation):
            continue
        _accept(db, invitation, user.id, user.email)
        accepted.append(invitation["site_id"])
    return {"accepted": accepted}


@router.post("/invitations/{token}/accept")
def accept_invitation(token: str, user: User):
    db = get_admin_client()
    invitation = maybe_one(db.table("invitations").select("*").eq("token", token).eq("status", "pending"))
    if not invitation or _is_expired(invitation):
        raise HTTPException(status_code=404, detail="Invitation is missing or expired")
    if invitation["email"].lower() != user.email.lower():
        raise HTTPException(status_code=403, detail="This invitation belongs to a different email address")
    _accept(db, invitation, user.id, user.email)
    return {"site_id": invitation["site_id"], "accepted": True}


@router.delete("/sites/{site_id}/members/{member_id}")
def remove_member(site_id: str, member_id: str, user: Builder):
    ensure_site_access(site_id, user, builder_only=True)
    db = get_admin_client()
    member = maybe_one(db.table("site_members").select("*, profiles!site_members_user_id_fkey(email)").eq("id", member_id).eq("site_id", site_id))
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    db.table("site_members").delete().eq("id", member_id).execute()
    record_audit(db, site_id=site_id, actor_id=user.id, action="member_removed", entity_type="site_member", entity_id=member_id, description=f"Removed {(member.get('profiles') or {}).get('email', 'supervisor')}")
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
    query = get_admin_client().table("ledger_entries").select("*, categories(name,type), profiles!ledger_entries_created_by_fkey(full_name,email)", count="exact").eq("site_id", site_id).is_("deleted_at", "null").order("entry_date", desc=True)
    if entry_type:
        query = query.eq("entry_type", entry_type)
    if category_id:
        query = query.eq("category_id", category_id)
    if from_date:
        query = query.gte("entry_date", from_date.isoformat())
    if to_date:
        query = query.lte("entry_date", to_date.isoformat())
    # PostgREST's or= syntax treats , ( ) as separators, so drop them.
    term = re.sub(r"[,()*%]", " ", search or "").strip()
    if term:
        query = query.or_(f"description.ilike.*{term}*,paid_to.ilike.*{term}*")
    start = (page - 1) * page_size
    response = query.range(start, start + page_size - 1).execute()
    return {"items": response.data or [], "page": page, "page_size": page_size, "total": response.count or 0}


def _validate_category(db, site: dict, category_id: str, entry_type: str) -> dict:
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


@router.post("/sites/{site_id}/ledger", status_code=status.HTTP_201_CREATED)
def create_ledger_entry(site_id: str, payload: LedgerCreate, user: User):
    site = ensure_site_access(site_id, user)
    ensure_site_active(site)
    db = get_admin_client()
    category = _validate_category(db, site, str(payload.category_id), payload.entry_type)
    row = payload.model_dump(mode="json", exclude={"note"})
    row.update({"site_id": site_id, "created_by": user.id})
    response = db.table("ledger_entries").insert(row).execute()
    entry = response.data[0]
    if payload.note and is_enabled(FEATURE_NOTES):
        db.table("notes").insert({"site_id": site_id, "ledger_entry_id": entry["id"], "created_by": user.id, "content": payload.note}).execute()
    who = f" {'to' if payload.entry_type == 'expense' else 'from'} {payload.paid_to}" if payload.paid_to else ""
    record_audit(db, site_id=site_id, actor_id=user.id, action="ledger_entry_created", entity_type="ledger_entry", entity_id=entry["id"], description=f"Added {payload.entry_type} for {category['name']}{who}", metadata={"amount": str(payload.amount), "category": category["name"], "paid_to": payload.paid_to})
    return entry


@router.get("/sites/{site_id}/ledger/{entry_id}")
def read_ledger_entry(site_id: str, entry_id: str, user: User):
    ensure_site_access(site_id, user)
    db = get_admin_client()
    rows = db.table("ledger_entries").select("*, categories(name,type), notes(*), attachments(*), profiles!ledger_entries_created_by_fkey(full_name,email)").eq("site_id", site_id).eq("id", entry_id).is_("deleted_at", "null").limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Ledger entry not found")
    entry = rows[0]
    for attachment in entry.get("attachments") or []:
        signed = db.storage.from_("receipts").create_signed_url(attachment["storage_path"], 3600)
        attachment["signed_url"] = signed.get("signedURL") or signed.get("signedUrl")
    return entry


@router.patch("/sites/{site_id}/ledger/{entry_id}")
def update_ledger_entry(site_id: str, entry_id: str, payload: LedgerUpdate, user: Builder):
    site = ensure_site_access(site_id, user, builder_only=True)
    ensure_site_active(site)
    db = get_admin_client()
    current = maybe_one(db.table("ledger_entries").select("*").eq("site_id", site_id).eq("id", entry_id).is_("deleted_at", "null"))
    if not current:
        raise HTTPException(status_code=404, detail="Ledger entry not found")
    changes = payload.model_dump(mode="json", exclude_none=True)
    if "entry_type" in changes and changes["entry_type"] != current["entry_type"]:
        raise HTTPException(status_code=400, detail="The entry type cannot be changed when editing. Delete and recreate the entry instead.")
    entry_type = changes.get("entry_type", current["entry_type"])
    if "category_id" in changes or "entry_type" in changes:
        _validate_category(db, site, changes.get("category_id", current["category_id"]), entry_type)
    updated = db.table("ledger_entries").update({**changes, "updated_by": user.id}).eq("id", entry_id).execute().data[0]
    record_audit(db, site_id=site_id, actor_id=user.id, action="ledger_entry_updated", entity_type="ledger_entry", entity_id=entry_id, description="Updated ledger entry", metadata=jsonable_encoder({"before": current, "after": updated}))
    return updated


@router.delete("/sites/{site_id}/ledger/{entry_id}")
def delete_ledger_entry(site_id: str, entry_id: str, user: Builder):
    site = ensure_site_access(site_id, user, builder_only=True)
    ensure_site_active(site)
    db = get_admin_client()
    current = maybe_one(db.table("ledger_entries").select("*").eq("site_id", site_id).eq("id", entry_id).is_("deleted_at", "null"))
    if not current:
        raise HTTPException(status_code=404, detail="Ledger entry not found")
    updated = db.table("ledger_entries").update({"deleted_at": datetime.now(timezone.utc).isoformat(), "updated_by": user.id}).eq("id", entry_id).execute().data[0]
    record_audit(db, site_id=site_id, actor_id=user.id, action="ledger_entry_deleted", entity_type="ledger_entry", entity_id=entry_id, description="Deleted ledger entry", metadata=jsonable_encoder({"deleted_entry": current}))
    return {"id": updated["id"], "deleted": True}


@router.post("/sites/{site_id}/ledger/{entry_id}/restore")
def restore_ledger_entry(site_id: str, entry_id: str, user: Builder):
    """Undo a delete. Entries are soft-deleted, so this just clears deleted_at."""
    site = ensure_site_access(site_id, user, builder_only=True)
    ensure_site_active(site)
    db = get_admin_client()
    current = maybe_one(db.table("ledger_entries").select("*").eq("site_id", site_id).eq("id", entry_id))
    if not current or not current.get("deleted_at"):
        raise HTTPException(status_code=404, detail="Deleted entry not found")
    restored = db.table("ledger_entries").update({"deleted_at": None, "updated_by": user.id}).eq("id", entry_id).execute().data[0]
    record_audit(db, site_id=site_id, actor_id=user.id, action="ledger_entry_restored", entity_type="ledger_entry", entity_id=entry_id, description="Restored deleted ledger entry")
    return restored


@notes_router.post("/sites/{site_id}/notes", status_code=status.HTTP_201_CREATED)
def create_site_note(site_id: str, payload: NoteCreate, user: User):
    ensure_site_active(ensure_site_access(site_id, user))
    db = get_admin_client()
    note = db.table("notes").insert({"site_id": site_id, "created_by": user.id, "content": payload.content}).execute().data[0]
    note = db.table("notes").select("*, profiles!notes_created_by_fkey(full_name,email)").eq("id", note["id"]).single().execute().data
    record_audit(db, site_id=site_id, actor_id=user.id, action="note_created", entity_type="note", entity_id=note["id"], description="Added a site note")
    return note


@notes_router.get("/sites/{site_id}/notes")
def list_site_notes(site_id: str, user: User):
    ensure_site_access(site_id, user)
    return get_admin_client().table("notes").select("*, ledger_entries(description,entry_type,amount), profiles!notes_created_by_fkey(full_name,email)").eq("site_id", site_id).order("created_at", desc=True).execute().data or []


def _get_standalone_note(db, site_id: str, note_id: str, user: User) -> dict:
    note = maybe_one(db.table("notes").select("*").eq("site_id", site_id).eq("id", note_id).is_("ledger_entry_id", "null"))
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if user.role != "builder" and note["created_by"] != user.id:
        raise HTTPException(status_code=403, detail="Only the author or a builder can manage this note")
    return note


@notes_router.patch("/sites/{site_id}/notes/{note_id}")
def update_site_note(site_id: str, note_id: str, payload: NoteUpdate, user: User):
    ensure_site_active(ensure_site_access(site_id, user))
    db = get_admin_client()
    _get_standalone_note(db, site_id, note_id, user)
    updated = db.table("notes").update({"content": payload.content}).eq("id", note_id).execute().data[0]
    updated = db.table("notes").select("*, ledger_entries(description,entry_type,amount), profiles!notes_created_by_fkey(full_name,email)").eq("id", updated["id"]).single().execute().data
    record_audit(db, site_id=site_id, actor_id=user.id, action="note_updated", entity_type="note", entity_id=note_id, description="Updated a site note")
    return updated


@notes_router.delete("/sites/{site_id}/notes/{note_id}")
def delete_site_note(site_id: str, note_id: str, user: User):
    ensure_site_active(ensure_site_access(site_id, user))
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


def _monthly_rows(db, site_id: str, year: int | None = None) -> list[dict]:
    entries = db.table("ledger_entries").select("entry_type,amount,entry_date").eq("site_id", site_id).is_("deleted_at", "null").execute().data or []
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


@router.get("/sites/{site_id}/reports/monthly")
def monthly_report(site_id: str, user: User, year: int | None = None):
    ensure_site_access(site_id, user)
    return _monthly_rows(get_admin_client(), site_id, year)


def _csv_cell(value) -> str:
    text = str(value or "")
    if text[:1] in {"=", "+", "-", "@"}:
        text = "'" + text
    return text


@router.get("/sites/{site_id}/reports/export")
def export_report(site_id: str, user: User, month: str | None = Query(default=None, max_length=7)):
    site = ensure_site_access(site_id, user)
    query = (
        get_admin_client()
        .table("ledger_entries")
        .select(
            "id,entry_date,entry_type,amount,paid_to,description,payment_method,reference,created_at,updated_at,categories(name),notes(content),attachments(file_name),profiles!ledger_entries_created_by_fkey(full_name,email)"
        )
        .eq("site_id", site_id)
        .is_("deleted_at", "null")
        .order("entry_date", desc=True)
    )
    if month:
        year, _, mon = month.partition("-")
        if not (year.isdigit() and mon.isdigit() and 1 <= int(mon) <= 12):
            raise HTTPException(status_code=422, detail="month must be in YYYY-MM format")
        last_day = calendar.monthrange(int(year), int(mon))[1]
        query = query.gte("entry_date", f"{month}-01").lte("entry_date", f"{month}-{last_day:02d}")
    rows = query.execute().data or []
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        ["Date", "Type", "Category", "Paid to / from", "Amount", "Description", "Payment method", "UPI / bank reference", "Note", "Added by", "Created at", "Last updated", "Receipt"]
    )
    for row in rows:
        notes = "; ".join(note.get("content", "") for note in row.get("notes") or [])
        receipts = ", ".join(attachment.get("file_name", "") for attachment in row.get("attachments") or [])
        updated_at = row.get("updated_at", "")
        writer.writerow(
            [
                row.get("entry_date", ""),
                row.get("entry_type", ""),
                (row.get("categories") or {}).get("name", ""),
                _csv_cell(row.get("paid_to")),
                row.get("amount", ""),
                _csv_cell(row.get("description")),
                row.get("payment_method", ""),
                _csv_cell(row.get("reference")),
                notes,
                (row.get("profiles") or {}).get("full_name", ""),
                row.get("created_at", ""),
                updated_at if updated_at != row.get("created_at") else "",
                receipts,
            ]
        )
    record_audit(get_admin_client(), site_id=site_id, actor_id=user.id, action="report_exported", entity_type="report", description="Exported ledger report")
    fn_suffix = f"-{month}" if month else ""
    fn_site = re.sub(r"[^A-Za-z0-9]+", "-", site.get("name") or "").strip("-").lower() or site_id
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{fn_site}{fn_suffix}-ledger.csv"'})


@router.post("/sites/{site_id}/attachments", status_code=status.HTTP_201_CREATED)
def upload_attachment(site_id: str, user: User, file: UploadFile = File(...), ledger_entry_id: str | None = None):
    ensure_site_active(ensure_site_access(site_id, user))
    if file.content_type not in {"image/jpeg", "image/png", "application/pdf"}:
        raise HTTPException(status_code=415, detail="Only JPG, PNG, and PDF receipts are supported")
    content = file.file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Receipt must be smaller than 10MB")
    db = get_admin_client()
    if ledger_entry_id and not maybe_one(db.table("ledger_entries").select("id").eq("id", ledger_entry_id).eq("site_id", site_id).is_("deleted_at", "null")):
        raise HTTPException(status_code=404, detail="Ledger entry not found")
    path = f"{site_id}/{ledger_entry_id or 'site'}/{datetime.now(timezone.utc).timestamp()}-{file.filename}"
    db.storage.from_("receipts").upload(path, content, {"content-type": file.content_type or "application/octet-stream"})
    attachment = db.table("attachments").insert({"site_id": site_id, "ledger_entry_id": ledger_entry_id, "uploaded_by": user.id, "file_name": file.filename, "storage_path": path, "mime_type": file.content_type, "file_size": len(content)}).execute().data[0]
    signed = db.storage.from_("receipts").create_signed_url(path, 3600)
    record_audit(db, site_id=site_id, actor_id=user.id, action="receipt_uploaded", entity_type="attachment", entity_id=attachment["id"], description=f"Uploaded {file.filename}")
    return {**attachment, "signed_url": signed.get("signedURL") or signed.get("signedUrl")}


@audit_router.get("/audit-logs")
def workspace_audit_logs(user: Builder, page: int = Query(default=1, ge=1), page_size: int = Query(default=50, ge=1, le=100)):
    """Audit history across every site the builder owns (same scope as RLS)."""
    db = get_admin_client()
    owned = db.table("sites").select("id").eq("owner_id", user.id).execute().data or []
    site_ids = [site["id"] for site in owned if site.get("id")]
    if not site_ids:
        return {"items": [], "page": page, "page_size": page_size, "total": 0}
    start = (page - 1) * page_size
    query = db.table("audit_logs").select("*, sites(name), profiles(full_name,email)", count="exact").in_("site_id", site_ids).order("created_at", desc=True)
    response = query.range(start, start + page_size - 1).execute()
    return {"items": response.data or [], "page": page, "page_size": page_size, "total": response.count or 0}


@audit_router.get("/sites/{site_id}/audit-logs")
def list_audit_logs(site_id: str, user: Builder, page: int = Query(default=1, ge=1), page_size: int = Query(default=50, ge=1, le=100)):
    ensure_site_access(site_id, user, builder_only=True)
    start = (page - 1) * page_size
    response = get_admin_client().table("audit_logs").select("*, profiles(full_name,email)", count="exact").eq("site_id", site_id).order("created_at", desc=True).range(start, start + page_size - 1).execute()
    return {"items": response.data or [], "page": page, "page_size": page_size, "total": response.count or 0}


router.include_router(audit_router)
router.include_router(notes_router)
router.include_router(categories_router)
