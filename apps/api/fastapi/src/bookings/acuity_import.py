"""One-off import of future appointments from an Acuity Scheduling export.

Used when a business moves from Acuity to Barrels Bookings: its confirmed,
future appointments are entered once so the diary is complete on day one.
Dry run by default; nothing is written unless ``--apply`` is given. A rerun is
safe: every imported booking keeps its Acuity appointment ID as
``booking.idempotency_key`` (``acuity:<id>``, unique per organisation), so rows
already imported are skipped.

Rules, all in one place:

- Times are read in the business's timezone (Acuity writes local wall-clock
  times such as ``December 3, 2026 10:00 am``) and stored as naive UTC.
- Cancelled rows, past rows (before ``--since``, default now) and rows whose
  service, staff member, time or contact cannot be read are skipped, each with
  a reason and row number. Nothing is guessed.
- Services match by exact name, then case-insensitively, then ``--service-map``.
  Staff match the Calendar column the same way; a blank Calendar uses the only
  active staff member, if there is exactly one.
- A customer is matched by normalised email. A row without an email matches
  the one contact with the same phone (E.164) and full name (:func:`name_key`);
  otherwise a new contact is created (ADR-0028). A phone-matched contact never
  receives the row's email.
- The database forbids two active bookings for one provider at once, so an
  overlapping row cannot be stored. It is listed and left out. ``--strict``
  stops the whole run instead, before anything is saved.
- Bookings are ``confirmed``, with no deposit. The history note is
  ``Imported from Acuity``. Webhooks are not sent. Confirmation emails are sent
  only with ``--notify``; reminders still go out later, as for any booking.
- The booking's ``source`` is ``studio`` (the business entered it). A new
  ``acuity-import`` value would be a new enum member in public responses, which
  the breaking-change check treats as a client break, so it waits for the owner.

    uv run --frozen --package fast-back python -m src.bookings.acuity_import --file <export.csv> --business <slug>
    uv run --frozen --package fast-back python -m src.bookings.acuity_import --file <export.csv> --business <slug> --apply

The export holds customer personal data: keep it under the gitignored
``/private/`` folder and never commit it.
"""

import argparse
import asyncio
import csv
import io
import json
import logging
import re
import sys
import unicodedata
import uuid
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.contacts import service as contacts_service
from src.contacts.models import Contact
from src.utils.datetime import utc_now
from src.utils.email_hash import normalise_email

from . import emails, public
from . import service as booking_service
from .contact import normalise_phone
from .models import (
    ACTIVE_STATUSES,
    Booking,
    BookingProfile,
    BookingSource,
    BookingStatus,
    Provider,
    Service,
)

logger = logging.getLogger(__name__)

ACUITY_PREFIX = "acuity:"
#: Contact source, as the studio's own entries use.
CONTACT_SOURCE = "bookings"
HISTORY_NOTE = "Imported from Acuity"
#: Area code added to seven-digit local numbers (Grenada, +1 473).
LOCAL_AREA_CODE = "473"
MAX_APPOINTMENT_ID_LENGTH = 80

#: Fields the importer understands, with the header names (normalised: lower
#: case, letters and digits only) that Acuity exports use for them.
FIELD_ALIASES: dict[str, tuple[str, ...]] = {
    "appointment_id": ("appointmentid", "appointmentnumber"),
    "start": ("starttime", "appointmenttime", "datetime"),
    "end": ("endtime", "appointmentendtime"),
    "first_name": ("firstname",),
    "last_name": ("lastname",),
    "name": ("name", "fullname", "clientname", "customername"),
    "phone": ("phone", "phonenumber", "mobile", "telephone"),
    "email": ("email", "emailaddress"),
    "service": ("type", "appointmenttype", "service", "servicename"),
    "calendar": ("calendar", "staff", "provider", "employee"),
    "canceled": ("canceled", "cancelled", "iscanceled", "iscancelled"),
    "notes": ("notes", "note"),
}
REQUIRED_FIELDS = ("appointment_id", "start", "service")
_CANCELLED_VALUES = frozenset({"yes", "y", "true", "1", "x", "canceled", "cancelled"})
#: Acuity writes local times in these forms (English month names, 12-hour clock).
_TIME_FORMATS = (
    "%B %d, %Y %I:%M %p",
    "%b %d, %Y %I:%M %p",
    "%B %d, %Y %H:%M",
    "%b %d, %Y %H:%M",
    "%Y-%m-%d %H:%M",
    "%Y-%m-%d %H:%M:%S",
)
_EMAIL = TypeAdapter(EmailStr)

