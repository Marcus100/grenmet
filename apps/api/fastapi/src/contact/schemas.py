from datetime import date
from enum import Enum

from pydantic import EmailStr, Field, model_validator

from src.models import BaseModel

from .models import ContactSite


class ContactMessageCreate(BaseModel):
    # The website the message came from; selects its inbox. Defaults to MBIA so
    # existing MBIA callers are unchanged.
    site: ContactSite = ContactSite.MBIA
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr = Field(max_length=254)
    subject: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=10, max_length=4000)
    # Cloudflare Turnstile response token. Accepted but not verified yet; see
    # contact.service.verify_turnstile.
    turnstile_token: str | None = Field(default=None, max_length=2048)


class ContactMessageAccepted(BaseModel):
    ok: bool


class DataParameter(str, Enum):
    RAINFALL = "rainfall"
    TEMPERATURE = "temperature"
    WIND = "wind"
    HUMIDITY = "humidity"
    PRESSURE = "pressure"
    OTHER = "other"


class DataFormat(str, Enum):
    CSV = "csv"
    EXCEL = "excel"
    PDF = "pdf"


class IntendedUse(str, Enum):
    STUDENT = "student"
    ACADEMIC = "academic"
    COMMERCIAL = "commercial"
    GOVERNMENT = "government"
    OTHER = "other"


class DataRequestCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr = Field(max_length=254)
    organisation: str = Field(min_length=1, max_length=200)
    purpose: str = Field(min_length=10, max_length=2000)
    parameters: list[DataParameter] = Field(min_length=1, max_length=len(DataParameter))
    stations: str = Field(min_length=2, max_length=500)
    period_start: date
    period_end: date
    data_format: DataFormat
    intended_use: IntendedUse
    # Must be true: the requester agrees to the conditions of use and to being
    # contacted about this request.
    consent: bool
    # Honeypot. Hidden from people; a bot that fills it is silently dropped.
    website: str | None = Field(default=None, max_length=200)
    turnstile_token: str | None = Field(default=None, max_length=2048)

    @model_validator(mode="after")
    def _check(self) -> DataRequestCreate:
        if not self.consent:
            raise ValueError("Consent is required")
        if self.period_end < self.period_start:
            raise ValueError("period_end must not be before period_start")
        return self
