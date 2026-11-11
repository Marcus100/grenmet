"""Historical state: imported archive records (#1260, slice 1).

Never sent, never awaiting acceptance, reviewable and correctable; public as
recorded. Covers sends, review, correction and restore, the list date range and state
filter, review of a day at once, the importer's ``--historical`` save, the one-off
converter and the public status.
"""

from collections.abc import Callable
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth.browser import get_browser_or_token_user
from src.auth.models import User
from src.eregister import cl1_import, historical, public
from src.eregister.dependencies import get_session
from src.eregister.models import ERegisterSend
from src.main import app
from tests import test_eregister_cl1_import as cl1_tests
from tests import test_eregister_public as public_tests
from tests import test_eregister_send as send_tests
from tests.test_eregister_send import (
    FULL_ROW,
    OBS_URL,
    as_staff,
    qc_url,
    register_exec,
    register_rows,
    save,
    set_state,
)

send_client = send_tests.send_client
incoming = send_tests.incoming
recipients = send_tests.recipients
register_db = public_tests.register_db

REVIEW_DAY_URL = f"{OBS_URL}/review-day"
STATION = cl1_import.STATION_ID


@asynccontextmanager
async def register_session():
    async with asynccontextmanager(app.dependency_overrides[get_session])() as value:
        yield value


def ready_hours(*cell_sets: list[str]) -> list[tuple[datetime, Any, int]]:
    reports = cl1_tests.check(list(cell_sets))
    ready = [item for r in reports if (item := r.saveable()) is not None]
    assert len(ready) == len(cell_sets)
    return ready


async def import_hours(
    db: AsyncSession, actor: User, *cell_sets: list[str], state: str = "historical"
) -> historical.SaveOutcome:
    async with register_session() as register:
        return await historical.save_hours(
            register=register,
            app_session=db,
            actor=actor,
            ready=ready_hours(*cell_sets),
            state=state,  # type: ignore[arg-type]
        )


async def states() -> dict[str, str]:
    rows = await register_rows(
        "SELECT to_char(observed_at AT TIME ZONE 'UTC', 'DD HH24') AS at,"
        " state::text AS state FROM register_observations ORDER BY observed_at"
    )
    return {str(r["at"]): str(r["state"]) for r in rows}


# --- never sent, never in the acceptance queue ------------------------------------


@pytest.mark.parametrize("require_accepted", [True, False])
@pytest.mark.usefixtures("incoming", "recipients")
async def test_a_historical_record_is_never_sent(
    send_client: tuple[httpx.AsyncClient, User],
    monkeypatch: pytest.MonkeyPatch,
    require_accepted: bool,
) -> None:
    client, _ = send_client
    monkeypatch.setattr(
        send_tests.sends.eregister_settings, "SEND_REQUIRE_ACCEPTED", require_accepted
    )
    observation = await save(client)
    await set_state(observation, "historical")
    for action in ("email", "publish"):
        response = await client.post(f"{OBS_URL}/{observation}/{action}")
        assert response.status_code == 409, (action, response.text)
        assert response.json()["detail"] == "A historical observation cannot be sent"


async def test_historical_is_not_in_the_acceptance_queue(
    send_client: tuple[httpx.AsyncClient, User],
) -> None:
    client, _ = send_client
    observation = await save(client)
    await set_state(observation, "historical")
    queue = await client.get(OBS_URL, params={"state": "draft,qc_pending"})
    assert queue.json()["total"] == 0
    accept = await client.post(qc_url(observation, "accept"))
    assert accept.status_code == 409
    assert accept.json()["detail"] == "Cannot accept an observation that is historical"


# --- review, correct, restore ------------------------------------------------------


