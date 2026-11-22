"""One-off import of future appointments from an Acuity Scheduling export.

Every name, email and phone in the fixture is invented. The database tests
check what the importer writes; the report must never carry a personal value.
"""

import uuid
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings import acuity_import
from src.bookings import service as booking_service
from src.bookings.acuity_import import (
    ACUITY_PREFIX,
    AcuityImportError,
    ImportOptions,
    ImportReport,
    build_parser,
    map_columns,
    parse_local_time,
    phone_key,
    run_import,
)
from src.bookings.models import Booking, BookingEvent, BookingStatus, Customer
from src.bookings.schemas import (
    BookingProfileUpdate,
    BookingProviderCreate,
    BookingServiceCreate,
)
from src.contacts import service as contacts_service
from src.contacts.models import Contact
from tests.bookings.test_public_bookings import _emails
from tests.organisations.support import make_org

FIXTURE = Path(__file__).parent / "fixtures" / "acuity_sample.csv"
GRENADA = ZoneInfo("America/Grenada")
SINCE = "2026-12-01T00:00:00-04:00"


# --- pure functions ------------------------------------------------------------------


def test_acuity_formats_are_read_in_grenada_time_and_stored_as_utc() -> None:
    assert parse_local_time("December 3, 2026 10:00 am", GRENADA) == datetime(
        2026, 12, 3, 14, 0
    )
    assert parse_local_time("december 3, 2026 1:00 PM", GRENADA) == datetime(
        2026, 12, 3, 17, 0
    )
    assert parse_local_time("Dec 3, 2026 9:30 am", GRENADA) == datetime(
        2026, 12, 3, 13, 30
    )
    assert parse_local_time("2026-12-02 14:00", GRENADA) == datetime(2026, 12, 2, 18, 0)


def test_midnight_across_the_date_line_moves_to_the_next_utc_day() -> None:
    # Grenada is UTC-4 all year: 00:30 on 1 Dec is 04:30 UTC on 1 Dec, and
    # 23:30 on 30 Nov is 03:30 UTC on 1 Dec.
    assert parse_local_time("December 1, 2026 12:30 am", GRENADA) == datetime(
        2026, 12, 1, 4, 30
    )
    assert parse_local_time("November 30, 2026 11:30 pm", GRENADA) == datetime(
        2026, 12, 1, 3, 30
    )


def test_an_explicit_offset_is_honoured_and_bad_text_is_refused() -> None:
    assert parse_local_time("2026-12-02T14:00:00-04:00", GRENADA) == datetime(
        2026, 12, 2, 18, 0
    )
    assert parse_local_time("2026-12-02T14:00:00Z", GRENADA) == datetime(
        2026, 12, 2, 14, 0
    )
    assert parse_local_time("Soon-ish", GRENADA) is None
    assert parse_local_time("", GRENADA) is None


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("(473) 555-0101", "+14735550101"),
        ("473-555-0102", "+14735550102"),
        ("555-0102", "+14735550102"),
        ("+1 473 555 0102", "+14735550102"),
        ("00 1 473 555 0102", "+14735550102"),
        ("1 473 555 0102", "+14735550102"),
        ("", None),
        (None, None),
        ("12", None),
    ],
)
def test_phone_numbers_compare_on_one_form(
    raw: str | None, expected: str | None
) -> None:
    assert phone_key(raw, "473") == expected


def test_headers_are_matched_by_alias_and_unknown_ones_are_listed() -> None:
    headers = [
        "Appointment ID",
        "Start Time",
        "First Name",
        "Last Name",
        "Phone",
        "Email",
        "Type",
        "Calendar",
        "Paid?",
        "Skin Type (intake)",
    ]
    mapping, unknown = map_columns(headers)
    assert mapping["appointment_id"] == "Appointment ID"
    assert mapping["start"] == "Start Time"
    assert mapping["service"] == "Type"
    assert mapping["email"] == "Email"
    assert unknown == ["Paid?", "Skin Type (intake)"]


def test_a_column_map_override_names_a_header_the_file_really_has() -> None:
    headers = ["ID", "When", "Client Mail", "Service Name"]
    mapping, unknown = map_columns(
        headers,
        {
            "appointment_id": "ID",
            "start": "When",
            "service": "Service Name",
            "email": "Client Mail",
        },
    )
    assert mapping["email"] == "Client Mail"
    assert unknown == []
    with pytest.raises(AcuityImportError, match="not in the file"):
        map_columns(headers, {"email": "Nope"})
    with pytest.raises(AcuityImportError, match="Unknown field"):
        map_columns(headers, {"shoe": "ID"})


