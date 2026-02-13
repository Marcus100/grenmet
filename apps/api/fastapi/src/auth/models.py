import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from pydantic import EmailStr
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from src.items.models import Item


# Shared properties
class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    username: str = Field(unique=True, index=True, max_length=255)
    first_name: str = Field(max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    last_name: str = Field(max_length=100)
    is_active: bool = True
    is_superuser: bool = False


# Database model, database table inferred from class name
class User(UserBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    items: list["Item"] = Relationship(back_populates="owner", cascade_delete=True)
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
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    user_id: uuid.UUID = Field(foreign_key="user.id", unique=True)
    user: "User" = Relationship(back_populates="user_image")


# Role model
class RoleBase(SQLModel):
    name: str = Field(unique=True, max_length=100)
    description: str = Field(default="", max_length=500)


class Role(RoleBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    users: list["User"] = Relationship(
        back_populates="roles", sa_relationship_kwargs={"secondary": "user_role"}
    )
    permissions: list["Permission"] = Relationship(
        back_populates="roles", sa_relationship_kwargs={"secondary": "role_permission"}
    )


# Permission model
class PermissionBase(SQLModel):
    action: str = Field(max_length=50)  # e.g. create, read, update, delete
    entity: str = Field(max_length=50)  # e.g. item, user, etc.
    access: str = Field(max_length=50)  # e.g. own or any
    description: str = Field(default="", max_length=500)


class Permission(PermissionBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    roles: list["Role"] = Relationship(
        back_populates="permissions",
        sa_relationship_kwargs={"secondary": "role_permission"},
    )

    class Config:
        # Unique constraint on action, entity, access combination
        table_args = ({"sqlite_autoincrement": True},)


# Session model for user sessions
class SessionBase(SQLModel):
    session_token: str = Field(unique=True, max_length=500)
    expires_at: datetime


class Session(SessionBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

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