async def test_a_historical_record_can_be_reviewed_and_queried(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    client, _ = send_client
    observation = await save(client)
    await set_state(observation, "historical")
    await as_staff(db_async, "eregister.qc")
    bare = await client.post(qc_url(observation, "review"), json={"outcome": "query"})
    assert bare.status_code == 422
    done = await client.post(
        qc_url(observation, "review"),
        json={"outcome": "query", "note": "Check against the paper sheet"},
    )
    assert done.status_code == 200, done.text
    assert done.json()["state"] == "historical"
    assert done.json()["review_outcome"] == "query"


@pytest.mark.usefixtures("incoming", "recipients")
async def test_a_correction_of_a_historical_record_is_historical_and_never_sent(
    send_client: tuple[httpx.AsyncClient, User],
) -> None:
    client, _ = send_client
    original = await save(client)
    await set_state(original, "historical")
    fixed = {**FULL_ROW, "air_temp": "0290", "source": "eregister-workbook"}
    corrected = await client.post(
        qc_url(original, "correct"), json={"body": fixed, "reason": "typo"}
    )
    assert corrected.status_code == 201, corrected.text
    new = corrected.json()["id"]
    assert corrected.json()["state"] == "historical"
    assert corrected.json()["allowed_actions"] == ["correct"]
    listed = {
        o["id"]: o["state"] for o in (await client.get(OBS_URL)).json()["observations"]
    }
    assert listed == {original: "superseded", new: "historical"}
    accept = await client.post(qc_url(new, "accept"))
    assert accept.status_code == 409
    assert accept.json()["detail"] == "Cannot accept an observation that is historical"
    for action in ("email", "publish"):
        sent = await client.post(f"{OBS_URL}/{new}/{action}")
        assert sent.status_code == 409, (action, sent.text)
        assert sent.json()["detail"] == "A historical observation cannot be sent"


# --- list: date range and state filter ---------------------------------------------


async def test_list_filters_by_date_range_and_historical_state(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    _, user = send_client
    client = send_client[0]
    await import_hours(
        db_async,
        user,
        cl1_tests.cells(c2=1, c3=8),  # 1 Oct 12:00 UTC
        cl1_tests.cells(c2=2, c3=8),  # 2 Oct 12:00 UTC
        cl1_tests.cells(c2=3, c3=8),  # 3 Oct 12:00 UTC
    )
    rows = await register_rows(
        "SELECT id FROM register_observations ORDER BY observed_at"
    )
    await set_state(str(rows[2]["id"]), "draft")

    def listed(**params: str) -> Any:
        return client.get(OBS_URL, params={"station_id": STATION, **params})

    only = (await listed(state="historical")).json()
    assert only["total"] == 2
    window = (
        await listed(
            observed_from="2026-10-02T12:00:00Z", observed_to="2026-10-03T12:00:00Z"
        )
    ).json()
    # Inclusive start, exclusive end.
    assert [o["observed_at"] for o in window["observations"]] == [
        "2026-10-02T12:00:00Z"
    ]
    assert window["total"] == 1
    both = (
        await listed(
            state="historical,draft",
            observed_from="2026-10-02T12:00:00Z",
            limit="1",
        )
    ).json()
    assert both["total"] == 2 and len(both["observations"]) == 1
    assert (await listed(state="bogus")).status_code == 422


# --- review a day at once -----------------------------------------------------------


async def test_review_day_counts_skips_own_and_already_reviewed(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    client, importer = send_client
    await import_hours(
        db_async,
        importer,
        cl1_tests.cells(c2=1, c3=8),
        cl1_tests.cells(c2=1, c3=9),
        cl1_tests.cells(c2=1, c3=10),
        cl1_tests.cells(c2=1, c3=22),  # 02:00 UTC on 2 Oct, still 1 Oct local
        cl1_tests.cells(c2=2, c3=0),  # 2 Oct local: another day
    )
    # An accepted record on the same local day counts too.
    accepted = await register_rows(
        "SELECT id FROM register_observations WHERE observed_at = :at",
        at=datetime(2026, 10, 1, 13, tzinfo=UTC),
    )
    await set_state(str(accepted[0]["id"]), "accepted")
    reviewer = await as_staff(db_async, "eregister.qc")
    # The reviewer typed one of the day's records themselves, and one was reviewed.
    await register_exec(
        "UPDATE register_observations SET actor_id = :a WHERE observed_at = :at",
        a=str(reviewer.id),
        at=datetime(2026, 10, 1, 14, tzinfo=UTC),
    )
    await register_exec(
        "UPDATE register_observations SET review_outcome = 'reviewed', reviewed_at = now()"
        " WHERE observed_at = :at",
        at=datetime(2026, 10, 1, 12, tzinfo=UTC),
    )

    response = await client.post(
        REVIEW_DAY_URL,
        json={
            "station_id": STATION,
            "date": "2026-10-01",
            "outcome": "reviewed",
            "note": "Checked against the sheet",
        },
    )
    assert response.status_code == 200, response.text
    assert response.json() == {"reviewed": 2, "skipped_own": 1, "skipped_already": 1}
    marked = await register_rows(
        "SELECT to_char(observed_at AT TIME ZONE 'UTC', 'DD HH24') AS at, review_note,"
        " reviewed_by FROM register_observations WHERE reviewed_at IS NOT NULL"
        " AND review_note IS NOT NULL ORDER BY observed_at"
    )
    assert [r["at"] for r in marked] == ["01 13", "02 02"]
    assert {r["reviewed_by"] for r in marked} == {str(reviewer.id)}
    # The next day is untouched, and a second call finds nothing left to mark.
    other_day = await register_rows(
        "SELECT reviewed_at FROM register_observations WHERE observed_at = :at",
        at=datetime(2026, 10, 2, 4, tzinfo=UTC),
    )
    assert other_day[0]["reviewed_at"] is None
    again = await client.post(
        REVIEW_DAY_URL,
        json={"station_id": STATION, "date": "2026-10-01", "outcome": "reviewed"},
    )
    assert again.json() == {"reviewed": 0, "skipped_own": 1, "skipped_already": 3}
    # Each mark is audited, and the state is untouched.
    audit = (
        await db_async.scalars(
            select(AuditEntry).where(
                AuditEntry.action == "review",
                AuditEntry.actor_user_id == reviewer.id,
            )
        )
    ).all()
    assert len(audit) == 2
    assert (await states())["01 13"] == "accepted"
    assert (await states())["01 12"] == "historical"


async def test_review_day_needs_a_note_for_a_query_and_the_qc_permission(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    client, importer = send_client
    await import_hours(db_async, importer, cl1_tests.cells(c2=1, c3=8))
    body = {"station_id": STATION, "date": "2026-10-01", "outcome": "query"}
    await as_staff(db_async, "eregister.observe")
    assert (await client.post(REVIEW_DAY_URL, json=body)).status_code == 403
    await as_staff(db_async, "eregister.qc")
    assert (await client.post(REVIEW_DAY_URL, json=body)).status_code == 422
    done = await client.post(REVIEW_DAY_URL, json={**body, "note": "Odd wind"})
    assert done.status_code == 200, done.text
    assert done.json()["reviewed"] == 1
    bad = await client.post(REVIEW_DAY_URL, json={**body, "date": "10/01/2026"})
    assert bad.status_code == 422


async def test_review_day_requires_sign_in(
    send_client: tuple[httpx.AsyncClient, User],
) -> None:
    client, _ = send_client
    app.dependency_overrides.pop(get_browser_or_token_user)
    response = await client.post(
        REVIEW_DAY_URL,
        json={"station_id": STATION, "date": "2026-10-01", "outcome": "reviewed"},
    )
    assert response.status_code == 401


# --- the importer's --historical save ------------------------------------------------


async def test_importer_saves_historical_with_provenance_and_repeats_safely(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    _, importer = send_client
    first = await import_hours(
        db_async, importer, cl1_tests.cells(c3=8), cl1_tests.cells(c3=9)
    )
    assert (first.created, first.updated, first.failed) == (2, 0, [])
    assert set((await states()).values()) == {"historical"}
    notes = await register_rows(
        "SELECT body->>'notes' AS notes FROM register_observations"
    )
    assert all(
        str(r["notes"]).startswith(f"{cl1_import.IMPORT_NOTE_PREFIX}, row ")
        for r in notes
    )
    # Re-running refreshes the unreviewed historical rows in place: no duplicates.
    again = await import_hours(
        db_async, importer, cl1_tests.cells(c3=8), cl1_tests.cells(c3=9)
    )
    assert (again.created, again.updated, again.skipped) == (0, 2, [])
    assert len(await states()) == 2
    # A reviewed row is left alone and listed.
    await register_exec(
        "UPDATE register_observations SET review_outcome = 'reviewed' "
        "WHERE observed_at = :at",
        at=datetime(2026, 10, 1, 12, tzinfo=UTC),
    )
    third = await import_hours(db_async, importer, cl1_tests.cells(c3=8))
    assert third.updated == 0 and len(third.skipped) == 1
    # A plain (draft) run never turns a historical row back into a draft.
    plain = await import_hours(db_async, importer, cl1_tests.cells(c3=9), state="draft")
    assert plain.updated == 0 and "already there as historical" in plain.skipped[0]
    assert set((await states()).values()) == {"historical"}


async def test_historical_run_turns_the_importers_draft_into_historical(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    _, importer = send_client
    await import_hours(db_async, importer, cl1_tests.cells(c3=8), state="draft")
    assert set((await states()).values()) == {"draft"}
    outcome = await import_hours(db_async, importer, cl1_tests.cells(c3=8))
    assert outcome.updated == 1
    assert set((await states()).values()) == {"historical"}


async def test_importer_leaves_an_observers_keyed_hour_alone(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    client, importer = send_client
    (observed_at, workbook, _row) = ready_hours(cl1_tests.cells(c3=8))[0]
    keyed = await client.post(
        OBS_URL,
        json={
            "station_id": STATION,
            "kind": "SYNOP",
            "observed_at": observed_at.isoformat(),
            "body": {
                **workbook.model_dump(exclude_none=True),
                "notes": "keyed by hand",
            },
        },
    )
    assert keyed.status_code == 201, keyed.text
    outcome = await import_hours(db_async, importer, cl1_tests.cells(c3=8))
    assert outcome.created == 0 and len(outcome.skipped) == 1
    assert await states() == {"01 12": "draft"}


# --- the one-off converter -----------------------------------------------------------


def test_month_range_covers_the_grenada_local_month() -> None:
    start, end = historical.month_range("2026-10")
    assert start == datetime(2026, 10, 1, 4, tzinfo=UTC)
    assert end == datetime(2026, 11, 1, 4, tzinfo=UTC)
    assert historical.month_range("2026-12")[1] == datetime(2027, 1, 1, 4, tzinfo=UTC)
    for bad in ("2026-13", "2026-1", "October", "2026-10-01"):
        with pytest.raises(historical.MonthError):
            historical.month_range(bad)


async def convert(
    db: AsyncSession, actor: User, month: str, *, apply: bool
) -> historical.Conversion:
    async with register_session() as register:
        return await historical.convert_month(
            register=register, app_session=db, actor=actor, month=month, apply=apply
        )


async def test_converter_dry_run_then_apply_is_idempotent_and_selective(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    client, importer = send_client
    await import_hours(
        db_async,
        importer,
        cl1_tests.cells(c2=1, c3=8),  # converted
        cl1_tests.cells(c2=2, c3=8),  # reviewed: left alone
        cl1_tests.cells(c2=3, c3=8),  # sent: left alone
        cl1_tests.cells(c2=4, c3=8),  # accepted: not a draft
        cl1_tests.cells(c2=5, c3=8),  # converted
        state="draft",
    )
    # Outside the local month: the first hour of 1 Oct local is 04:00 UTC, so
    # 31 Oct 23:00 local (03:00 UTC on 1 Oct) belongs to September.
    await import_hours(
        db_async, importer, cl1_tests.cells(c1=9, c2=30, c3=23), state="draft"
    )
    # An observer's keyed draft in the month: its notes are not the importer's.
    (observed_at, workbook, _row) = ready_hours(cl1_tests.cells(c2=6, c3=8))[0]
    keyed = await client.post(
        OBS_URL,
        json={
            "station_id": STATION,
            "kind": "SYNOP",
            "observed_at": observed_at.isoformat(),
            "body": {**workbook.model_dump(exclude_none=True), "notes": "keyed"},
        },
    )
    assert keyed.status_code == 201, keyed.text
    ids = {
        str(r["at"]): str(r["id"])
        for r in await register_rows(
            "SELECT id, to_char(observed_at AT TIME ZONE 'UTC', 'DD HH24') AS at"
            " FROM register_observations"
        )
    }
    await register_exec(
        "UPDATE register_observations SET review_outcome = 'query' WHERE id = :i",
        i=ids["02 12"],
    )
    await set_state(ids["04 12"], "accepted")
    db_async.add(
        ERegisterSend(
            observation_id=UUID(ids["03 12"]),
            station_id=STATION,
            observed_at=datetime(2026, 10, 3, 12),
            target="email",
            status="sent",
            detail={},
        )
    )
    await db_async.commit()
    before = await states()

    dry = await convert(db_async, importer, "2026-10", apply=False)
    assert (dry.candidates, dry.reviewed, dry.sent, dry.converted) == (4, 1, 1, 2)
    assert dry.other_live == 2  # the accepted record and the keyed draft
    assert await states() == before
    audited = (
        await db_async.scalars(
            select(AuditEntry).where(AuditEntry.action == historical.AUDIT_ACTION)
        )
    ).all()
    assert audited == []

    applied = await convert(db_async, importer, "2026-10", apply=True)
    assert applied.converted == 2
    after = await states()
    assert after["01 12"] == after["05 12"] == "historical"
    assert after["02 12"] == after["03 12"] == after["06 12"] == "draft"
    assert after["04 12"] == "accepted"
    assert after["01 03"] == "draft"  # 30 Sep 23:00 local: not in the month
    audited = (
        await db_async.scalars(
            select(AuditEntry).where(AuditEntry.action == historical.AUDIT_ACTION)
        )
    ).all()
    assert len(audited) == 2
    assert {e.actor_user_id for e in audited} == {importer.id}

    again = await convert(db_async, importer, "2026-10", apply=True)
    assert again.converted == 0
    assert await states() == after


# --- public --------------------------------------------------------------------------


def test_public_status_names_the_three_states() -> None:
    cases: dict[str, str] = {
        "accepted": "accepted",
        "historical": "historical",
        "draft": "provisional",
        "qc_pending": "provisional",
    }
    for state, status in cases.items():
        assert public.public_status(state) == status


async def test_month_summary_does_not_count_historical_as_provisional(register_db):
    s = register_db
    at: Callable[[int], datetime] = lambda day: datetime(2026, 9, day, 12, tzinfo=UTC)  # noqa: E731
    await public_tests.put(s, at(5), state="historical", s3_rainfall_24h="0050")
    await public_tests.put(s, at(6), state="accepted", s3_rainfall_24h="0020")
    summary = await public.month_summary(s, "2026-09", public_tests.NOW)
    assert summary is not None and summary.provisional is False
    await public_tests.put(s, at(7), state="draft", s3_rainfall_24h="0010")
    summary = await public.month_summary(s, "2026-09", public_tests.NOW)
    assert summary is not None and summary.provisional is True


async def test_current_conditions_prefer_the_newest_live_reading_over_history(
    register_db,
):
    s = register_db
    now = datetime.now(UTC)
    # A historical month, much older than the live reading.
    await public_tests.insert(
        s, minutes_ago=60 * 24 * 40, state="historical", air_temp="21.0"
    )
    # The public current conditions never show archive data.
    assert await public.latest(s, now) is None
    await public_tests.insert(s, minutes_ago=30, state="draft", air_temp="30.0")
    live = await public.latest(s, now)
    assert live is not None
    assert live.temperature_c == 30.0 and live.status == "provisional"
    await public_tests.insert(s, minutes_ago=10, state="accepted", air_temp="31.0")
    newest = await public.latest(s, now)
    assert newest is not None
    assert newest.temperature_c == 31.0 and newest.status == "accepted"


async def test_public_endpoint_never_shows_archive_data(register_db):
    from src.eregister.dependencies import get_public_session

    async def override():
        yield register_db

    app.dependency_overrides[get_public_session] = override
    try:
        await public_tests.insert(register_db, minutes_ago=5, state="historical")
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            assert (await client.get(public_tests.URL)).json() == {"observation": None}
    finally:
        app.dependency_overrides.pop(get_public_session, None)