def test_missing_required_columns_stop_before_any_row_is_read() -> None:
    with pytest.raises(AcuityImportError, match="appointment_id"):
        map_columns(["Start Time", "Type"])


def test_dry_run_is_the_default_and_apply_is_explicit() -> None:
    dry = build_parser().parse_args(["--file", "x.csv", "--business", "salon"])
    assert dry.apply is False
    applied = build_parser().parse_args(
        ["--file", "x.csv", "--business", "salon", "--apply"]
    )
    assert applied.apply is True


# --- database ------------------------------------------------------------------------


class Salon:
    def __init__(
        self,
        org_id: str,
        slug: str,
        service_ids: dict[str, uuid.UUID],
        provider_id: uuid.UUID,
    ) -> None:
        self.org_id = org_id
        self.slug = slug
        self.service_ids = service_ids
        self.provider_id = provider_id


async def _salon(db: AsyncSession) -> Salon:
    org = await make_org(
        db, f"Acuity salon {uuid.uuid4().hex[:6]}", apps=("bookings", "contacts")
    )
    slug = f"salon-{uuid.uuid4().hex[:10]}"
    await booking_service.upsert_profile(
        db,
        organisation_id=org.id,
        payload=BookingProfileUpdate(
            public_slug=slug,
            display_name="Acuity salon",
            enabled=True,
            timezone="America/Grenada",
            currency="XCD",
        ),
    )
    # (name, minutes, buffer after, price in minor units, active)
    specs = [
        ("Luxe Classic", 150, 15, 21000, True),
        ("Hybrid", 150, 15, 15000, True),
        ("Volume", 150, 15, 15000, True),
        ("Lash touch-up", 60, 0, 6500, True),
        ("Chin", 30, 0, 2500, True),
        ("Refill, 2–3 weeks", 120, 0, 13000, True),
        ("Retired Cut", 30, 0, 3000, False),
    ]
    service_ids: dict[str, uuid.UUID] = {}
    for name, minutes, buffer_after, price, active in specs:
        created = await booking_service.create_service(
            db,
            organisation_id=org.id,
            payload=BookingServiceCreate(
                name=name,
                duration_min=minutes,
                buffer_after_min=buffer_after,
                price_minor=price,
                active=active,
            ),
        )
        service_ids[name] = created.id
    provider = await booking_service.create_provider(
        db,
        organisation_id=org.id,
        payload=BookingProviderCreate(
            name="Jeriann", service_ids=list(service_ids.values())
        ),
    )
    await db.commit()
    return Salon(org.id, slug, service_ids, provider["id"])


def _fixture() -> str:
    return FIXTURE.read_text(encoding="utf-8-sig")


async def _run(
    db: AsyncSession,
    salon: Salon,
    *,
    apply: bool,
    csv_text: str | None = None,
    since: str = SINCE,
    confirm_production: bool = False,
    **options: Any,
) -> ImportReport:
    return await run_import(
        db,
        business_slug=salon.slug,
        csv_text=csv_text if csv_text is not None else _fixture(),
        options=ImportOptions(since=since, **options),
        apply=apply,
        confirm_production=confirm_production,
    )


async def _bookings(db: AsyncSession, org_id: str) -> list[Booking]:
    return list(
        await db.scalars(
            select(Booking)
            .where(Booking.organisation_id == org_id)
            .execution_options(populate_existing=True)
        )
    )


async def _contacts(db: AsyncSession, org_id: str) -> list[Contact]:
    return list(
        await db.scalars(
            select(Contact)
            .where(Contact.organisation_id == org_id)
            .execution_options(populate_existing=True)
        )
    )


async def _booking_by_appointment(
    db: AsyncSession, org_id: str, appointment_id: str
) -> Booking:
    booking = await db.scalar(
        select(Booking).where(
            Booking.organisation_id == org_id,
            Booking.idempotency_key == f"{ACUITY_PREFIX}{appointment_id}",
        )
    )
    assert booking is not None
    return booking


async def test_dry_run_reports_what_it_would_do_and_writes_nothing(
    db_async: AsyncSession,
) -> None:
    salon = await _salon(db_async)
    report = await _run(db_async, salon, apply=False)

    assert report.applied is False
    assert report.rows_read == 16
    assert report.future == 14
    assert report.created == 7
    assert sorted(report.skipped) == [
        "bad time",
        "cancelled",
        "duplicate in file",
        "missing contact",
        "past",
        "service inactive",
        "unknown service",
        "unknown staff",
    ]
    assert report.overlaps == [14]
    assert await _bookings(db_async, salon.org_id) == []
    assert await _contacts(db_async, salon.org_id) == []
    assert await _emails(db_async, salon.org_id) == []


