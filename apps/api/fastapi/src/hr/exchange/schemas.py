import uuid
from datetime import date

from pydantic import Field

from src.hr.models import RequestStatus
from src.models import BaseModel, UtcDateTime

from .models import SwapType


class ShiftSwapRequestCreate(BaseModel):
    counterpart_user_id: uuid.UUID
    department_id: str
    swap_type: SwapType = SwapType.TEMPORARY
    source_date: date
    source_shift_code: str
    target_date: date
    target_shift_code: str
    effective_date: date | None = None
    restoration_date: date | None = None
    reason: str | None = None
    # Named colleagues who must all approve before the request reaches the
    # supervisor/management tiers. Ignored when as_draft is true.
    co_approver_user_ids: list[uuid.UUID] = Field(default_factory=list)
    # Save without submitting: persist as DRAFT with no approval chain yet.
    as_draft: bool = False


class ShiftSwapSubmit(BaseModel):
    co_approver_user_ids: list[uuid.UUID] = Field(default_factory=list)


class ShiftSwapAction(BaseModel):
    status: RequestStatus
    comments: str | None = None


class ShiftSwapRequestPublic(BaseModel):
    id: uuid.UUID
    requesting_user_id: uuid.UUID
    counterpart_user_id: uuid.UUID
    department_id: str
    swap_type: SwapType
    source_date: date
    source_shift_code: str
    target_date: date
    target_shift_code: str
    effective_date: date | None = None
    restoration_date: date | None = None
    reason: str | None = None
    counterpart_agreed: bool
    counterpart_agreed_at: UtcDateTime | None = None
    status: RequestStatus
    workflow_instance_id: uuid.UUID | None = None
    created_at: UtcDateTime
    updated_at: UtcDateTime


class ShiftSwapRequestsPublic(BaseModel):
    data: list[ShiftSwapRequestPublic]
    count: int
    page: int = 1
    size: int = 100
