from typing import Annotated

from pydantic import EmailStr, Field, StringConstraints

from src.models import BaseModel


class SubscribeRequest(BaseModel):
    list_key: Annotated[
        str,
        StringConstraints(min_length=1, max_length=40, pattern=r"^[a-z0-9-]+$"),
    ] = Field(description="Mailing list key, e.g. 'signal'.")
    email: EmailStr = Field(max_length=254)
    # Cloudflare Turnstile token; required when TURNSTILE_ENABLED.
    turnstile_token: str | None = Field(default=None, max_length=2048)


class SiteSubscribeRequest(BaseModel):
    """Subscribe to the list of the public site named in the path."""

    email: EmailStr = Field(max_length=254)
    turnstile_token: str | None = Field(default=None, max_length=2048)


class SubscribeAccepted(BaseModel):
    message: str


class NewsletterTestRequest(BaseModel):
    """Staff test send: one address that has confirmed the newsletter."""

    email: EmailStr = Field(max_length=254)


class NewsletterTestAccepted(BaseModel):
    message: str
    queued: bool


class SubscribedList(BaseModel):
    """A mailing list the address behind the link is confirmed on."""

    list_key: str
    list_name: str


class SubscriptionPreferences(BaseModel):
    lists: list[SubscribedList]


class PreferencesUnsubscribeRequest(BaseModel):
    """The signed token from a mail, and the one list to stop."""

    token: str = Field(max_length=2048)
    list_key: Annotated[
        str,
        StringConstraints(min_length=1, max_length=40, pattern=r"^[a-z0-9-]+$"),
    ]