async def test_apply_creates_confirmed_bookings_and_contacts(
    db_async: AsyncSession,
) -> None:
    salon = await _salon(db_async)
    report = await _run(db_async, salon, apply=True)

    assert report.applied is True
    assert report.created == 7
    assert report.contacts_created == 6
    # Row 1004 finds row 1003's email-less contact by phone.
    assert report.contacts_reused == 1
    bookings = await _bookings(db_async, salon.org_id)
    assert len(bookings) == 7
    assert {b.status for b in bookings} == {BookingStatus.CONFIRMED.value}
    # Staff-entered: the value the app already uses for bookings the business enters.
    assert {b.source for b in bookings} == {"studio"}
    assert all(b.manage_token_hash for b in bookings)
    assert all(b.deposit_minor == 0 for b in bookings)


async def test_the_booking_keeps_its_acuity_reference_and_history(
    db_async: AsyncSession,
) -> None:
    salon = await _salon(db_async)
    await _run(db_async, salon, apply=True)

    gus = await _booking_by_appointment(db_async, salon.org_id, "1008")
    # 00:30 on 1 December in Grenada is 04:30 UTC, stored as UTC.
    assert gus.starts_at == datetime(2026, 12, 1, 4, 30)
    assert gus.ends_at == datetime(2026, 12, 1, 5, 0)
    assert gus.blocked_from == gus.starts_at
    assert gus.blocked_until == gus.ends_at
    assert gus.price_minor == 2500
    hal = await _booking_by_appointment(db_async, salon.org_id, "1009")
    assert hal.starts_at == datetime(2026, 12, 2, 18, 0)

    events = list(
        await db_async.scalars(
            select(BookingEvent).where(BookingEvent.booking_id == gus.id)
        )
    )
    assert [e.note for e in events] == ["Imported from Acuity"]
    assert events[0].actor_user_id is None


async def test_buffers_are_kept_in_the_blocked_range(db_async: AsyncSession) -> None:
    salon = await _salon(db_async)
    await _run(db_async, salon, apply=True)
    ada = await _booking_by_appointment(db_async, salon.org_id, "1001")
    # Luxe Classic: 150 minutes, then 15 minutes kept free.
    assert (ada.ends_at - ada.starts_at).total_seconds() == 150 * 60
    assert (ada.blocked_until - ada.ends_at).total_seconds() == 15 * 60
    assert ada.blocked_from == ada.starts_at


async def test_a_rerun_creates_nothing(db_async: AsyncSession) -> None:
    salon = await _salon(db_async)
    await _run(db_async, salon, apply=True)
    again = await _run(db_async, salon, apply=True)

    assert again.created == 0
    # Seven imported rows, plus row 10: it repeats appointment 1001, now imported.
    assert len(again.already_imported) == 8
    assert len(await _bookings(db_async, salon.org_id)) == 7
    assert len(await _contacts(db_async, salon.org_id)) == 6


async def test_an_email_less_contact_is_matched_by_phone(
    db_async: AsyncSession,
) -> None:
    salon = await _salon(db_async)
    await _run(db_async, salon, apply=True)

    first = await _booking_by_appointment(db_async, salon.org_id, "1003")
    second = await _booking_by_appointment(db_async, salon.org_id, "1004")
    assert first.customer_id == second.customer_id
    without_email = [
        c for c in await _contacts(db_async, salon.org_id) if c.email is None
    ]
    assert len(without_email) == 1


async def test_an_existing_contact_with_the_same_email_is_reused(
    db_async: AsyncSession,
) -> None:
    salon = await _salon(db_async)
    existing = await contacts_service.upsert_contact(
        db_async,
        salon.org_id,
        email="ada@example.com",
        name="Ada Example",
        source="bookings",
    )
    await db_async.commit()

    await _run(db_async, salon, apply=True)

    ada = await _booking_by_appointment(db_async, salon.org_id, "1001")
    customer = await db_async.scalar(
        select(Customer).where(Customer.id == ada.customer_id)
    )
    assert customer is not None
    assert customer.contact_id == existing.id
    same_email = [
        c
        for c in await _contacts(db_async, salon.org_id)
        if c.email == "ada@example.com"
    ]
    assert len(same_email) == 1


