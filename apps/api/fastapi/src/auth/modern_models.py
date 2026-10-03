import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base


class AuthChallenge(Base):
    """Hashed, purpose-bound, expiring one-use tokens."""

    __tablename__ = "auth_challenge"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    purpose: Mapped[str] = mapped_column(String(30), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id"), nullable=True
    )
    expires_at: Mapped[datetime]
    data: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)


class ExternalIdentity(Base):
    __tablename__ = "external_identity"
    subject: Mapped[str] = mapped_column(String(255), primary_key=True)
    provider: Mapped[str] = mapped_column(String(30), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), index=True)
