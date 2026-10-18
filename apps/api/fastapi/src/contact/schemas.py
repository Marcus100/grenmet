from pydantic import EmailStr, Field

from src.models import BaseModel

from .models import ContactSite


class ContactMessageCreate(BaseModel):
    site: ContactSite
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr = Field(max_length=254)
    subject: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=10, max_length=4000)
    # Cloudflare Turnstile response token. Accepted but not verified yet; see
    # contact.service.verify_turnstile.
    turnstile_token: str | None = Field(default=None, max_length=2048)


class ContactMessageAccepted(BaseModel):
    ok: bool
