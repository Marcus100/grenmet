"""Request/response shapes for app-scoped sign-in (src/auth/apps.py)."""

from typing import Literal

from pydantic import EmailStr, Field

from src.models import BaseModel

PHONE_PATTERN = r"^\+[1-9]\d{7,14}$"
CODE_PATTERN = r"^\d{6}$"


class AppPublic(BaseModel):
    key: str
    label: str
    self_signup: bool
    methods: list[str]


class AppEmailCodeStart(BaseModel):
    email: EmailStr
    #: Used only when this creates a new account.
    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)


class AppEmailCodeVerify(BaseModel):
    email: EmailStr
    code: str = Field(pattern=CODE_PATTERN)
    totp_code: str | None = Field(default=None, max_length=64)


class AppPasswordLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    totp_code: str | None = Field(default=None, max_length=64)


class AppPhoneCodeStart(BaseModel):
    phone: str = Field(pattern=PHONE_PATTERN, description="E.164, e.g. +14734401234")
    channel: Literal["sms", "whatsapp"] = "sms"


class AppPhoneCodeVerify(BaseModel):
    phone: str = Field(pattern=PHONE_PATTERN)
    code: str = Field(pattern=CODE_PATTERN)


class AppHandoffStart(BaseModel):
    #: The auth.barrels.gd account session secret (never an app session).
    session_token: str = Field(min_length=1, max_length=500)
    #: Random value the app stored in its own cookie; redeem must present it.
    state: str = Field(min_length=16, max_length=200)
    #: Grant a self-sign-up app's default role ("Join <app>").
    join: bool = False


class AppHandoffCode(BaseModel):
    code: str
    #: The app's registered callback; auth redirects the browser here.
    callback_url: str


class AppHandoffRedeem(BaseModel):
    code: str = Field(min_length=16, max_length=200)
    state: str = Field(min_length=16, max_length=200)
    #: The app's own secret, so only its web server can redeem codes.
    client_secret: str = Field(min_length=1, max_length=200)
