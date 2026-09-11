import uuid

from pydantic import Field

from src.models import BaseModel, UtcDateTime


class SignatureInput(BaseModel):
    image_data_url: str = Field(max_length=350000)


class SignaturePublic(BaseModel):
    version: uuid.UUID
    image_data_url: str
    updated_at: UtcDateTime


class SignatureConsent(BaseModel):
    # Supplying the version is explicit consent to apply this saved signature.
    # Legacy API callers may continue to submit unsigned documents.
    signature_version: uuid.UUID | None = None


class SignedDocumentPublic(BaseModel):
    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    signer_name: str
    signed_at: UtcDateTime
    sha256: str


class SignedDocumentList(BaseModel):
    data: list[SignedDocumentPublic]
    count: int
