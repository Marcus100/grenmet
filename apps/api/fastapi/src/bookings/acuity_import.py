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
- A customer is matched by normalised email, else by phone (E.164), else a new
  contact is created (ADR-0028). An email-less contact is matched by phone only.
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
import uuid
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from src.contacts import service as contacts_service
from src.contacts.models import Contact
from src.utils.datetime import utc_now
from src.utils.email_hash import hash_email, normalise_email

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


class AcuityImportError(ValueError):
    """The file or the options cannot be used; nothing is written."""


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
    return ", ".join(f'"{name}" x{count}' for name, count in counter.items())


# --- pure helpers ----------------------------------------------------------------------


def _key(header: str) -> str:
    """A header compared without case, spaces or punctuation."""
    return re.sub(r"[^a-z0-9]", "", header.lower())


def _squash(text: str) -> str:
    return " ".join(text.split())


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
        for number, raw in enumerate(reader, start=1):
            self.report.rows_read += 1
            values = {
                name: (raw.get(header) or "").strip()
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
            report.unknown_services[service_name] = (
                report.unknown_services.get(service_name, 0) + 1
            )
            return report.skip(R_UNKNOWN_SERVICE, number)
        if not svc.active:
            return report.skip(R_INACTIVE_SERVICE, number)

        provider, reason = _match_staff(values.get("calendar", ""), self.providers)
        if provider is None:
            if reason == R_UNKNOWN_STAFF:
                calendar = _squash(values.get("calendar", ""))
                report.unknown_staff[calendar] = (
                    report.unknown_staff.get(calendar, 0) + 1
                )
            return report.skip(reason or R_NO_STAFF, number)

        email = _valid_email(values.get("email", ""))
        if values.get("email") and email is None:
            report.invalid_emails.append(number)
        key_phone = phone_key(values.get("phone"), self.options.local_area_code)
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

        ends_at = starts_at + timedelta(minutes=svc.duration_min)
        blocked_from = starts_at - timedelta(minutes=svc.buffer_before_min)
        blocked_until = ends_at + timedelta(minutes=svc.buffer_after_min)
        acuity_end = parse_local_time(values.get("end"), self.zone)
        if acuity_end is not None and acuity_end != ends_at:
            report.end_differs.append(number)
        if await self._overlaps(provider.id, blocked_from, blocked_until):
            return report.overlaps.append(number)

        contact, reason, created = await self._contact(
            email, key_phone, name, key_phone or (values.get("phone") or None)
        )
        if contact is None:
            return report.skip(reason or R_AMBIGUOUS_CONTACT, number)
        if created:
            report.contacts_created += 1
        else:
            report.contacts_reused += 1
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
            notes=values.get("notes") or None,
            manage_token_hash=token_hash,
            idempotency_key=key,
        )
        try:
            async with self.session.begin_nested():
                self.session.add(booking)
                await self.session.flush()
        except DBAPIError as error:
            if not booking_service.is_overlap_violation(error):
                raise
            return report.overlaps.append(number)

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

    async def _phone_matches(self, key: str) -> list[Contact]:
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
        ]

    async def _contact(
        self,
        email: str | None,
        key_phone: str | None,
        name: str | None,
        phone: str | None,
    ) -> tuple[Contact | None, str | None, bool]:
        """``(contact, skip reason, created)``. Email first, then phone, then new."""
        org = self.profile.organisation_id
        if email:
            existing = await contacts_service.find_by_email(self.session, org, email)
            if existing is not None:
                contact = await contacts_service.upsert_contact(
                    self.session,
                    org,
                    email=email,
                    name=name,
                    phone=phone,
                    source=CONTACT_SOURCE,
                )
                return contact, None, False
        if key_phone:
            matches = await self._phone_matches(key_phone)
            if len(matches) > 1:
                return None, R_AMBIGUOUS_CONTACT, False
            if matches:
                contact = matches[0]
                if email and contact.email_hash is None:
                    contact.email = email
                    contact.email_hash = hash_email(email)
                if name and not contact.name:
                    contact.name = name
                await self.session.flush()
                return contact, None, False
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
    reader = csv.DictReader(io.StringIO(csv_text))
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
    return await importer.run(reader, mapping)


async def run_import(
    session: AsyncSession,
    *,
    business_slug: str,
    csv_text: str,
    options: ImportOptions,
    apply: bool,
    now: datetime | None = None,
) -> ImportReport:
    """Import, then keep the writes only when ``apply`` is set and the run was
    not aborted by ``--strict``. Otherwise everything is rolled back."""
    report = await import_csv(
        session,
        business_slug=business_slug,
        csv_text=csv_text,
        options=options,
        now=now,
    )
    if apply and not report.aborted:
        await session.commit()
        report.applied = True
    else:
        await session.rollback()
    logger.info(
        "acuity import finished",
        extra={
            "created": report.created,
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
    return parser


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
            )
        except AcuityImportError as error:
            raise SystemExit(f"Import refused: {error}") from error
    sys.stdout.write(report.format() + "\n")
    return 1 if report.aborted else 0


def main() -> None:
    args = build_parser().parse_args()
    try:
        csv_text = Path(args.file).read_text(encoding="utf-8-sig")
    except OSError as error:
        raise SystemExit(f"Cannot read the export: {error.strerror}") from error
    raise SystemExit(asyncio.run(_cli(args, csv_text)))


if __name__ == "__main__":
    main()
