"""Automatic entries through the outbox (``opslog.entry_post``, ADR-0067)."""

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox
from src.opslog.models import OpsLog, OpsLogEntry, OpsLogEntrySource

# Importing the handler module registers the handler.
from src.opslog.outbox_handlers import ENTRY_POST_TOPIC
from src.organisations.models import MembershipRole
from src.utils.datetime import utc_now
from tests.factories import make_user
from tests.organisations.support import make_org

pytestmark = pytest.mark.asyncio


async def _org(db: AsyncSession, *, apps: tuple[str, ...] = ("opslog",)) -> str:
    owner = await make_user(db)
    org = await make_org(
        db,
        f"Airport {uuid.uuid4().hex[:6]}",
        members=((owner, MembershipRole.OWNER),),
        apps=apps,
    )
    return org.id


async def _add_log(db: AsyncSession, org_id: str, **values: object) -> OpsLog:
    log = OpsLog(organisation_id=org_id, name=f"Log {uuid.uuid4().hex[:6]}", **values)
    db.add(log)
    await db.commit()
    return log


async def _send(db: AsyncSession, org_id: str, payload: dict[str, object]) -> str:
    key = uuid.uuid4().hex
    await outbox.enqueue(
        db,
        topic=ENTRY_POST_TOPIC,
        organisation_id=org_id,
        dedupe_key=key,
        payload=payload,
    )
    await db.commit()
    await outbox.drain(db, only_topics=[ENTRY_POST_TOPIC])
    return key


async def _status(db: AsyncSession, key: str) -> str:
    status = await db.scalar(
        select(outbox.Outbox.status).where(
            outbox.Outbox.topic == ENTRY_POST_TOPIC, outbox.Outbox.dedupe_key == key
        )
    )
    assert status is not None
    return status


async def _entries(db: AsyncSession, org_id: str) -> list[OpsLogEntry]:
    return list(
        (
            await db.scalars(
                select(OpsLogEntry).where(OpsLogEntry.organisation_id == org_id)
            )
        ).all()
    )


async def test_message_writes_one_automatic_entry_with_its_record(
    db_async: AsyncSession,
) -> None:
    org_id = await _org(db_async)
    log = await _add_log(db_async, org_id)
    key = await _send(
        db_async,
        org_id,
        {
            "text": "Incident opened: fuel spill at stand 3",
            "occurred_at": "2026-11-25T14:02:00Z",
            "record": {"kind": "incidents.incident", "id": "inc_1"},
        },
    )
    assert await _status(db_async, key) == "done"
    [entry] = await _entries(db_async, org_id)
    assert entry.log_id == log.id
    assert entry.source == OpsLogEntrySource.AUTOMATIC.value
    assert (entry.source_kind, entry.source_id) == ("incidents.incident", "inc_1")
    assert entry.author_id is None
    # A second drain finds nothing more to do.
    await outbox.drain(db_async, only_topics=[ENTRY_POST_TOPIC])
    assert len(await _entries(db_async, org_id)) == 1


async def test_without_a_receiving_log_or_entitlement_the_message_is_dropped(
    db_async: AsyncSession,
) -> None:
    no_log = await _org(db_async)
    await _add_log(db_async, no_log, automatic_entries=False)
    key = await _send(db_async, no_log, {"text": "Nobody listens"})
    assert await _status(db_async, key) == "done"
    assert await _entries(db_async, no_log) == []

    not_entitled = await _org(db_async, apps=())
    await _add_log(db_async, not_entitled)
    key = await _send(db_async, not_entitled, {"text": "Not switched on"})
    assert await _status(db_async, key) == "done"
    assert await _entries(db_async, not_entitled) == []


async def test_another_organisations_log_or_a_bad_payload_is_dead_lettered(
    db_async: AsyncSession,
) -> None:
    mine = await _org(db_async)
    theirs = await _org(db_async)
    their_log = await _add_log(db_async, theirs)
    key = await _send(db_async, mine, {"text": "Wrong log", "log_id": their_log.id})
    assert await _status(db_async, key) == "dead"
    assert await _entries(db_async, theirs) == []

    key = await _send(db_async, mine, {"text": ""})
    assert await _status(db_async, key) == "dead"


async def test_archived_named_log_drops_and_bad_category_is_left_out(
    db_async: AsyncSession,
) -> None:
    org_id = await _org(db_async)
    archived = await _add_log(db_async, org_id, archived_at=utc_now())
    key = await _send(db_async, org_id, {"text": "Late", "log_id": archived.id})
    assert await _status(db_async, key) == "done"
    assert await _entries(db_async, org_id) == []

    await _add_log(db_async, org_id)
    key = await _send(db_async, org_id, {"text": "Typo", "category_id": "olc_nope"})
    assert await _status(db_async, key) == "done"
    [entry] = await _entries(db_async, org_id)
    assert entry.category_id is None