# Skip reasons, as printed in the report.
R_NO_ID = "no appointment id"
R_BAD_ID = "bad appointment id"
R_DUPLICATE = "duplicate in file"
R_BAD_TIME = "bad time"
R_CANCELLED = "cancelled"
R_PAST = "past"
R_UNKNOWN_SERVICE = "unknown service"
R_INACTIVE_SERVICE = "service inactive"
R_UNKNOWN_STAFF = "unknown staff"
R_NO_STAFF = "no staff"
R_MISSING_CONTACT = "missing contact"
R_AMBIGUOUS_CONTACT = "ambiguous contact"
R_ERASED_CONTACT = "erased contact"
R_NAME_TOO_LONG = "name too long"
R_PHONE_TOO_LONG = "phone too long"
R_EMAIL_TOO_LONG = "email too long"

#: Column widths the database accepts (contacts and bookings).
NAME_MAX = 255
PHONE_MAX = 40
EMAIL_MAX = 254
NOTES_MAX = 1000
#: Unmatched service or staff names shown in the report, at most this many.
UNMATCHED_SHOWN = 20
#: Longest unmatched value printed verbatim; longer or identifying text is redacted.
UNMATCHED_MAX_CHARS = 60
REDACTED = "<redacted: check --column-map>"
_DIGITS_RUN = re.compile(r"\d{6,}")


class AcuityImportError(ValueError):
    """The file or the options cannot be used; nothing is written."""


def display_unmatched(value: str) -> str:
    """An unmatched service or staff name, safe to print.

    A wrong ``--column-map`` can put customer text in those columns, so only a
    short value with no ``@`` and no run of six digits is shown as typed.
    """
    text = _squash(value)
    if (
        len(text) <= UNMATCHED_MAX_CHARS
        and "@" not in text
        and not _DIGITS_RUN.search(text)
    ):
        return text
    return REDACTED


def clip_notes(text: str) -> str | None:
    """Acuity notes for the booking: stripped, NUL bytes removed, at most
    ``NOTES_MAX`` characters. They appear in customer emails, so the owner must
    confirm they are customer-facing (see the runbook)."""
    cleaned = _squash(text.replace("\x00", ""))
    return cleaned[:NOTES_MAX] or None


def read_export_text(data: bytes, encoding: str) -> str:
    """The export's text. UTF-8 with or without a byte-order mark is the default;
    any other file is refused with a clear message rather than guessed at."""
    try:
        return data.decode(encoding)
    except (UnicodeDecodeError, LookupError) as error:
        raise AcuityImportError(
            f"The export is not readable as {encoding!r} (encoding). Save it as "
            "CSV UTF-8, or pass --encoding with the file's real encoding, for "
            "example cp1252."
        ) from error


@dataclass(frozen=True)
class ImportOptions:
    #: Earliest start to import: ``2026-12-01`` or an ISO datetime. ``None`` = now.
    since: str | None = None
    #: Field name -> exact header in the file, for exports with other headers.
    column_map: Mapping[str, str] | None = None
    #: Acuity service name -> Barrels service name, used after exact and
    #: case-insensitive matching fail.
    service_map: Mapping[str, str] | None = None
    notify: bool = False
    strict: bool = False
    local_area_code: str = LOCAL_AREA_CODE


