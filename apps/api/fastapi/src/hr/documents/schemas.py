import uuid
from datetime import date

from pydantic import Field

from src.hr.documents.models import DocumentCategory, DocumentSensitivity
from src.models import BaseModel, UtcDateTime


class EmployeeDocumentCreate(BaseModel):
    """Metadata accompanying an upload.

    ``sensitivity`` is absent by design — it is derived from ``category`` in the
    service so a caller cannot file a restricted document as a standard one.
    """

    user_id: uuid.UUID
    organisation_id: str | None = None
    category: DocumentCategory = DocumentCategory.OTHER
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    issued_date: date | None = None
    expiry_date: date | None = None
    issuing_authority: str | None = Field(default=None, max_length=255)
    reference_number: str | None = Field(default=None, max_length=120)
    entity_type: str | None = None
    entity_id: uuid.UUID | None = None


class EmployeeDocumentUpdate(BaseModel):
    """Correctable metadata only.

    Category is not updatable: moving a MEDICAL document to OTHER would widen who
    can read it after the fact. Re-file it instead, so the audit trail shows two
    rows rather than one silently reclassified one.
    """

    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    issued_date: date | None = None
    expiry_date: date | None = None
    issuing_authority: str | None = Field(default=None, max_length=255)
    reference_number: str | None = Field(default=None, max_length=120)


class DocumentUpload(BaseModel):
    """The bytes and their declared envelope, decoupled from FastAPI's UploadFile
    so the service layer stays testable without a request."""

    filename: str
    content_type: str
    data: bytes


class EmployeeDocumentPublic(BaseModel):
    organisation_id: str
    can_manage: bool = False
    # object_key is deliberately not exposed: downloads are issued through
    # /hr/documents/{id}/download so every retrieval passes the access gate.
    id: uuid.UUID
    user_id: uuid.UUID
    category: DocumentCategory
    sensitivity: DocumentSensitivity
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    original_filename: str
    content_type: str
    size_bytes: int
    issued_date: date | None = None
    expiry_date: date | None = None
    issuing_authority: str | None = Field(default=None, max_length=255)
    reference_number: str | None = Field(default=None, max_length=120)
    entity_type: str | None = None
    entity_id: uuid.UUID | None = None
    uploaded_by_user_id: uuid.UUID | None = None
    archived_at: UtcDateTime | None = None
    created_at: UtcDateTime
    updated_at: UtcDateTime


class EmployeeDocumentListPublic(BaseModel):
    can_upload: bool = False
    data: list[EmployeeDocumentPublic]
    count: int
    page: int = 1
    size: int = 100


class DocumentEmployeePublic(BaseModel):
    user_id: uuid.UUID
    name: str
    department_id: str
    can_upload: bool


class DocumentEmployeeListPublic(BaseModel):
    data: list[DocumentEmployeePublic]
    count: int
    page: int
    size: int
