from pydantic import Field

from src.models import BaseModel


class PageFeedbackCreate(BaseModel):
    # Which website sent it, e.g. "docs". A short slug, not a URL.
    site: str = Field(pattern=r"^[a-z][a-z0-9-]{1,39}$")
    # Path on that site, starting with "/". No query string or fragment.
    page_path: str = Field(pattern=r"^/[^?#\s]{0,298}$", max_length=300)
    helpful: bool
    comment: str | None = Field(default=None, max_length=1000)
    # Cloudflare Turnstile token; required when TURNSTILE_ENABLED.
    turnstile_token: str | None = Field(default=None, max_length=2048)


class PageFeedbackAccepted(BaseModel):
    ok: bool