@dataclass
class ImportReport:
    applied: bool = False
    aborted: bool = False
    notify: bool = False
    rows_read: int = 0
    future: int = 0
    created_rows: list[int] = field(default_factory=list)
    already_imported: list[int] = field(default_factory=list)
    skipped: dict[str, list[int]] = field(default_factory=dict)
    overlaps: list[int] = field(default_factory=list)
    end_differs: list[int] = field(default_factory=list)
    invalid_emails: list[int] = field(default_factory=list)
    unknown_services: dict[str, int] = field(default_factory=dict)
    unknown_staff: dict[str, int] = field(default_factory=dict)
    unknown_headers: list[str] = field(default_factory=list)
    column_map: dict[str, str] = field(default_factory=dict)
    contacts_created: int = 0
    contacts_reused: int = 0
    emails_queued: int = 0
    #: Where the run writes: environment, database host, business, organisation.
    target: str = ""

    @property
    def created(self) -> int:
        return len(self.created_rows)

    def skip(self, reason: str, number: int) -> None:
        self.skipped.setdefault(reason, []).append(number)

    def format(self) -> str:
        if self.aborted:
            head = "ABORTED (--strict): the diary has overlaps; nothing was saved."
        elif self.applied:
            head = "SAVED."
        else:
            head = "DRY RUN: nothing was saved. Run again with --apply to save."
        verb = "Created" if self.applied else "Would create"
        lines = [
            head,
            f"Target: {self.target}" if self.target else "Target: not resolved",
            f"Rows read: {self.rows_read}",
            f"Future appointments: {self.future}",
            f"{verb}: {self.created}" + _rows_suffix(self.created_rows),
            f"Contacts: {self.contacts_created} new, "
            f"{self.contacts_reused} matched an existing one",
            f"Already imported (skipped): {len(self.already_imported)}"
            + _rows_suffix(self.already_imported),
        ]
        if self.skipped:
            lines.append("Skipped:")
            for reason, rows in self.skipped.items():
                lines.append(f"  {reason}: {len(rows)}{_rows_suffix(rows)}")
        else:
            lines.append("Skipped: none")
        lines.append(
            f"Overlapping the diary (left out): {len(self.overlaps)}"
            + _rows_suffix(self.overlaps)
        )
        if self.end_differs:
            lines.append(
                "Acuity end time differs from the service length (service length kept)"
                + _rows_suffix(self.end_differs)
            )
        if self.invalid_emails:
            lines.append(
                "Email not valid (booking kept, matched by phone only)"
                + _rows_suffix(self.invalid_emails)
            )
        if self.unknown_services:
            lines.append(
                "Service names not matched (add them to --service-map): "
                + _counts(self.unknown_services)
            )
        if self.unknown_staff:
            lines.append(
                "Calendar names not matched to staff: " + _counts(self.unknown_staff)
            )
        if self.unknown_headers:
            lines.append("Columns not used: " + ", ".join(self.unknown_headers))
        if self.column_map:
            used = ", ".join(f'{k} = "{v}"' for k, v in self.column_map.items())
            lines.append(f"Columns used: {used}")
        mode = "on" if self.notify else "off"
        lines.append(
            f"Confirmation emails queued: {self.emails_queued} (notify {mode})"
        )
        return "\n".join(lines)


def _rows_suffix(rows: Sequence[int]) -> str:
    return f" (rows {', '.join(str(r) for r in rows)})" if rows else ""


def _counts(counter: Mapping[str, int]) -> str:
    shown = list(counter.items())[:UNMATCHED_SHOWN]
    text = ", ".join(f'"{name}" x{count}' for name, count in shown)
    hidden = len(counter) - len(shown)
    return text + (f" and {hidden} more" if hidden else "")


def _count_unmatched(counter: dict[str, int], value: str) -> None:
    shown = display_unmatched(value)
    counter[shown] = counter.get(shown, 0) + 1


# --- pure helpers ----------------------------------------------------------------------


def _key(header: str) -> str:
    """A header compared without case, spaces or punctuation."""
    return re.sub(r"[^a-z0-9]", "", header.lower())


def _squash(text: str) -> str:
    return " ".join(text.split())


def name_key(text: str | None) -> str:
    """A full name compared without case, accents or spacing ("José  Núñez" == "jose nunez").

    ``""`` when there is no name, so a blank name never agrees with anything.
    """
    squashed = _squash(text or "")
    if not squashed:
        return ""
    decomposed = unicodedata.normalize("NFKD", squashed)
    kept = "".join(char for char in decomposed if not unicodedata.combining(char))
    return _squash(kept).casefold()


def parse_local_time(text: str | None, zone: ZoneInfo) -> datetime | None:
    """An Acuity time as naive UTC, or ``None`` when it cannot be read.

    A time without an offset is local wall-clock time in ``zone``.
    """
    value = _squash(text or "")
    if not value:
        return None
    moment: datetime | None
    try:
        moment = datetime.fromisoformat(value)
    except ValueError:
        moment = None
        for pattern in _TIME_FORMATS:
            try:
                moment = datetime.strptime(value, pattern)
            except ValueError:
                continue
            break
    if moment is None:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=zone)
    return moment.astimezone(UTC).replace(tzinfo=None)


