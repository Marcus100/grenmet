import uuid
from datetime import date, datetime
from enum import Enum

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from src.hr.models import RequestStatus
from src.orm import Base
from src.utils.datetime import utc_now


class SwapType(str, Enum):
    TEMPORARY = "TEMPORARY"
    PERMANENT = "PERMANENT"


class ShiftSwapRequest(Base):
    __tablename__ = "shift_swap_request"
    __table_args__ = {"schema": "hr"}

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    requesting_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id"), index=True
    )
    counterpart_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id"), index=True
    )
    department_id: Mapped[str] = mapped_column(
        ForeignKey("hr.department.id"), index=True
    )
    swap_type: Mapped[SwapType] = mapped_column(default=SwapType.TEMPORARY)
    source_date: Mapped[date]
    source_shift_code: Mapped[str] = mapped_column(String(10))
    target_date: Mapped[date]
    target_shift_code: Mapped[str] = mapped_column(String(10))
    effective_date: Mapped[date | None]
    restoration_date: Mapped[date | None]
    reason: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    counterpart_agreed: Mapped[bool] = mapped_column(default=False)
    counterpart_agreed_at: Mapped[datetime | None]
    status: Mapped[RequestStatus] = mapped_column(default=RequestStatus.SUBMITTED)
    workflow_instance_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("hr.workflow_instance.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)
