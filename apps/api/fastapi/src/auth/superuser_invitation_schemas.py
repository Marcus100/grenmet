"""Shapes for superuser invitations (ADR-0059 rule 1). Tokens never leave the server
except inside the emailed link, so no response carries one."""

import uuid
from typing import Annotated

from pydantic import EmailStr, Field, field_validator

from src.models import BaseModel, UtcDateTime
from src.utils.text import clean_reason

REASON_MIN_LENGTH = 10
REASON_MAX_LENGTH = 500


class SuperuserInvitationCreate(BaseModel):
    email: EmailStr
    reason: Annotated[str, Field(min_length=1, max_length=REASON_MAX_LENGTH)]

    @field_validator("reason")
    @classmethod
    def _clean(cls, value: str) -> str:
        # Refuses NUL and strips invisible padding; the length rule runs on the result.
        cleaned = (clean_reason(value) or "").strip()
        if not REASON_MIN_LENGTH <= len(cleaned) <= REASON_MAX_LENGTH:
            raise ValueError(
                f"The reason must be {REASON_MIN_LENGTH} to {REASON_MAX_LENGTH} "
                "characters"
            )
        return cleaned


class SuperuserInvitationPublic(BaseModel):
    id: uuid.UUID
    email: str
    reason: str
    invited_by_user_id: uuid.UUID
    created_at: UtcDateTime
    expires_at: UtcDateTime


class SuperuserInvitationAccept(BaseModel):
    token: str = Field(min_length=32, max_length=256)


class SuperuserInvitationCodeVerify(SuperuserInvitationAccept):
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
