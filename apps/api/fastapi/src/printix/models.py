"""Printix ticket registry tables (``printix`` schema, ADR-0060).

Names carry the ``Printix`` prefix: other domains already define ``Ticket`` and
``Event`` classes on the shared declarative base.

No personal data is stored: a ticket is a printed number and the value its
barcode encodes. A pairing keeps only the SHA-256 of its secret.
"""

import uuid
from datetime import date, datetime

import sqlalchemy as sa
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now

from . import constants


class PrintixEvent(Base):
    __tablename__ = "event"
    __table_args__ = (
        sa.CheckConstraint("status IN ('open', 'closed')", name="status"),
        sa.Index("event_organisation_id_idx", "organisation_id"),
        {"schema": "printix"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(constants.EVENT_NAME_MAX_LENGTH))
    event_date: Mapped[date]
    #: Naive UTC, like every datetime column in the app.
    closes_at: Mapped[datetime]
    status: Mapped[str] = mapped_column(
        String(10), default=constants.PrintixEventStatus.OPEN.value
    )
    #: Set by the administrator's close (``transitions.move_event``). An offline scan
    #: made before it still counts. NULL while open, and for a closed event with no
    #: recorded close, which refuses every offline scan.
    closed_at: Mapped[datetime | None]
    #: The organisation that owns the event (ADR-0060 organiser amendment). NULL for
    #: events made by an administrator without one; organisers never see those.
    organisation_id: Mapped[str | None] = mapped_column(
        String(100),
        ForeignKey("org.organisation.id", name="event_organisation_id_fkey"),
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class PrintixPairing(Base):
    """One gate's phone, admitted to one event until ``expires_at`` or revocation.

    ``token_hash`` is the SHA-256 hex of the secret. The secret itself is returned
    once, when the pairing is created, and is not stored anywhere.
    """

    __tablename__ = "pairing"
    __table_args__ = (
        sa.CheckConstraint("char_length(gate) > 0", name="gate_not_empty"),
        {"schema": "printix"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("printix.event.id"), index=True
    )
    gate: Mapped[str] = mapped_column(String(constants.GATE_MAX_LENGTH))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime]
    revoked_at: Mapped[datetime | None]
    #: Off by default: then only an exact barcode admits. On, a typed printed number
    #: admits too, under a much lower cap.
    allow_typed_numbers: Mapped[bool] = mapped_column(
        default=False, server_default=sa.false()
    )
    #: The administrator's user id. No foreign key: accounts belong to the auth domain.
    created_by: Mapped[uuid.UUID | None]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class PrintixTicket(Base):
    """One printed ticket. ``printed_number`` is unique only within its event."""

    __tablename__ = "ticket"
    __table_args__ = (
        sa.UniqueConstraint(
            "event_id", "printed_number", name="ticket_event_printed_number_key"
        ),
        sa.UniqueConstraint(
            "event_id", "barcode_value", name="ticket_event_barcode_key"
        ),
        sa.CheckConstraint("status IN ('valid', 'void')", name="status"),
        sa.CheckConstraint(
            "(admitted_at IS NULL) = (admitted_gate IS NULL)", name="admitted_pair"
        ),
        {"schema": "printix"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("printix.event.id"))
    printed_number: Mapped[str] = mapped_column(String(constants.PRINTED_NUMBER_MAX))
    barcode_value: Mapped[str] = mapped_column(String(constants.BARCODE_MAX))
    status: Mapped[str] = mapped_column(
        String(10), default=constants.PrintixTicketStatus.VALID.value
    )
    #: Set once, by the admission that wins. Never cleared.
    admitted_at: Mapped[datetime | None]
    admitted_gate: Mapped[str | None] = mapped_column(String(constants.GATE_MAX_LENGTH))
    admitted_pairing: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("printix.pairing.id")
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class PrintixScanLog(Base):
    """Every scan that reached admission, with its outcome. Values are cut to 128 characters."""

    __tablename__ = "scan_log"
    __table_args__ = (
        sa.Index("scan_log_pairing_id_scanned_at_idx", "pairing_id", "scanned_at"),
        sa.Index(
            "scan_log_pairing_id_client_ref_idx",
            "pairing_id",
            "client_ref",
            unique=True,
        ),
        sa.CheckConstraint(
            "outcome IN ('admitted', 'already_admitted', 'void', 'unknown', 'event_closed')",
            name="outcome",
        ),
        {"schema": "printix"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    pairing_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("printix.pairing.id"))
    ticket_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("printix.ticket.id"))
    outcome: Mapped[str] = mapped_column(String(20))
    value: Mapped[str] = mapped_column(String(constants.SCAN_VALUE_LOG_LENGTH))
    #: True when the scan was a typed printed-number lookup (counted by its own cap).
    typed: Mapped[bool] = mapped_column(default=False, server_default=sa.false())
    #: When the server recorded the scan. For an offline admission, when it was synced,
    #: so the rolling caps count server time and a phone's clock cannot dodge them.
    scanned_at: Mapped[datetime] = mapped_column(default=utc_now)
    #: Set only for an admission made offline: the phone's time, kept between the
    #: pairing's creation and the sync. ``None`` for a live scan.
    offline_scanned_at: Mapped[datetime | None]
    #: The phone's reference for a queued offline admission. A retried sync with the
    #: same reference answers from this row instead of scanning again.
    client_ref: Mapped[uuid.UUID | None]


#: "This phone's scans, newest first" by when they happened at the gate (the phone's
#: own time for an offline scan). One ascending index serves the newest-first reads
#: by scanning backwards. Declared here, after the class, because it names columns.
sa.Index(
    "scan_log_pairing_id_happened_at_idx",
    PrintixScanLog.pairing_id,
    sa.func.coalesce(PrintixScanLog.offline_scanned_at, PrintixScanLog.scanned_at),
    PrintixScanLog.id,
)