def phone_key(raw: str | None, local_area_code: str) -> str | None:
    """A phone number in E.164 form, so that one person's numbers compare equal.

    ``+1 473 555 0102``, ``473-555-0102``, ``00 1 473 555 0102`` and the
    seven-digit ``555-0102`` (with the local area code) all give ``+14735550102``.
    ``None`` when the text is not a usable number.
    """
    text = (raw or "").strip()
    if not text:
        return None
    digits = re.sub(r"\D", "", text)
    if text.startswith("+"):
        candidate = f"+{digits}"
    elif text.startswith("00"):
        candidate = f"+{digits[2:]}"
    elif len(digits) == 7:
        candidate = f"+1{local_area_code}{digits}"
    elif len(digits) == 10:
        candidate = f"+1{digits}"
    elif len(digits) == 11 and digits.startswith("1"):
        candidate = f"+{digits}"
    else:
        return None
    try:
        return normalise_phone(candidate)
    except ValueError:
        return None


def _valid_email(raw: str) -> str | None:
    text = raw.strip()
    if not text:
        return None
    try:
        return normalise_email(_EMAIL.validate_python(text))
    except ValidationError:
        return None


def _truthy_cancelled(raw: str) -> bool:
    return raw.strip().lower() in _CANCELLED_VALUES


def map_columns(
    headers: Sequence[str], override: Mapping[str, str] | None = None
) -> tuple[dict[str, str], list[str]]:
    """Field name -> header in the file, and the headers nobody uses.

    Raises :class:`AcuityImportError` when a required field has no column, when
    an override names a field the importer does not know, or names a header the
    file does not have.
    """
    by_key: dict[str, str] = {}
    for header in headers:
        by_key.setdefault(_key(header), header)
    mapping: dict[str, str] = {}
    for name, header in (override or {}).items():
        if name not in FIELD_ALIASES:
            raise AcuityImportError(f"Unknown field in --column-map: {name}")
        found = by_key.get(_key(header))
        if found is None:
            raise AcuityImportError(
                f"--column-map names a column that is not in the file: {header}"
            )
        mapping[name] = found
    for name, aliases in FIELD_ALIASES.items():
        if name in mapping:
            continue
        for alias in aliases:
            found_header = by_key.get(alias)
            if found_header is not None and found_header not in mapping.values():
                mapping[name] = found_header
                break
    missing = [name for name in REQUIRED_FIELDS if name not in mapping]
    if missing:
        raise AcuityImportError(
            "The file has no column for: "
            + ", ".join(missing)
            + ". Use --column-map to name the columns."
        )
    used = set(mapping.values())
    unknown = [h for h in headers if h.strip() and h not in used]
    return mapping, unknown


def _parse_since(text: str | None, zone: ZoneInfo) -> datetime:
    if text is None:
        return utc_now()
    parsed = parse_local_time(text, zone)
    if parsed is None:
        raise AcuityImportError(
            "--since must be a date (2026-12-01) or a date and time"
        )
    return parsed


class _ServiceMatcher:
    """Exact name, then case-insensitive, then ``--service-map``. Never a guess."""

    def __init__(
        self, services: Sequence[Service], service_map: Mapping[str, str] | None
    ):
        self._exact = {s.name: s for s in services}
        self._folded: dict[str, list[Service]] = {}
        for service in services:
            self._folded.setdefault(service.name.casefold(), []).append(service)
        self._mapped: dict[str, Service] = {}
        for source, target in (service_map or {}).items():
            found = self._lookup(target)
            if found is None:
                raise AcuityImportError(
                    f"--service-map sends a name to one that is not a service of this "
                    f"business: {target}"
                )
            self._mapped[_squash(source).casefold()] = found

    def _lookup(self, name: str) -> Service | None:
        text = _squash(name)
        if text in self._exact:
            return self._exact[text]
        matches = self._folded.get(text.casefold(), [])
        return matches[0] if len(matches) == 1 else None

    def match(self, name: str) -> Service | None:
        if not _squash(name):
            return None
        found = self._lookup(name)
        if found is not None:
            return found
        return self._mapped.get(_squash(name).casefold())


