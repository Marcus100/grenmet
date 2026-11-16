"""Printix API shapes. Every name carries the ``Printix`` prefix (unique in OpenAPI).

Barcode values are never returned to administrators: a ticket's barcode is the
credential that admits it, so it leaves the server only in an import upload.
"""

import uuid
from datetime import UTC, date, datetime
from typing import Annotated, Literal

from pydantic import AwareDatetime, Field, field_validator, model_validator

from src.models import ApiError, BaseModel, UtcDateTime

from . import constants

EventName = Field(min_length=1, max_length=constants.EVENT_NAME_MAX_LENGTH)
Gate = Field(min_length=1, max_length=constants.GATE_MAX_LENGTH)


class PrintixEventCreate(BaseModel):
    name: str = EventName
    event_date: date
    closes_at: AwareDatetime = Field(
        description="When the event closes at the gate. Sent with a timezone."
    )

    organisation_id: str | None = Field(
        default=None,
        max_length=100,
        description=(
            "The organisation that owns the event. Omit it for an event only "
            "administrators see; organisers see an event once it has their organisation."
        ),
    )

    @model_validator(mode="after")
    def _closes_on_or_after_the_event_date(self) -> PrintixEventCreate:
        if self.closes_at.date() < self.event_date:
            raise ValueError("closes_at must not be before the event date")
        return self


class PrintixEventOrganisationUpdate(BaseModel):
    organisation_id: str | None = Field(
        max_length=100,
        description="The owning organisation, or null to take the event away from every organisation.",
    )


class PrintixEventPublic(BaseModel):
    id: uuid.UUID
    name: str
    event_date: date
    closes_at: UtcDateTime
    status: constants.PrintixEventStatus
    created_at: UtcDateTime
    organisation_id: str | None = None


class PrintixOrganiserOrganisation(BaseModel):
    """An organisation the signed-in person may run Printix organiser routes for."""

    id: str
    name: str
    can_manage_events: bool = Field(
        description="Holds printix.events.manage: may set up events and read them."
    )
    can_manage_gates: bool = Field(
        description="Holds printix.gates.manage: may make gate codes and read the summary."
    )


class PrintixEventPage(BaseModel):
    items: list[PrintixEventPublic]
    total: int
    page: int
    size: int


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
    warnings: list[str] = Field(
        description="Checks that do not block the import but need the operator's attention."
    )


class PrintixPairingCreate(BaseModel):
    gate: str = Gate
    expires_at: AwareDatetime | None = Field(
        default=None,
        description="Defaults to six hours after the event closes. At most a day after close.",
    )
    allow_typed_numbers: bool = Field(
        default=False,
        description=(
            "Off by default: only an exact barcode admits. On, a typed printed number "
            "admits too, under a lower cap (20 a minute)."
        ),
    )


class PrintixPairingPublic(BaseModel):
    id: uuid.UUID
    gate: str
    created_at: UtcDateTime
    expires_at: UtcDateTime
    revoked_at: UtcDateTime | None = None
    allow_typed_numbers: bool = False


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
        description="Live scans of an already admitted ticket, refused."
    )
    offline_conflicts: int = Field(
        default=0,
        description=(
            "Offline admissions that the server could not record when the phone "
            "synced: the ticket was already admitted elsewhere, void, unknown or "
            "the event had closed. The person was let in at the gate."
        ),
    )
    admitted_by_gate: list[PrintixGateCount]


class PrintixScanRequest(BaseModel):
    value: str = Field(
        min_length=1,
        max_length=constants.SCAN_VALUE_MAX,
        pattern=rf"^[^{constants.CONTROL_CHARACTER_PATTERN[1:-1]}]*$",
        description=(
            "The barcode value, or a typed printed number. Control characters are refused."
        ),
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


# --- Offline scanning ---------------------------------------------------------


class PrintixOfflineTicket(BaseModel):
    barcode_hash: str = Field(
        description=(
            "HMAC-SHA256 of the barcode value with the list's hash_key, hex, cut to "
            f"{constants.OFFLINE_HASH_HEX_LENGTH} characters. The barcode itself is "
            "never sent."
        )
    )
    printed_number: str
    state: constants.PrintixOfflineTicketState
    admitted_at: UtcDateTime | None = Field(
        default=None, description="For admitted, the first admission's time."
    )
    admitted_gate: str | None = Field(
        default=None, description="For admitted, the first admission's gate."
    )


class PrintixOfflineList(BaseModel):
    event: PrintixEventPublic
    generated_at: UtcDateTime = Field(
        description="When the server built this list. Admissions after it are not in it."
    )
    hash_key: str = Field(
        description=(
            "The key for barcode_hash, unique to this pairing. The phone hashes a "
            "scanned value (trimmed) with it to look the ticket up offline."
        )
    )
    tickets: list[PrintixOfflineTicket]


ScanValue = Annotated[
    str,
    Field(
        min_length=1,
        max_length=constants.SCAN_VALUE_MAX,
        pattern=rf"^[^{constants.CONTROL_CHARACTER_PATTERN[1:-1]}]*$",
        description="The scanned barcode value. Control characters are refused.",
    ),
]


class PrintixOfflineAdmission(BaseModel):
    client_ref: uuid.UUID = Field(
        description=(
            "The phone's reference for this queued admission. A retry with the same "
            "reference gets the first answer back and is not scanned again."
        )
    )
    value: ScanValue
    scanned_at: AwareDatetime = Field(
        description=(
            "When the phone admitted the ticket offline, between 2020-01-01 UTC and a "
            "day after the server's time (else 422). Kept between the pairing's "
            "creation and the time of the sync."
        )
    )

    @field_validator("scanned_at")
    @classmethod
    def _within_bounds(cls, value: datetime) -> datetime:
        # Compared, not converted: converting a year-1 time with an offset to UTC overflows.
        latest = datetime.now(UTC) + constants.OFFLINE_SCANNED_AT_MAX_AHEAD
        if not constants.OFFLINE_SCANNED_AT_EARLIEST <= value <= latest:
            raise ValueError(
                "scanned_at must be between 2020-01-01 UTC and a day ahead"
            )
        return value


class PrintixOfflineSyncRequest(BaseModel):
    admissions: list[PrintixOfflineAdmission] = Field(
        min_length=1, max_length=constants.OFFLINE_SYNC_BATCH_MAX
    )

    @model_validator(mode="after")
    def _references_are_unique(self) -> PrintixOfflineSyncRequest:
        refs = [admission.client_ref for admission in self.admissions]
        if len(set(refs)) != len(refs):
            raise ValueError("each client_ref may appear once in a batch")
        return self


class PrintixOfflineAdmissionResult(PrintixScanResult):
    client_ref: uuid.UUID


class PrintixOfflineSyncResult(BaseModel):
    results: list[PrintixOfflineAdmissionResult] = Field(
        description=(
            "One answer per admission the server handled, in the order sent. Anything "
            "other than admitted is a conflict: the person was let in offline, but the "
            "server did not record this admission."
        )
    )
    deferred: int = Field(
        description=(
            "Admissions at the end of the batch that were not handled, because too "
            "many unknown values were sent in the last minute. Keep them and send "
            "them again after retry_after_seconds."
        )
    )
    retry_after_seconds: int | None = None


class PrintixOfflineUnavailableBody(ApiError):
    """A 409 that refuses offline mode for an event with weak barcodes."""

    code: Literal["offline_not_available"] = Field(
        description="Stable code. Offline mode is off for this event; use the live scanner."
    )
