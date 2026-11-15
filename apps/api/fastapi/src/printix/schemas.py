"""Printix API shapes. Every name carries the ``Printix`` prefix (unique in OpenAPI).

Barcode values are never returned to administrators: a ticket's barcode is the
credential that admits it, so it leaves the server only in an import upload.
"""

import uuid
from datetime import date

from pydantic import AwareDatetime, Field

from src.models import BaseModel, UtcDateTime

from . import constants

EventName = Field(min_length=1, max_length=constants.EVENT_NAME_MAX_LENGTH)
Gate = Field(min_length=1, max_length=constants.GATE_MAX_LENGTH)


class PrintixEventCreate(BaseModel):
    name: str = EventName
    event_date: date
    closes_at: AwareDatetime = Field(
        description="When the event closes at the gate. Sent with a timezone."
    )


class PrintixEventPublic(BaseModel):
    id: uuid.UUID
    name: str
    event_date: date
    closes_at: UtcDateTime
    status: constants.PrintixEventStatus
    created_at: UtcDateTime


class PrintixTicketPublic(BaseModel):
    id: uuid.UUID
    printed_number: str
    status: constants.PrintixTicketStatus
    admitted_at: UtcDateTime | None = None
    admitted_gate: str | None = None


class PrintixTicketPage(BaseModel):
    items: list[PrintixTicketPublic]
    total: int
    page: int
    size: int


class PrintixImportIssue(BaseModel):
    line: int = Field(description="Line of the uploaded file (the header is line 1).")
    message: str


class PrintixImportReport(BaseModel):
    dry_run: bool
    applied: bool = Field(
        description="True only when every row was written. A file with any error writes nothing."
    )
    rows: int = Field(description="Data rows read from the file, blank lines excluded.")
    to_add: int = Field(description="Rows that a clean apply would write.")
    errors: list[PrintixImportIssue]
    errors_truncated: bool = Field(
        description=f"True when more than {constants.MAX_REPORTED_ERRORS} problems were found."
    )


class PrintixPairingCreate(BaseModel):
    gate: str = Gate
    expires_at: AwareDatetime | None = Field(
        default=None,
        description="Defaults to six hours after the event closes. At most a day after close.",
    )


class PrintixPairingPublic(BaseModel):
    id: uuid.UUID
    gate: str
    created_at: UtcDateTime
    expires_at: UtcDateTime
    revoked_at: UtcDateTime | None = None


class PrintixPairingCreated(PrintixPairingPublic):
    secret: str = Field(
        description="Shown once. Put it in the pairing QR code; it is never returned again."
    )


class PrintixGateCount(BaseModel):
    gate: str
    admitted: int


class PrintixEventSummary(BaseModel):
    event: PrintixEventPublic
    issued: int = Field(description="Valid and void tickets imported.")
    void: int
    admitted: int
    not_yet_in: int = Field(description="Valid tickets not yet admitted.")
    duplicates_refused: int = Field(
        description="Scans of an already admitted ticket, refused."
    )
    admitted_by_gate: list[PrintixGateCount]


class PrintixScanRequest(BaseModel):
    value: str = Field(
        min_length=1,
        max_length=constants.SCAN_VALUE_MAX,
        description="The barcode value, or a typed printed number.",
    )


class PrintixScanResult(BaseModel):
    outcome: constants.PrintixScanOutcome
    printed_number: str | None = Field(
        default=None,
        description="Set when the value matched a ticket on this event.",
    )
    admitted_at: UtcDateTime | None = Field(
        default=None,
        description="For admitted, the time of this admission. For already_admitted, the first one.",
    )
    admitted_gate: str | None = Field(
        default=None,
        description="The gate of the admission named in admitted_at.",
    )
