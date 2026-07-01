import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import EmailStr
from sqlmodel import Field, Relationship, SQLModel

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
class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    username: str = Field(unique=True, index=True, max_length=255)
    title: Title | None = Field(default=None)
    first_name: str = Field(max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    last_name: str = Field(max_length=100)
    is_active: bool = True
    is_superuser: bool = False


# Database model, database table inferred from class name
class User(UserBase, table=True):
    """Canonical source for identity and name; other modules (e.g. HR) extend by user_id."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
    # Two-factor auth (TOTP). Secret is plaintext for v1 — encrypt at rest in a follow-up.
    totp_secret: str | None = Field(default=None, max_length=64)
    totp_enabled: bool = Field(default=False)
    last_login_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    # Relationships
    user_image: Optional["UserImage"] = Relationship(
        back_populates="user", cascade_delete=True
    )
    roles: list["Role"] = Relationship(
        back_populates="users", sa_relationship_kwargs={"secondary": "user_role"}
    )
    sessions: list["Session"] = Relationship(back_populates="user", cascade_delete=True)

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
class UserImageBase(SQLModel):
    alt_text: str | None = Field(default=None, max_length=255)
    object_key: str = Field(max_length=500)


class UserImage(UserImageBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    user_id: uuid.UUID = Field(foreign_key="user.id", unique=True)
    user: "User" = Relationship(back_populates="user_image")


# Role model
class RoleBase(SQLModel):
    name: str = Field(unique=True, max_length=100)
    description: str = Field(default="", max_length=500)


class Role(RoleBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    users: list["User"] = Relationship(
        back_populates="roles", sa_relationship_kwargs={"secondary": "user_role"}
    )
    permissions: list["Permission"] = Relationship(
        back_populates="roles", sa_relationship_kwargs={"secondary": "role_permission"}
    )


# Permission model
class PermissionBase(SQLModel):
    key: str = Field(unique=True, index=True, max_length=120)
    action: str = Field(max_length=50)  # e.g. create, read, update, delete
    entity: str = Field(max_length=50)  # e.g. item, user, etc.
    access: str = Field(max_length=50)  # e.g. own or any
    description: str = Field(default="", max_length=500)


class Permission(PermissionBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    roles: list["Role"] = Relationship(
        back_populates="permissions",
        sa_relationship_kwargs={"secondary": "role_permission"},
    )


# Session model for user sessions
class SessionBase(SQLModel):
    # Stores the SHA-256 hash of the opaque session secret; raw tokens are never persisted.
    session_token: str = Field(unique=True, max_length=500)
    expires_at: datetime
    client_type: str = Field(default="web", max_length=50)
    app_name: str | None = Field(default=None, max_length=100)
    user_agent: str | None = Field(default=None, max_length=500)
    ip_address: str | None = Field(default=None, max_length=64)
    last_used_at: datetime = Field(default_factory=utc_now)
    revoked_at: datetime | None = None


class Session(SessionBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    user_id: uuid.UUID = Field(foreign_key="user.id")
    user: "User" = Relationship(back_populates="sessions")


# Link tables for many-to-many relationships
class UserRoleLink(SQLModel, table=True):
    __tablename__ = "user_role"

    user_id: uuid.UUID = Field(foreign_key="user.id", primary_key=True)
    role_id: uuid.UUID = Field(foreign_key="role.id", primary_key=True)


class RolePermissionLink(SQLModel, table=True):
    __tablename__ = "role_permission"

    role_id: uuid.UUID = Field(foreign_key="role.id", primary_key=True)
    permission_id: uuid.UUID = Field(foreign_key="permission.id", primary_key=True)


class UserRoleAssignment(SQLModel, table=True):
    __tablename__ = "user_role_assignment"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    role_id: uuid.UUID = Field(foreign_key="role.id", index=True)
    scope: RoleAssignmentScope = Field(default=RoleAssignmentScope.SELF)
    department_id: str | None = Field(default=None, max_length=100)
    effective_from: datetime = Field(default_factory=utc_now)
    effective_to: datetime | None = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