def _match_staff(
    calendar: str, providers: Sequence[Provider]
) -> tuple[Provider | None, str | None]:
    """The provider for a Calendar name, or the reason it has none."""
    if not _squash(calendar):
        active = [p for p in providers if p.active]
        if len(active) == 1:
            return active[0], None
        return None, R_NO_STAFF
    text = _squash(calendar)
    exact = [p for p in providers if p.name == text]
    folded = [p for p in providers if p.name.casefold() == text.casefold()]
    matches = exact or folded
    if len(matches) == 1 and matches[0].active:
        return matches[0], None
    return None, R_UNKNOWN_STAFF


# --- database ----------------------------------------------------------------------------


class _Importer:
    def __init__(
        self,
        session: AsyncSession,
        profile: BookingProfile,
        services: Sequence[Service],
        providers: Sequence[Provider],
        options: ImportOptions,
        since: datetime,
        now: datetime,
        already: set[str],
    ) -> None:
        self.session = session
        self.profile = profile
        self.zone = ZoneInfo(profile.timezone)
        self.providers = providers
        self.options = options
        self.since = since
        self.now = now
        self.already = already
        self.seen: set[str] = set()
        self.services = _ServiceMatcher(services, options.service_map)
        self.report = ImportReport(notify=options.notify)

    async def run(
        self, reader: csv.DictReader[str], mapping: Mapping[str, str]
    ) -> ImportReport:
        rows = iter(reader)
        number = 0
        while True:
            number += 1
            try:
                raw = next(rows)
            except StopIteration:
                break
            except csv.Error as error:
                # Only the row number and the error class: never the line's text.
                raise AcuityImportError(
                    f"Row {number} is not valid CSV ({type(error).__name__})"
                ) from None
            self.report.rows_read += 1
            values = {
                name: (raw.get(header) or "").replace("\x00", "").strip()
                for name, header in mapping.items()
            }
            await self._row(number, values)
        if self.options.strict and self.report.overlaps:
            self.report.aborted = True
        return self.report

    async def _row(self, number: int, values: dict[str, str]) -> None:
        report = self.report
        appointment = values.get("appointment_id", "")
        if not appointment:
            return report.skip(R_NO_ID, number)
        if len(appointment) > MAX_APPOINTMENT_ID_LENGTH:
            return report.skip(R_BAD_ID, number)
        key = f"{ACUITY_PREFIX}{appointment}"
        starts_at = parse_local_time(values.get("start"), self.zone)
        if starts_at is not None and starts_at >= self.since:
            report.future += 1  # every row in the future, cancelled or repeated
        if key in self.already:
            report.already_imported.append(number)
            return
        if key in self.seen:
            return report.skip(R_DUPLICATE, number)
        self.seen.add(key)

        if starts_at is None:
            return report.skip(R_BAD_TIME, number)
        if _truthy_cancelled(values.get("canceled", "")):
            return report.skip(R_CANCELLED, number)
        if starts_at < self.since:
            return report.skip(R_PAST, number)

        service_name = _squash(values.get("service", ""))
        svc = self.services.match(service_name)
        if svc is None:
            _count_unmatched(report.unknown_services, service_name)
            return report.skip(R_UNKNOWN_SERVICE, number)
        if not svc.active:
            return report.skip(R_INACTIVE_SERVICE, number)

        provider, reason = _match_staff(values.get("calendar", ""), self.providers)
        if provider is None:
            if reason == R_UNKNOWN_STAFF:
                _count_unmatched(report.unknown_staff, values.get("calendar", ""))
            return report.skip(reason or R_NO_STAFF, number)

        raw_email = values.get("email", "")
        email = _valid_email(raw_email)
        if raw_email and email is None:
            report.invalid_emails.append(number)
        raw_phone = values.get("phone", "")
        key_phone = phone_key(raw_phone, self.options.local_area_code)
        if email is None and key_phone is None:
            return report.skip(R_MISSING_CONTACT, number)
        name = (
            " ".join(
                part
                for part in (values.get("first_name"), values.get("last_name"))
                if part
            )
            or values.get("name")
            or None
        )
        if len(raw_email) > EMAIL_MAX:
            return report.skip(R_EMAIL_TOO_LONG, number)
        if len(raw_phone) > PHONE_MAX:
            return report.skip(R_PHONE_TOO_LONG, number)
        if name is not None and len(name) > NAME_MAX:
            return report.skip(R_NAME_TOO_LONG, number)

        ends_at = starts_at + timedelta(minutes=svc.duration_min)
        blocked_from = starts_at - timedelta(minutes=svc.buffer_before_min)
        blocked_until = ends_at + timedelta(minutes=svc.buffer_after_min)
        acuity_end = parse_local_time(values.get("end"), self.zone)
        if acuity_end is not None and acuity_end != ends_at:
            report.end_differs.append(number)

        try:
            async with self.session.begin_nested():
                if await self._overlaps(provider.id, blocked_from, blocked_until):
                    report.overlaps.append(number)
                    return
                contact, reason, created = await self._contact(
                    email,
                    key_phone,
                    name,
                    key_phone or (raw_phone or None),
                )
                if contact is None:
                    return report.skip(reason or R_AMBIGUOUS_CONTACT, number)
                customer = await public.customer_for_contact(
                    self.session, self.profile.organisation_id, contact, self.now
                )
                _token, token_hash = public.new_manage_token()
                booking = Booking(
                    organisation_id=self.profile.organisation_id,
                    provider_id=provider.id,
                    service_id=svc.id,
                    customer_id=customer.id,
                    starts_at=starts_at,
                    ends_at=ends_at,
                    blocked_from=blocked_from,
                    blocked_until=blocked_until,
                    status=BookingStatus.CONFIRMED.value,
                    source=BookingSource.STUDIO.value,
                    price_minor=svc.price_minor,
                    deposit_minor=0,
                    currency=self.profile.currency,
                    notes=clip_notes(values.get("notes", "")),
                    manage_token_hash=token_hash,
                    idempotency_key=key,
                )
                self.session.add(booking)
                await self.session.flush()
        except DBAPIError as error:
            # The savepoint is rolled back. Only the class name is reported: the
            # statement and its parameters (customer text) never are.
            if booking_service.is_overlap_violation(error):
                report.overlaps.append(number)
            else:
                report.skip(
                    f"database refused the row ({type(error.orig).__name__})", number
                )
            return

        if created:
            report.contacts_created += 1
        else:
            report.contacts_reused += 1
        public.record_event(
            self.session, booking, None, BookingStatus.CONFIRMED, note=HISTORY_NOTE
        )
        report.created_rows.append(number)
        if self.options.notify and contact.email:
            managed = public.Managed(
                booking, self.profile, svc, provider, customer, contact
            )
            await public.queue_customer_email(
                self.session,
                managed,
                emails.customer_received(public.build_mail(managed), confirmed=True),
                f"booking-confirmation:{booking.id}",
            )
            report.emails_queued += 1

    async def _overlaps(
        self, provider_id: uuid.UUID, start: datetime, end: datetime
    ) -> bool:
        hit = await self.session.scalar(
            select(Booking.id)
            .where(
                Booking.provider_id == provider_id,
                Booking.status.in_([s.value for s in ACTIVE_STATUSES]),
                Booking.blocked_from < end,
                Booking.blocked_until > start,
            )
            .limit(1)
        )
        return hit is not None

    async def _phone_matches(self, key: str, name: str | None) -> list[Contact]:
        """Contacts with this phone and this full name (compared with :func:`name_key`).

        Shared phones are common (a family's landline), so a phone never decides
        who a booking belongs to on its own. A row without a name, or whose name
        differs, matches nothing and gets a new contact.
        """
        wanted = name_key(name)
        if not wanted:
            return []
        digits = func.regexp_replace(Contact.phone, "[^0-9]", "", "g")
        candidates = await self.session.scalars(
            select(Contact).where(
                Contact.organisation_id == self.profile.organisation_id,
                Contact.erased_at.is_(None),
                Contact.phone.is_not(None),
                func.right(digits, 7) == key[-7:],
            )
        )
        return [
            c
            for c in candidates
            if phone_key(c.phone, self.options.local_area_code) == key
            and name_key(c.name) == wanted
        ]

    async def _contact(
        self,
        email: str | None,
        key_phone: str | None,
        name: str | None,
        phone: str | None,
    ) -> tuple[Contact | None, str | None, bool]:
        """``(contact, skip reason, created)``.

        Email first (the address is the identity). A row without an email may
        reuse the one contact that has its phone and full name. Anything else is
        a new contact, and a phone-matched contact never receives an email.
        """
        org = self.profile.organisation_id
        if email:
            existing = await contacts_service.find_by_email(self.session, org, email)
            if existing is not None:
                if existing.erased_at is not None:
                    # An erased person is not revived by an import.
                    return None, R_ERASED_CONTACT, False
                contact = await contacts_service.upsert_contact(
                    self.session,
                    org,
                    email=email,
                    name=name,
                    phone=phone,
                    source=CONTACT_SOURCE,
                )
                return contact, None, False
        elif key_phone:
            matches = await self._phone_matches(key_phone, name)
            if len(matches) > 1:
                return None, R_AMBIGUOUS_CONTACT, False
            if matches:
                return matches[0], None, False
        if email:
            contact = await contacts_service.upsert_contact(
                self.session,
                org,
                email=email,
                name=name,
                phone=phone,
                source=CONTACT_SOURCE,
            )
            return contact, None, True
        contact = await contacts_service.create_without_email(
            self.session, org, name=name, phone=phone, source=CONTACT_SOURCE
        )
        return contact, None, True


