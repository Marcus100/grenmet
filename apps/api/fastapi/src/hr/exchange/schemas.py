import uuid
from datetime import date, datetime

from src.hr.models import RequestStatus
from src.models import BaseModel

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
    counterpart_agreed_at: datetime | None = None
    status: RequestStatus
    workflow_instance_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime
