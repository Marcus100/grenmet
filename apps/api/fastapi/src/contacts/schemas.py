import uuid

from pydantic import EmailStr, Field

from src.models import BaseModel, UtcDateTime

from .models import ConsentPurpose


class ContactConsentPublic(BaseModel):
    purpose: ConsentPurpose
    granted: bool
    source: str
    granted_at: UtcDateTime | None
    revoked_at: UtcDateTime | None
    recorded_at: UtcDateTime


class ContactConsentSet(BaseModel):
    purpose: ConsentPurpose
    granted: bool
    source: str = Field(default="manual", min_length=1, max_length=40)


class ContactConsentHistoryPublic(BaseModel):
    """Current decision per purpose, then every decision oldest first."""

    current: list[ContactConsentPublic]
    history: list[ContactConsentPublic]


class ContactCreate(BaseModel):
    email: EmailStr
    name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=40)


class ContactUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=40)


class ContactMerge(BaseModel):
    drop_contact_id: str = Field(min_length=1, max_length=100)


class ContactPublic(BaseModel):
    id: str
    organisation_id: str
    email: str | None
    name: str | None
    phone: str | None
    user_id: uuid.UUID | None
    source: str
    erased_at: UtcDateTime | None
    created_at: UtcDateTime
    updated_at: UtcDateTime


class ContactDetailPublic(ContactPublic):
    consents: list[ContactConsentPublic]


class ContactListPublic(BaseModel):
    data: list[ContactPublic]
    count: int
    page: int
    size: int
    total_pages: int
