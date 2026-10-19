import uuid
from datetime import date

from pydantic import Field, field_validator

from src.models import BaseModel, UtcDateTime

from .models import MovementKind, RequisitionStatus


def _clean(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("Must not be blank")
    return cleaned


# --- Catalogue and locations ---------------------------------------------------


class ItemCreate(BaseModel):
    sku: str = Field(max_length=60)
    name: str = Field(max_length=200)
    category: str = Field(max_length=100)
    unit: str = Field(max_length=30)

    _strip = field_validator("sku", "name", "category", "unit")(_clean)


class ItemUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    category: str | None = Field(default=None, max_length=100)
    unit: str | None = Field(default=None, max_length=30)
    is_active: bool | None = None

    @field_validator("name", "category", "unit")
    @classmethod
    def _strip(cls, value: str | None) -> str | None:
        return None if value is None else _clean(value)


class ItemPublic(BaseModel):
    id: uuid.UUID
    sku: str
    name: str
    category: str
    unit: str
    is_active: bool
    on_hand: int = Field(description="Total on hand across all store locations")


class ItemListPublic(BaseModel):
    data: list[ItemPublic]
    count: int
    page: int
    size: int


class LocationCreate(BaseModel):
    code: str = Field(max_length=40)
    name: str = Field(max_length=150)

    _strip = field_validator("code", "name")(_clean)


class LocationUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=150)
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def _strip(cls, value: str | None) -> str | None:
        return None if value is None else _clean(value)


class LocationPublic(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    is_active: bool


class LocationListPublic(BaseModel):
    data: list[LocationPublic]
    count: int


# --- Stock ---------------------------------------------------------------------


class StockLevelPublic(BaseModel):
    item_id: uuid.UUID
    sku: str
    item_name: str
    category: str
    unit: str
    location_id: uuid.UUID
    location_name: str
    quantity: int


class StockLevelListPublic(BaseModel):
    data: list[StockLevelPublic]
    count: int
    page: int
    size: int


class StockMovementCreate(BaseModel):
    """RECEIPT adds ``quantity``; ISSUE removes it; ADJUSTMENT sets the counted level."""

    item_id: uuid.UUID
    location_id: uuid.UUID
    kind: MovementKind
    quantity: int = Field(ge=0, le=1_000_000)
    reason: str | None = Field(default=None, max_length=500)


class StockMovementPublic(BaseModel):
    id: uuid.UUID
    item_id: uuid.UUID
    sku: str
    item_name: str
    location_id: uuid.UUID
    location_name: str
    kind: MovementKind
    quantity_delta: int
    balance_after: int
    reason: str | None
    requisition_id: uuid.UUID | None
    created_by_user_id: uuid.UUID
    created_at: UtcDateTime


class StockMovementListPublic(BaseModel):
    data: list[StockMovementPublic]
    count: int
    page: int
    size: int


# --- Requisitions --------------------------------------------------------------


class RequisitionLineCreate(BaseModel):
    item_id: uuid.UUID
    quantity: int = Field(gt=0, le=1_000_000)


class RequisitionCreate(BaseModel):
    purpose: str | None = Field(default=None, max_length=500)
    needed_by: date | None = None
    lines: list[RequisitionLineCreate] = Field(min_length=1, max_length=100)
    submit: bool = Field(
        default=False,
        description="Submit for approval immediately instead of saving a draft",
    )


class RequisitionUpdate(BaseModel):
    purpose: str | None = Field(default=None, max_length=500)
    needed_by: date | None = None
    lines: list[RequisitionLineCreate] = Field(min_length=1, max_length=100)


class ApprovalLine(BaseModel):
    line_id: uuid.UUID
    approved_quantity: int = Field(ge=0, le=1_000_000)


class RequisitionApprove(BaseModel):
    lines: list[ApprovalLine] | None = Field(
        default=None,
        description="Per-line approved quantities; omitted lines are approved as requested",
    )
    note: str | None = Field(default=None, max_length=500)


class RequisitionReject(BaseModel):
    note: str = Field(max_length=500)

    _strip = field_validator("note")(_clean)


class DeliveryLine(BaseModel):
    line_id: uuid.UUID
    quantity: int = Field(gt=0, le=1_000_000)


class RequisitionDeliver(BaseModel):
    location_id: uuid.UUID
    lines: list[DeliveryLine] = Field(min_length=1, max_length=100)
    note: str | None = Field(default=None, max_length=500)


class RequisitionLinePublic(BaseModel):
    id: uuid.UUID
    item_id: uuid.UUID
    sku: str
    item_name: str
    category: str
    unit: str
    requested_quantity: int
    approved_quantity: int | None
    delivered_quantity: int


class RequisitionPublic(BaseModel):
    id: uuid.UUID
    number: int
    reference: str
    status: RequisitionStatus
    organisation_id: str
    department_id: str
    department_name: str
    requester_user_id: uuid.UUID
    requester_name: str
    purpose: str | None
    needed_by: date | None
    lines: list[RequisitionLinePublic]
    submitted_at: UtcDateTime | None
    decided_at: UtcDateTime | None
    decided_by_user_id: uuid.UUID | None
    decision_note: str | None
    delivered_at: UtcDateTime | None
    created_at: UtcDateTime
    updated_at: UtcDateTime
    can_edit: bool
    can_cancel: bool
    can_approve: bool
    can_deliver: bool


class RequisitionListPublic(BaseModel):
    data: list[RequisitionPublic]
    count: int
    page: int
    size: int


class StoresAccessPublic(BaseModel):
    """UI hint: the API still enforces every permission."""

    organisation_id: str
    department_id: str
    can_view: bool
    can_request: bool
    can_approve: bool
    can_manage: bool