async def test_notify_off_queues_no_email_and_notify_on_queues_one_per_emailed_booking(
    db_async: AsyncSession,
) -> None:
    quiet_salon = await _salon(db_async)
    quiet = await _run(db_async, quiet_salon, apply=True)
    assert quiet.emails_queued == 0
    assert await _emails(db_async, quiet_salon.org_id) == []

    loud_salon = await _salon(db_async)
    loud = await _run(db_async, loud_salon, apply=True, notify=True)
    # Seven bookings; the two for the email-less contact send nothing, so five.
    assert loud.emails_queued == 5
    emails = await _emails(db_async, loud_salon.org_id)
    assert len(emails) == 5
    assert all(e.dedupe_key.startswith("booking-confirmation:") for e in emails)


async def test_each_skipped_row_has_a_reason_and_its_row_number(
    db_async: AsyncSession,
) -> None:
    salon = await _salon(db_async)
    report = await _run(db_async, salon, apply=True)

    assert report.skipped["cancelled"] == [5]
    assert report.skipped["past"] == [6]
    assert report.skipped["unknown service"] == [7]
    assert report.skipped["bad time"] == [11]
    assert report.skipped["missing contact"] == [12]
    assert report.skipped["unknown staff"] == [13]
    assert report.skipped["service inactive"] == [15]
    assert report.skipped["duplicate in file"] == [10]
    assert report.unknown_services == Counter({"Mystery Facial": 1})
    assert report.unknown_staff == Counter({"Nobody": 1})
    assert "Skin Type (intake)" in report.unknown_headers


async def test_an_overlap_is_reported_and_only_that_row_is_left_out(
    db_async: AsyncSession,
) -> None:
    salon = await _salon(db_async)
    report = await _run(db_async, salon, apply=True)

    assert report.overlaps == [14]
    assert report.created == 7
    assert len(await _bookings(db_async, salon.org_id)) == 7


async def test_strict_refuses_the_whole_run_when_anything_overlaps(
    db_async: AsyncSession,
) -> None:
    salon = await _salon(db_async)
    report = await _run(db_async, salon, apply=True, strict=True)

    assert report.aborted is True
    assert report.overlaps == [14]
    assert await _bookings(db_async, salon.org_id) == []
    assert await _contacts(db_async, salon.org_id) == []


async def test_service_map_is_the_last_resort_for_a_name_that_does_not_match(
    db_async: AsyncSession,
) -> None:
    salon = await _salon(db_async)
    report = await _run(
        db_async, salon, apply=False, service_map={"Mystery Facial": "Chin"}
    )
    assert report.created == 8
    assert "unknown service" not in report.skipped
    assert report.unknown_services == Counter()


async def test_a_service_map_naming_an_unknown_service_is_a_config_error(
    db_async: AsyncSession,
) -> None:
    salon = await _salon(db_async)
    with pytest.raises(AcuityImportError, match="not a service"):
        await _run(db_async, salon, apply=False, service_map={"Mystery Facial": "Nope"})


async def test_column_map_lets_renamed_headers_be_read(db_async: AsyncSession) -> None:
    salon = await _salon(db_async)
    csv_text = (
        "ID,When,Client Mail,Service Name,Calendar\n"
        '1101,"December 9, 2026 9:00 am",renamed@example.com,Chin,Jeriann\n'
    )
    # Without the override the file has no start-time column: refused, nothing read.
    with pytest.raises(AcuityImportError, match="start"):
        await _run(db_async, salon, apply=False, csv_text=csv_text)

    mapped = await _run(
        db_async,
        salon,
        apply=False,
        csv_text=csv_text,
        column_map={
            "appointment_id": "ID",
            "start": "When",
            "email": "Client Mail",
            "service": "Service Name",
            "calendar": "Calendar",
        },
    )
    assert mapped.created == 1


async def test_the_report_never_prints_a_personal_value(db_async: AsyncSession) -> None:
    salon = await _salon(db_async)
    report = await _run(db_async, salon, apply=True)
    text = report.format()
    for personal in (
        "Ada",
        "Example",
        "Bea",
        "Sample",
        "ada@example.com",
        "555-0101",
        "0102",
    ):
        assert personal not in text
    assert "Rows read: 16" in text
    assert "Created: 7" in text


async def test_an_earlier_since_brings_the_past_row_in(db_async: AsyncSession) -> None:
    salon = await _salon(db_async)
    earlier = await _run(db_async, salon, apply=True, since="2026-11-01T00:00:00-04:00")
    # The past row (Eve, 30 Nov) is a normal booking once --since reaches back.
    assert earlier.created == 8
    assert "past" not in earlier.skipped


