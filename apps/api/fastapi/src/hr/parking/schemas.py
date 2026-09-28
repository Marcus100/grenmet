import uuid
from datetime import date
from decimal import Decimal
from typing import Self

from pydantic import Field, field_validator, model_validator

from src.hr.models import RequestStatus
from src.hr.parking.models import ParkingAction
from src.hr.signatures.schemas import SignatureConsent
from src.hr.submission import SubmittedFormPublic
from src.models import BaseModel, UtcDateTime


class ParkingPermitCreate(SignatureConsent):
    user_id: uuid.UUID
    department_id: str = Field(min_length=1, max_length=100)
    company_name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=30)
    vehicle_registration_no: str = Field(min_length=1, max_length=50)
    vehicle_insurance_issue_date: date | None = None
    vehicle_insurance_expiry_date: date | None = None
    action_requested: ParkingAction = ParkingAction.NEW_PERMIT
    action_other_detail: str | None = Field(default=None, max_length=255)
    fee_amount: Decimal = Field(
        default=Decimal("40.00"), ge=0, max_digits=8, decimal_places=2
    )
    as_draft: bool = False
    co_approver_user_ids: list[uuid.UUID] = Field(default_factory=list)

    @field_validator("vehicle_registration_no")
    @classmethod
    def registration(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Vehicle registration cannot be blank")
        return value

    @model_validator(mode="after")
    def dates_and_other(self) -> Self:
        if (
            self.vehicle_insurance_issue_date
            and self.vehicle_insurance_expiry_date
            and self.vehicle_insurance_expiry_date < self.vehicle_insurance_issue_date
        ):
            raise ValueError("Insurance expiry cannot precede its issue date")
        if (
            not self.as_draft
            and self.action_requested == ParkingAction.OTHER
            and not (self.action_other_detail and self.action_other_detail.strip())
        ):
            raise ValueError("Explain the other action requested")
        return self


class ParkingPermitSubmit(SignatureConsent):
    co_approver_user_ids: list[uuid.UUID] = Field(default_factory=list)


class ParkingPermitIssue(BaseModel):
    decal_number: str = Field(min_length=1, max_length=50)
    valid_from: date
    valid_to: date
    received_by: str | None = Field(default=None, max_length=255)

    @field_validator("decal_number")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Decal number cannot be blank")
        return value.strip()

    @model_validator(mode="after")
    def dates(self) -> Self:
        if self.valid_to < self.valid_from:
            raise ValueError("Permit expiry cannot precede its start date")
        return self


class ParkingPermitPublic(SubmittedFormPublic):
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
    page: int = 1
    size: int = 100
