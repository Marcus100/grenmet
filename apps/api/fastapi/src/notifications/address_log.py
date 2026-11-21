"""Remove a deleted person's address from the email delivery log (issue #1629).

``OutboundEmail`` keeps the address, props (first name, signed links) and html of
every mail queued to the person, and the platform outbox keeps the same in an
``email.send`` payload until it is done or dead. Account deletion calls
``clear_address`` in its own transaction, so the log keeps its shape for the
delivery statistics (status, attempts, timestamps) but cannot identify the person.

Rules per row:

- ``to_email`` becomes the anonymised account's placeholder (same random token, so
  it is not the address and cannot be reversed).
- ``props``, ``html``, ``last_error`` and ``next_retry_at`` are cleared; ``subject``
  becomes a generic line, since subjects can carry names.
- A mail not yet final (pending, or failed with a retry still scheduled) becomes
  ``skipped``, so it is never sent to the placeholder. Its ``email.deliver`` outbox
  row then finds nothing to send.
- ``email.send`` outbox rows for the address lose their payload; a pending one is
  marked done so it is never sent.

Bounce and complaint suppression stores only a keyed hash (ADR-0052) and is not
touched. Other tables that hold the address are listed in the notifications AGENTS
file, not handled here.
"""

from typing import Final

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.outbox import Outbox, OutboxStatus
from src.utils.datetime import utc_now

from . import outbox_handlers, service
from .models import OutboundEmail, OutboundEmailStatus

DELETED_SUBJECT: Final = "Email to a deleted account"
ACCOUNT_DELETED_ERROR: Final = "Account deleted before sending"


async def clear_address(session: AsyncSession, *, email: str, placeholder: str) -> int:
    """Anonymise every delivery-log and queued email row addressed to ``email``.

    Matches the normalised address exactly (never a prefix or pattern). Runs in the
    caller's transaction and does not commit. Returns the number of rows changed.
    A second run finds nothing, because the rows no longer hold the address."""
    clean = service.normalise_email(email)
    now = utc_now()
    log_rows = (
        await session.scalars(
            select(OutboundEmail)
            .where(func.lower(func.trim(OutboundEmail.to_email)) == clean)
            .with_for_update()
        )
    ).all()
    for row in log_rows:
        not_final = row.status == OutboundEmailStatus.PENDING.value or (
            row.status == OutboundEmailStatus.FAILED.value
            and row.next_retry_at is not None
        )
        if not_final:
            row.status = OutboundEmailStatus.SKIPPED.value
            row.last_error = ACCOUNT_DELETED_ERROR
        else:
            row.last_error = None
        row.to_email = placeholder
        row.subject = DELETED_SUBJECT
        row.props = {}
        row.html = None
        row.next_retry_at = None
    queued = (
        await session.scalars(
            select(Outbox)
            .where(
                Outbox.topic == outbox_handlers.EMAIL_SEND,
                func.lower(func.trim(Outbox.payload["to_email"].astext)) == clean,
            )
            .with_for_update()
        )
    ).all()
    for message in queued:
        if message.status == OutboxStatus.PENDING.value:
            message.status = OutboxStatus.DONE.value
        message.payload = {}
        message.updated_at = now
    return len(log_rows) + len(queued)