async def test_invalid_since_text_is_refused_before_any_write(
    db_async: AsyncSession,
) -> None:
    salon = await _salon(db_async)
    with pytest.raises(AcuityImportError, match="--since"):
        await _run(db_async, salon, apply=True, since="next tuesday")
    assert await _bookings(db_async, salon.org_id) == []


async def test_unknown_business_slug_is_refused(db_async: AsyncSession) -> None:
    with pytest.raises(AcuityImportError, match="No booking profile"):
        await run_import(
            db_async,
            business_slug="no-such-salon",
            csv_text=_fixture(),
            options=ImportOptions(since=SINCE),
            apply=False,
        )


# --- review fixes: shared phones, bad input, guards, erased people --------------------

ROW_HEADER = (
    "Appointment ID,Start Time,First Name,Last Name,Phone,Email,Type,Calendar,"
    "Notes,Canceled\n"
)


def _rows(*lines: str) -> str:
    return ROW_HEADER + "".join(line + "\n" for line in lines)


async def test_a_shared_phone_with_another_email_makes_a_new_contact(
    db_async: AsyncSession,
) -> None:
    # Mother and daughter share a landline. The daughter's booking must not land
    # on the mother's contact, or the mother gets the daughter's reminders.
    salon = await _salon(db_async)
    csv_text = _rows(
        '2001,"December 3, 2026 10:00 am",Ana,Mother,473-555-0201,mother@example.com,Chin,Jeriann,,',
        '2002,"December 4, 2026 10:00 am",Bea,Daughter,473-555-0201,daughter@example.com,Chin,Jeriann,,',
        '2003,"December 5, 2026 10:00 am",Cy,Phoneonly,+1 473 555 0201,,Chin,Jeriann,,',
    )
    report = await _run(db_async, salon, apply=True, csv_text=csv_text)

    assert report.created == 2
    assert report.skipped["ambiguous contact"] == [3]
    mother = await _booking_by_appointment(db_async, salon.org_id, "2001")
    daughter = await _booking_by_appointment(db_async, salon.org_id, "2002")
    assert mother.customer_id != daughter.customer_id
    daughter_customer = await db_async.scalar(
        select(Customer).where(Customer.id == daughter.customer_id)
    )
    assert daughter_customer is not None
    contact = await db_async.get(Contact, daughter_customer.contact_id)
    assert contact is not None
    assert contact.email == "daughter@example.com"


async def test_the_same_phone_and_the_same_email_reuse_one_contact(
    db_async: AsyncSession,
) -> None:
    salon = await _salon(db_async)
    csv_text = _rows(
        '2011,"December 3, 2026 10:00 am",Ana,Mother,473-555-0201,mother@example.com,Chin,Jeriann,,',
        '2012,"December 4, 2026 10:00 am",Ana,Mother,+1 473 555 0201,Mother@Example.com,Chin,Jeriann,,',
    )
    report = await _run(db_async, salon, apply=True, csv_text=csv_text)

    assert report.created == 2
    assert report.contacts_created == 1
    assert report.contacts_reused == 1


async def test_an_over_long_name_or_phone_is_skipped_with_a_reason(
    db_async: AsyncSession,
) -> None:
    salon = await _salon(db_async)
    long_name = "N" * 300
    csv_text = _rows(
        f'2021,"December 3, 2026 10:00 am",{long_name},Long,,long@example.com,Chin,Jeriann,,',
        '2022,"December 4, 2026 10:00 am",Ok,Name,1'
        + "2" * 45
        + ",ok@example.com,Chin,Jeriann,,",
    )
    report = await _run(db_async, salon, apply=True, csv_text=csv_text)

    assert report.skipped["name too long"] == [1]
    assert report.skipped["phone too long"] == [2]
    assert report.created == 0
    assert await _bookings(db_async, salon.org_id) == []


async def test_a_nul_byte_is_removed_and_the_row_still_imports(
    db_async: AsyncSession,
) -> None:
    salon = await _salon(db_async)
    csv_text = _rows(
        '2031,"December 3, 2026 10:00 am",A\x00da,Example,,ada2@example.com,Chin,Jeriann,Note\x00 here,',
    )
    report = await _run(db_async, salon, apply=True, csv_text=csv_text)

    assert report.created == 1
    booking = await _booking_by_appointment(db_async, salon.org_id, "2031")
    assert booking.notes == "Note here"
    contact = await contacts_service.find_by_email(
        db_async, salon.org_id, "ada2@example.com"
    )
    assert contact is not None
    assert contact.name == "Ada Example"


