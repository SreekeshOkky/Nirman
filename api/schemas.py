from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SiteCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    location: str | None = None
    client_name: str | None = None
    budget: Decimal | None = Field(default=None, ge=0)
    start_date: date | None = None
    expected_end_date: date | None = None


class SiteUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    location: str | None = None
    client_name: str | None = None
    budget: Decimal | None = Field(default=None, ge=0)
    start_date: date | None = None
    expected_end_date: date | None = None
    status: Literal["planning", "active", "on_hold", "completed", "archived"] | None = None


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    type: Literal["income", "expense", "both"] = "expense"


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    type: Literal["income", "expense", "both"] | None = None


class InvitationCreate(BaseModel):
    email: str = Field(min_length=3, max_length=320)


class AttachmentResponse(BaseModel):
    id: UUID
    file_name: str
    storage_path: str
    signed_url: str


class LedgerCreate(BaseModel):
    entry_type: Literal["income", "expense"]
    category_id: UUID
    amount: Decimal = Field(gt=0)
    entry_date: date
    description: str = Field(default="", max_length=500)
    payment_method: str | None = Field(default=None, max_length=40)
    reference: str | None = Field(default=None, max_length=120)
    note: str | None = Field(default=None, max_length=2000)


class LedgerUpdate(BaseModel):
    entry_type: Literal["income", "expense"] | None = None
    category_id: UUID | None = None
    amount: Decimal | None = Field(default=None, gt=0)
    entry_date: date | None = None
    description: str | None = Field(default=None, max_length=500)
    payment_method: str | None = Field(default=None, max_length=40)
    reference: str | None = Field(default=None, max_length=120)


class NoteCreate(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class NoteUpdate(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    site_id: UUID
    actor_id: UUID
    action: str
    entity_type: str
    entity_id: UUID | None
    description: str
    metadata: dict[str, Any]
    created_at: str
