import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class AuthChallenge(SQLModel, table=True):
    """Hashed, purpose-bound, expiring one-use tokens."""

    __tablename__ = "auth_challenge"
    token_hash: str = Field(primary_key=True, max_length=64)
    purpose: str = Field(max_length=30)
    user_id: uuid.UUID | None = Field(default=None, foreign_key="user.id")
    expires_at: datetime
    data: dict[str, Any] = Field(
        default_factory=dict[str, Any], sa_column=Column(JSON, nullable=False)
    )


class ExternalIdentity(SQLModel, table=True):
    __tablename__ = "external_identity"
    subject: str = Field(primary_key=True, max_length=255)
    provider: str = Field(primary_key=True, max_length=30)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
