import uuid
from datetime import date, datetime
from enum import Enum

from sqlmodel import Field, SQLModel

from src.hr.models import RequestStatus
from src.utils.datetime import utc_now


class SwapType(str, Enum):
    TEMPORARY = "TEMPORARY"
    PERMANENT = "PERMANENT"


class ShiftSwapRequest(SQLModel, table=True):
    __tablename__ = "shift_swap_request"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    requesting_user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    counterpart_user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    department_id: str = Field(foreign_key="hr.department.id", index=True)
    swap_type: SwapType = Field(default=SwapType.TEMPORARY)
    source_date: date
    source_shift_code: str = Field(max_length=10)
    target_date: date
    target_shift_code: str = Field(max_length=10)
    effective_date: date | None = Field(default=None)
    restoration_date: date | None = Field(default=None)
    reason: str | None = Field(default=None, max_length=1000)
    counterpart_agreed: bool = Field(default=False)
    counterpart_agreed_at: datetime | None = Field(default=None)
    status: RequestStatus = Field(default=RequestStatus.SUBMITTED)
    workflow_instance_id: uuid.UUID | None = Field(
        default=None, foreign_key="hr.workflow_instance.id"
    )
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
