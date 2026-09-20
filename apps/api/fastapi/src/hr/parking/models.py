import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from src.hr.models import RequestStatus
from src.orm import Base
from src.utils.datetime import utc_now


class ParkingAction(str, Enum):
    NEW_PERMIT = "NEW_PERMIT"
    ANNUAL_RENEWAL = "ANNUAL_RENEWAL"
    REPLACEMENT_LOST_STOLEN = "REPLACEMENT_LOST_STOLEN"
    INFORMATION_CHANGE = "INFORMATION_CHANGE"
    OTHER = "OTHER"


class ParkingPermit(Base):
    """Airport Security parking access application and vehicle decal permit."""

    __tablename__ = "parking_permit"
    __table_args__ = {"schema": "hr"}

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), index=True)
    department_id: Mapped[str] = mapped_column(
        ForeignKey("hr.department.id"), index=True
    )
    submitted_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    company_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    vehicle_registration_no: Mapped[str] = mapped_column(String(50))
    vehicle_insurance_issue_date: Mapped[date | None]
    vehicle_insurance_expiry_date: Mapped[date | None]
    action_requested: Mapped[ParkingAction] = mapped_column(
        default=ParkingAction.NEW_PERMIT
    )
    action_other_detail: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fee_amount: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=Decimal("40.00"))
    decal_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    valid_from: Mapped[date | None]
    valid_to: Mapped[date | None]
    issued_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    received_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    issued_at: Mapped[datetime | None]
    status: Mapped[RequestStatus] = mapped_column(default=RequestStatus.SUBMITTED)
    workflow_instance_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("hr.workflow_instance.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)
