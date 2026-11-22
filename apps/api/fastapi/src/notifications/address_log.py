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

Ordering and races. The ``email.send`` outbox rows are locked first. A drain that
is sending one of them holds that row's lock until its handler commits, and that
handler writes a new delivery-log row with the real address (sent, or failed when
dead). Locking the outbox rows first makes this function wait for that commit, so
the log read below (a fresh statement, so it sees everything committed so far)
catches the new row. Once the outbox rows are locked, no new send for them can
start. The log is cleared a second time at the end as a safety net.

Address matching uses one rule on both sides: strip leading and trailing whitespace
(as ``normalise_email`` does in Python), then lower-case.

Bounce and complaint suppression stores only a keyed hash (ADR-0052) and is not
touched. Other tables that hold the address are listed in the notifications AGENTS
file, not handled here.
"""

from datetime import datetime
from typing import Final

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute
from sqlalchemy.sql.elements import ColumnElement

from src import outbox
from src.outbox import Outbox
from src.utils.datetime import utc_now

from . import dispatch, outbox_handlers, service
from .models import OutboundEmail

DELETED_SUBJECT: Final = "Email to a deleted account"
ACCOUNT_DELETED_ERROR: Final = "Account deleted before sending"
# Same rule as ``str.strip()`` plus lower-casing in ``normalise_email``.
_EDGE_WHITESPACE: Final = r"^\s+|\s+$"


def _address_is(
    column: ColumnElement[str] | InstrumentedAttribute[str], clean: str
) -> ColumnElement[bool]:
    trimmed = func.regexp_replace(column, _EDGE_WHITESPACE, "", "g")
    return func.lower(trimmed) == clean


async def _clear_queued(session: AsyncSession, clean: str, now: datetime) -> int:
    queued = (
        await session.scalars(
            select(Outbox)
            .where(
                Outbox.topic == outbox_handlers.EMAIL_SEND,
                _address_is(Outbox.payload["to_email"].astext, clean),
            )
            .with_for_update()
        )
    ).all()
    for message in queued:
        outbox.erase_payload(message, now)
    return len(queued)


async def _clear_log(session: AsyncSession, clean: str, placeholder: str) -> int:
    log_rows = (
        await session.scalars(
            select(OutboundEmail)
            .where(_address_is(OutboundEmail.to_email, clean))
            .with_for_update()
        )
    ).all()
    for row in log_rows:
        if dispatch.is_unsent(row):
            dispatch.skip_unsent(row, ACCOUNT_DELETED_ERROR)
        else:
            row.last_error = None
        row.to_email = placeholder
        row.subject = DELETED_SUBJECT
        row.props = {}
        row.html = None
        row.next_retry_at = None
    return len(log_rows)


async def clear_address(session: AsyncSession, *, email: str, placeholder: str) -> int:
    """Anonymise every delivery-log and queued email row addressed to ``email``.

    Matches the normalised address exactly (never a prefix or pattern). Runs in the
    caller's transaction and does not commit. Returns the number of rows changed.
    A second run finds nothing, because the rows no longer hold the address."""
    clean = service.normalise_email(email)
    now = utc_now()
    changed = await _clear_queued(session, clean, now)
    changed += await _clear_log(session, clean, placeholder)
    # Safety net: a row that arrived after the first pass (it cannot, once the queued
    # rows above are locked, but the check costs one query) is anonymised too.
    changed += await _clear_log(session, clean, placeholder)
    return changed