async def import_csv(
    session: AsyncSession,
    *,
    business_slug: str,
    csv_text: str,
    options: ImportOptions,
    now: datetime | None = None,
) -> ImportReport:
    """Read the export and write what it can, in the session's transaction.

    Flushes only. :func:`run_import` decides whether the transaction is kept.
    """
    moment = now or utc_now()
    profile = await session.scalar(
        select(BookingProfile).where(BookingProfile.public_slug == business_slug)
    )
    if profile is None:
        raise AcuityImportError(f"No booking profile with the slug {business_slug!r}")
    zone = ZoneInfo(profile.timezone)
    since = _parse_since(options.since, zone)
    reader = csv.DictReader(io.StringIO(csv_text.replace("\x00", "")))
    mapping, unknown = map_columns(reader.fieldnames or [], options.column_map)
    services = list(
        await session.scalars(
            select(Service).where(Service.organisation_id == profile.organisation_id)
        )
    )
    providers = list(
        await session.scalars(
            select(Provider).where(Provider.organisation_id == profile.organisation_id)
        )
    )
    imported_keys = await session.scalars(
        select(Booking.idempotency_key).where(
            Booking.organisation_id == profile.organisation_id,
            Booking.idempotency_key.startswith(ACUITY_PREFIX),
        )
    )
    already = {key for key in imported_keys if key is not None}
    importer = _Importer(
        session, profile, services, providers, options, since, moment, already
    )
    importer.report.unknown_headers = unknown
    importer.report.column_map = dict(mapping)
    importer.report.target = (
        f"environment {settings.ENVIRONMENT}, database host {settings.POSTGRES_SERVER}, "
        f"business {profile.display_name!r}, organisation {profile.organisation_id}"
    )
    return await importer.run(reader, mapping)


