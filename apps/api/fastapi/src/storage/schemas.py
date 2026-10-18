import uuid
from typing import Literal

from pydantic import Field

from src.models import BaseModel, UtcDateTime


class UploadRequest(BaseModel):
    app: str = Field(min_length=1, max_length=60, description="App key, e.g. events.")
    purpose: str = Field(
        min_length=1, max_length=60, description="e.g. organiser-logo, listing-image."
    )
    content_type: str = Field(min_length=1, max_length=60)
    size_bytes: int = Field(gt=0, description="Exact size of the file in bytes.")


class UploadTicket(BaseModel):
    """A short-lived presigned PUT. Send the file bytes with exactly these headers."""

    id: uuid.UUID
    method: Literal["PUT"] = "PUT"
    url: str
    headers: dict[str, str]
    expires_at: UtcDateTime
    max_bytes: int


class StoredFile(BaseModel):
    id: uuid.UUID
    organisation_id: str
    app: str
    purpose: str
    content_type: str
    size_bytes: int
    status: Literal["pending", "complete"]
    #: Cached, unauthenticated path for public purposes; null for private files.
    public_path: str | None = None
    created_at: UtcDateTime
    completed_at: UtcDateTime | None = None


class FileAccess(BaseModel):
    """A short-lived presigned GET for a private read."""

    url: str
    expires_in: int
