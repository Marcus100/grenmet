import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from sqlmodel import Field, SQLModel

from src.hr.models import RequestStatus
from src.utils.datetime import utc_now


class ParkingAction(str, Enum):
    NEW_PERMIT = "NEW_PERMIT"
    ANNUAL_RENEWAL = "ANNUAL_RENEWAL"
    REPLACEMENT_LOST_STOLEN = "REPLACEMENT_LOST_STOLEN"
    INFORMATION_CHANGE = "INFORMATION_CHANGE"
    OTHER = "OTHER"


class ParkingPermit(SQLModel, table=True):
    """Airport Security Parking Access application / vehicle decal permit."""

    __tablename__ = "parking_permit"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    department_id: str = Field(foreign_key="hr.department.id", index=True)
    submitted_by_user_id: uuid.UUID = Field(foreign_key="user.id")
    company_name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=30)
    vehicle_registration_no: str = Field(max_length=50)
    vehicle_insurance_issue_date: date | None = Field(default=None)
    vehicle_insurance_expiry_date: date | None = Field(default=None)
    action_requested: ParkingAction = Field(default=ParkingAction.NEW_PERMIT)
    action_other_detail: str | None = Field(default=None, max_length=255)
    fee_amount: Decimal = Field(
        default=Decimal("40.00"), decimal_places=2, max_digits=8
    )
    # Decal issuance lifecycle (populated when a decal is issued).
    decal_number: str | None = Field(default=None, max_length=50)
    valid_from: date | None = Field(default=None)
    valid_to: date | None = Field(default=None)
    issued_by_user_id: uuid.UUID | None = Field(
        default=None, foreign_key="user.id", ondelete="SET NULL"
    )
    received_by: str | None = Field(default=None, max_length=255)
    issued_at: datetime | None = Field(default=None)
    status: RequestStatus = Field(default=RequestStatus.SUBMITTED)
    workflow_instance_id: uuid.UUID | None = Field(
        default=None, foreign_key="hr.workflow_instance.id"
    )
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
