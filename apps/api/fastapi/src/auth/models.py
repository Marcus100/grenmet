from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel as PydanticBaseModel
from pydantic import EmailStr
from sqlalchemy import JSON, ForeignKey, ForeignKeyConstraint, String
from sqlalchemy.dialects.postgresql import ENUM
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.orm import Base
from src.utils.datetime import utc_now


class RoleAssignmentScope(str, Enum):
    SELF = "SELF"
    DEPARTMENT = "DEPARTMENT"
    ALL = "ALL"


class Title(str, Enum):
    """Honorific prefix for a person's name (used on official bylines)."""

    MR = "MR"
    MRS = "MRS"
    MS = "MS"
    MISS = "MISS"
    DR = "DR"


# Shared properties
class UserBase(PydanticBaseModel):
    email: EmailStr
    username: str
    title: Title | None = None
    first_name: str
    middle_name: str | None = None
    last_name: str
    is_active: bool = True
    is_superuser: bool = False


# Database model, database table inferred from class name
class User(Base):
    """Canonical source for identity and name; other modules (e.g. HR) extend by user_id."""

    __tablename__ = "user"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    username: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    title: Mapped[Title | None] = mapped_column(
        ENUM(Title, name="title", create_type=False), nullable=True
    )
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    middle_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True)
    is_superuser: Mapped[bool] = mapped_column(default=False)
    hashed_password: Mapped[str]
    email_verified_at: Mapped[datetime | None]
    email_verification_required: Mapped[bool] = mapped_column(default=False)
    password_setup_pending: Mapped[bool] = mapped_column(default=False)
    registration_pending: Mapped[bool] = mapped_column(default=False)
    mfa_recovery_hashes: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list
    )
    # Two-factor auth (TOTP). Secret is plaintext for v1 — encrypt at rest in a follow-up.
    totp_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(default=False)
    last_login_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)

    # Relationships
    user_image: Mapped[UserImage | None] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    roles: Mapped[list[Role]] = relationship(
        back_populates="users", secondary="user_role"
    )
    sessions: Mapped[list[Session]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    @property
    def full_name(self) -> str:
        """Compute full name from first_name and last_name."""
        if self.first_name and self.last_name:
            return f"{self.first_name} {self.last_name}"
        elif self.first_name:
            return self.first_name
        elif self.last_name:
            return self.last_name
        else:
            return ""


# User Image model
class UserImageBase(PydanticBaseModel):
    alt_text: str | None = None
    object_key: str


class UserImage(Base):
    __tablename__ = "user_image"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    alt_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    object_key: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), unique=True)
    user: Mapped[User] = relationship(back_populates="user_image")


# Role model
class RoleBase(PydanticBaseModel):
    name: str
    description: str = ""


class Role(Base):
    __tablename__ = "role"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)

    users: Mapped[list[User]] = relationship(
        back_populates="roles", secondary="user_role"
    )
    permissions: Mapped[list[Permission]] = relationship(
        back_populates="roles", secondary="role_permission"
    )


# Permission model
class PermissionBase(PydanticBaseModel):
    key: str
    action: str
    entity: str
    access: str
    description: str = ""


class Permission(Base):
    __tablename__ = "permission"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    action: Mapped[str] = mapped_column(String(50))
    entity: Mapped[str] = mapped_column(String(50))
    access: Mapped[str] = mapped_column(String(50))
    description: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)

    roles: Mapped[list[Role]] = relationship(
        back_populates="permissions", secondary="role_permission"
    )


# Session model for user sessions
class SessionBase(PydanticBaseModel):
    # Stores the SHA-256 hash of the opaque session secret; raw tokens are never persisted.
    session_token: str
    expires_at: datetime
    client_type: str = "web"
    app_name: str | None = None
    user_agent: str | None = None
    ip_address: str | None = None
    last_used_at: datetime = utc_now()
    revoked_at: datetime | None = None


class Session(Base):
    __tablename__ = "session"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_token: Mapped[str] = mapped_column(String(500), unique=True)
    expires_at: Mapped[datetime]
    client_type: Mapped[str] = mapped_column(String(50), default="web")
    app_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_used_at: Mapped[datetime] = mapped_column(default=utc_now)
    revoked_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    user: Mapped[User] = relationship(back_populates="sessions")


# Link tables for many-to-many relationships
class UserRoleLink(Base):
    __tablename__ = "user_role"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), primary_key=True)
    role_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("role.id"), primary_key=True)


class RolePermissionLink(Base):
    __tablename__ = "role_permission"

    role_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("role.id"), primary_key=True)
    permission_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("permission.id"), primary_key=True
    )


class UserRoleAssignment(Base):
    __tablename__ = "user_role_assignment"
    __table_args__ = (
        ForeignKeyConstraint(
            ["department_id", "organisation_id"],
            ["hr.department.id", "hr.department.organisation_id"],
            name="fk_role_assignment_department_org",
        ),
    )

    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("hr.organisation.id"), index=True
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), index=True)
    role_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("role.id"), index=True)
    scope: Mapped[RoleAssignmentScope] = mapped_column(
        ENUM(RoleAssignmentScope, name="roleassignmentscope", create_type=False),
        default=RoleAssignmentScope.SELF,
    )
    department_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    effective_from: Mapped[datetime] = mapped_column(default=utc_now)
    effective_to: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)
