import uuid
from datetime import datetime

from pydantic import EmailStr, Field

from src.models import BaseModel

from .models import UserBase


# Properties to receive via API on creation
class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=40)


# Properties for user registration (public signup)
class UserRegister(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=40)
    first_name: str = Field(min_length=1, max_length=100)
    middle_name: str | None = None
    last_name: str = Field(min_length=1, max_length=100)


# Properties to receive via API on update, all are optional
class UserUpdate(BaseModel):
    email: EmailStr | None = None
    username: str | None = Field(default=None, min_length=3, max_length=255)
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    password: str | None = None
    is_active: bool | None = None
    is_superuser: bool | None = None


class UserUpdateMe(BaseModel):
    email: EmailStr | None = None
    username: str | None = Field(default=None, min_length=3, max_length=255)
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)


class UpdatePassword(BaseModel):
    current_password: str
    new_password: str


# Properties to return via API, id is always required
class UserPublic(UserBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    full_name: str  # Computed field from first_name and last_name


class UsersPublic(BaseModel):
    data: list[UserPublic]
    count: int


# User Image schemas
class UserImageBase(BaseModel):
    alt_text: str | None = None
    object_key: str


class UserImageCreate(UserImageBase):
    pass


class UserImageUpdate(BaseModel):
    alt_text: str | None = None
    object_key: str | None = None


class UserImagePublic(UserImageBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    user_id: uuid.UUID


# Role schemas
class RoleBase(BaseModel):
    name: str
    description: str = ""


class RoleCreate(RoleBase):
    pass


class RoleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class RolePublic(RoleBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class RolesPublic(BaseModel):
    data: list[RolePublic]
    count: int


# Permission schemas
class PermissionBase(BaseModel):
    action: str
    entity: str
    access: str
    description: str = ""


class PermissionCreate(PermissionBase):
    pass


class PermissionUpdate(BaseModel):
    action: str | None = None
    entity: str | None = None
    access: str | None = None
    description: str | None = None


class PermissionPublic(PermissionBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class PermissionsPublic(BaseModel):
    data: list[PermissionPublic]
    count: int


# Session schemas
class SessionBase(BaseModel):
    session_token: str
    expires_at: datetime


class SessionCreate(SessionBase):
    user_id: uuid.UUID


class SessionPublic(SessionBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    user_id: uuid.UUID


class NewPassword(BaseModel):
    token: str
    new_password: str