async def run_import(
    session: AsyncSession,
    *,
    business_slug: str,
    csv_text: str,
    options: ImportOptions,
    apply: bool,
    now: datetime | None = None,
    confirm_production: bool = False,
    expect_count: int | None = None,
    announce: Callable[[str], None] | None = None,
) -> ImportReport:
    """Import, then keep the writes only when ``apply`` is set and every guard
    passes. Otherwise everything is rolled back.

    Guards on apply: outside the ``local`` environment it needs
    ``confirm_production``; ``expect_count`` must equal the number of bookings the
    run would create (pass the number from the dry run). ``announce`` receives the
    target line before anything is saved.
    """
    report = await import_csv(
        session,
        business_slug=business_slug,
        csv_text=csv_text,
        options=options,
        now=now,
    )
    if announce is not None:
        announce(f"Target: {report.target}")
    try:
        if apply and settings.ENVIRONMENT != "local" and not confirm_production:
            raise AcuityImportError(
                f"This is the {settings.ENVIRONMENT} database. Add --confirm-production "
                "to save here; nothing was saved."
            )
        if apply and expect_count is not None and report.created != expect_count:
            raise AcuityImportError(
                f"--expect-count is {expect_count} but this run would create "
                f"{report.created} bookings; nothing was saved."
            )
    except AcuityImportError:
        await session.rollback()
        raise
    if apply and not report.aborted:
        await session.commit()
        report.applied = True
    else:
        await session.rollback()
    logger.info(
        "acuity import finished",
        extra={
            "created_count": report.created,
            "already_imported": len(report.already_imported),
            "overlaps": len(report.overlaps),
            "applied": report.applied,
        },
    )
    return report


