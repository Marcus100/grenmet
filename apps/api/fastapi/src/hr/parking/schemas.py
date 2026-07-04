import uuid
from datetime import date
from decimal import Decimal

from src.hr.models import RequestStatus
from src.hr.parking.models import ParkingAction
from src.models import BaseModel, UtcDateTime


class ParkingPermitCreate(BaseModel):
    user_id: uuid.UUID
    department_id: str
    company_name: str | None = None
    phone: str | None = None
    vehicle_registration_no: str
    vehicle_insurance_issue_date: date | None = None
    vehicle_insurance_expiry_date: date | None = None
    action_requested: ParkingAction = ParkingAction.NEW_PERMIT
    action_other_detail: str | None = None
    fee_amount: Decimal = Decimal("40.00")


class ParkingPermitIssue(BaseModel):
    decal_number: str
    valid_from: date
    valid_to: date
    received_by: str | None = None


class ParkingPermitPublic(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    department_id: str
    submitted_by_user_id: uuid.UUID
    company_name: str | None = None
    phone: str | None = None
    vehicle_registration_no: str
    vehicle_insurance_issue_date: date | None = None
    vehicle_insurance_expiry_date: date | None = None
    action_requested: ParkingAction
    action_other_detail: str | None = None
    fee_amount: Decimal
    decal_number: str | None = None
    valid_from: date | None = None
    valid_to: date | None = None
    issued_by_user_id: uuid.UUID | None = None
    received_by: str | None = None
    issued_at: UtcDateTime | None = None
    status: RequestStatus
    workflow_instance_id: uuid.UUID | None = None
    created_at: UtcDateTime
    updated_at: UtcDateTime


class ParkingPermitListPublic(BaseModel):
    data: list[ParkingPermitPublic]
    count: int
