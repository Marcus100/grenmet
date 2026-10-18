from pydantic import Field

from src.models import BaseModel


class PageFeedbackCreate(BaseModel):
    # Which website sent it, e.g. "docs". A short slug, not a URL.
    site: str = Field(pattern=r"^[a-z][a-z0-9-]{1,39}$")
    # Path on that site, starting with "/". No query string or fragment.
    page_path: str = Field(pattern=r"^/[^?#\s]{0,298}$", max_length=300)
    helpful: bool
    comment: str | None = Field(default=None, max_length=1000)


class PageFeedbackAccepted(BaseModel):
    ok: bool