# --- command line ----------------------------------------------------------------------


def _json_arg(value: str) -> dict[str, str]:
    """A JSON object of strings, given inline or as ``@path``."""
    text = value
    if value.startswith("@"):
        try:
            text = Path(value[1:]).read_text(encoding="utf-8")
        except OSError as error:
            raise argparse.ArgumentTypeError(f"cannot read {value[1:]}") from error
    try:
        data: Any = json.loads(text)
    except ValueError as error:
        raise argparse.ArgumentTypeError("expected a JSON object of strings") from error
    if not isinstance(data, dict) or not all(
        isinstance(k, str) and isinstance(v, str) for k, v in data.items()
    ):
        raise argparse.ArgumentTypeError("expected a JSON object of strings")
    return data


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--file", required=True, help="The Acuity export (CSV)")
    parser.add_argument(
        "--business", required=True, help="The booking profile's public slug"
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--dry-run", action="store_true", help="Report only (the default)"
    )
    mode.add_argument("--apply", action="store_true", help="Save the bookings")
    parser.add_argument("--column-map", type=_json_arg, metavar="JSON|@FILE")
    parser.add_argument("--service-map", type=_json_arg, metavar="JSON|@FILE")
    parser.add_argument(
        "--since",
        default=None,
        help="Earliest start to import, e.g. 2026-12-01 (default: now)",
    )
    parser.add_argument(
        "--notify", action="store_true", help="Email each customer a confirmation"
    )
    parser.add_argument(
        "--strict", action="store_true", help="Stop the whole run if any row overlaps"
    )
    parser.add_argument("--local-area-code", default=LOCAL_AREA_CODE)
    parser.add_argument(
        "--encoding",
        default="utf-8-sig",
        help="The export's text encoding (default UTF-8, with or without a BOM)",
    )
    parser.add_argument(
        "--confirm-production",
        action="store_true",
        help="Required with --apply on any database outside the local environment",
    )
    parser.add_argument(
        "--expect-count",
        type=int,
        default=None,
        metavar="N",
        help="With --apply: refuse unless exactly N bookings would be created "
        "(pass the count from the dry run)",
    )
    return parser


def _announce(line: str) -> None:
    sys.stderr.write(line + "\n")
    sys.stderr.flush()


async def _cli(args: argparse.Namespace, csv_text: str) -> int:
    from src.database import async_session_factory

    options = ImportOptions(
        since=args.since,
        column_map=args.column_map,
        service_map=args.service_map,
        notify=args.notify,
        strict=args.strict,
        local_area_code=args.local_area_code,
    )
    async with async_session_factory() as session:
        try:
            report = await run_import(
                session,
                business_slug=args.business,
                csv_text=csv_text,
                options=options,
                apply=args.apply,
                confirm_production=args.confirm_production,
                expect_count=args.expect_count,
                announce=_announce,
            )
        except AcuityImportError as error:
            raise SystemExit(f"Import refused: {error}") from error
        except DBAPIError as error:
            # Never the message or the statement: those can carry customer text.
            raise SystemExit(
                f"The database refused the import ({type(error.orig).__name__}); "
                "nothing was saved."
            ) from None
    sys.stdout.write(report.format() + "\n")
    return 1 if report.aborted else 0


def main() -> None:
    args = build_parser().parse_args()
    try:
        data = Path(args.file).read_bytes()
    except OSError as error:
        raise SystemExit(f"Cannot read the export: {error.strerror}") from error
    try:
        csv_text = read_export_text(data, args.encoding)
    except AcuityImportError as error:
        raise SystemExit(f"Import refused: {error}") from None
    raise SystemExit(asyncio.run(_cli(args, csv_text)))


if __name__ == "__main__":
    main()