def test_a_latin_1_export_is_refused_with_a_clear_encoding_message() -> None:
    latin1 = "Appointment ID,First Name\n1,José\n".encode("latin-1")
    with pytest.raises(AcuityImportError, match="encoding"):
        acuity_import.read_export_text(latin1, "utf-8-sig")
    assert "Jos" in acuity_import.read_export_text(latin1, "latin-1")
    with_bom = "﻿Appointment ID\n1\n".encode("utf-8")
    assert acuity_import.read_export_text(with_bom, "utf-8-sig").startswith(
        "Appointment ID"
    )


def test_unmatched_values_are_shown_only_when_they_cannot_identify_anyone() -> None:
    assert acuity_import.display_unmatched("Mystery Facial") == "Mystery Facial"
    assert acuity_import.display_unmatched("Client ada@example.com") == (
        "<redacted: check --column-map>"
    )
    assert acuity_import.display_unmatched("Call 4734401234") == (
        "<redacted: check --column-map>"
    )
    assert acuity_import.display_unmatched("x" * 61) == "<redacted: check --column-map>"


async def test_a_wrong_column_map_does_not_print_customer_text(
    db_async: AsyncSession,
) -> None:
    salon = await _salon(db_async)
    csv_text = _rows(
        '2041,"December 3, 2026 10:00 am",Ada,Example,,ada@example.com,ada@example.com,Jeriann,,',
    )
    report = await _run(db_async, salon, apply=False, csv_text=csv_text)

    assert report.created == 0
    text = report.format()
    assert "ada@example.com" not in text
    assert "<redacted: check --column-map>" in text


def test_notes_are_cut_to_the_limit_and_blank_notes_are_none() -> None:
    assert acuity_import.clip_notes("x" * 1500) == "x" * 1000
    assert acuity_import.clip_notes("\x00   ") is None


async def test_production_needs_confirm_production_and_prints_the_target(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    salon = await _salon(db_async)
    monkeypatch.setattr(acuity_import.settings, "ENVIRONMENT", "production")
    # Outside local, hashing refuses an empty pepper; the test supplies one.
    monkeypatch.setattr(acuity_import.settings, "EMAIL_HASH_PEPPER", "test-pepper")
    lines: list[str] = []

    with pytest.raises(AcuityImportError, match="--confirm-production"):
        await run_import(
            db_async,
            business_slug=salon.slug,
            csv_text=_fixture(),
            options=ImportOptions(since=SINCE),
            apply=True,
            announce=lines.append,
        )
    assert await _bookings(db_async, salon.org_id) == []
    assert lines and "environment production" in lines[0]
    assert salon.org_id in lines[0]

    report = await _run(db_async, salon, apply=True, confirm_production=True)
    assert report.applied is True
    assert report.created == 7


async def test_expect_count_refuses_a_run_that_would_create_another_number(
    db_async: AsyncSession,
) -> None:
    salon = await _salon(db_async)
    with pytest.raises(AcuityImportError, match="--expect-count is 6"):
        await run_import(
            db_async,
            business_slug=salon.slug,
            csv_text=_fixture(),
            options=ImportOptions(since=SINCE),
            apply=True,
            expect_count=6,
        )
    assert await _bookings(db_async, salon.org_id) == []

    report = await run_import(
        db_async,
        business_slug=salon.slug,
        csv_text=_fixture(),
        options=ImportOptions(since=SINCE),
        apply=True,
        expect_count=7,
    )
    assert report.applied is True


async def test_an_erased_person_is_skipped_and_not_revived(
    db_async: AsyncSession,
) -> None:
    salon = await _salon(db_async)
    contact = await contacts_service.upsert_contact(
        db_async,
        salon.org_id,
        email="erased@example.com",
        name="Gone Person",
        source="bookings",
    )
    await contacts_service.erase_contact(db_async, contact)
    await db_async.commit()

    csv_text = _rows(
        '2051,"December 3, 2026 10:00 am",Gone,Person,,erased@example.com,Chin,Jeriann,,',
    )
    report = await _run(db_async, salon, apply=True, csv_text=csv_text)

    assert report.skipped["erased contact"] == [1]
    assert await _bookings(db_async, salon.org_id) == []
    await db_async.refresh(contact)
    assert contact.erased_at is not None
    assert contact.email is None
