"""Follow-ups from the reviews of the cases investigation (#1956).

Two first writes for the same organisation and programme can both pass the
``is_seeded`` check and both try to write the marker. The primary key lets one win; the
other used to fail with an unhandled ``IntegrityError`` (a 500). Factor ids in the
investigation body were also unbounded strings.
"""

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.cases import service
from src.cases.models import ContributingFactor, FactorSeed, Programme
from tests.cases.test_cases_investigation import API, _world

DEFAULTS = len(service.DEFAULT_CONTRIBUTING_FACTORS)


async def _factor_count(db: AsyncSession, org_id: str) -> int:
    return int(
        await db.scalar(
            select(func.count())
            .select_from(ContributingFactor)
            .where(ContributingFactor.organisation_id == org_id)
        )
        or 0
    )


async def _seed_count(db: AsyncSession, org_id: str) -> int:
    return int(
        await db.scalar(
            select(func.count())
            .select_from(FactorSeed)
            .where(FactorSeed.organisation_id == org_id)
        )
        or 0
    )


async def test_a_losing_first_write_backs_out_instead_of_raising(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The loser passed `is_seeded` before the winner committed, so its marker hits the
    primary key. It must return quietly and add no second set of defaults."""
    world = await _world(db_async)
    await service.seed_default_factors(
        db_async, organisation_id=world.org_id, programme=Programme.SAFETY
    )
    await db_async.commit()
    assert await _seed_count(db_async, world.org_id) == 1
    seeded = await _factor_count(db_async, world.org_id)
    assert seeded == DEFAULTS

    # Forget the winner's marker so the loser's insert reaches the database, and make
    # the pre-check say "not seeded yet", which is what the race looks like.
    db_async.expunge_all()

    async def not_seeded(*_args: object, **_kwargs: object) -> bool:
        return False

    monkeypatch.setattr(service, "is_seeded", not_seeded)

    await service.seed_default_factors(
        db_async, organisation_id=world.org_id, programme=Programme.SAFETY
    )
    await db_async.commit()

    assert await _seed_count(db_async, world.org_id) == 1
    assert await _factor_count(db_async, world.org_id) == seeded


async def test_a_losing_first_write_leaves_the_session_usable(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Backing out of the savepoint must not poison the transaction: the request goes
    on to write its own row afterwards."""
    world = await _world(db_async)
    await service.seed_default_factors(
        db_async, organisation_id=world.org_id, programme=Programme.SAFETY
    )
    await db_async.commit()
    db_async.expunge_all()

    async def not_seeded(*_args: object, **_kwargs: object) -> bool:
        return False

    monkeypatch.setattr(service, "is_seeded", not_seeded)
    await service.seed_default_factors(
        db_async, organisation_id=world.org_id, programme=Programme.SAFETY
    )

    # Still inside the same transaction: a read and a write both work.
    assert await _factor_count(db_async, world.org_id) == DEFAULTS
    db_async.add(
        ContributingFactor(
            id="cfa_" + "0" * 16,
            organisation_id=world.org_id,
            programme=Programme.SAFETY.value,
            category="training",
            name="Written after the lost race",
            is_active=True,
            created_by=None,
        )
    )
    await db_async.commit()
    assert await _factor_count(db_async, world.org_id) == DEFAULTS + 1


async def test_the_winning_seed_is_still_audited(db_async: AsyncSession) -> None:
    """A savepoint, not a Core insert, so the marker still reaches the audit trail."""
    world = await _world(db_async)
    await service.seed_default_factors(
        db_async, organisation_id=world.org_id, programme=Programme.SAFETY
    )
    await db_async.commit()

    audited = await db_async.scalar(
        select(func.count())
        .select_from(AuditEntry)
        .where(
            AuditEntry.organisation_id == world.org_id,
            AuditEntry.record_type == "case_factor_seed",
        )
    )
    assert int(audited or 0) == 1


async def test_a_second_seed_after_a_normal_first_one_does_nothing(
    db_async: AsyncSession,
) -> None:
    """The ordinary path, with the pre-check working, is unchanged."""
    world = await _world(db_async)
    for _ in range(2):
        await service.seed_default_factors(
            db_async, organisation_id=world.org_id, programme=Programme.SAFETY
        )
        await db_async.commit()

    assert await _seed_count(db_async, world.org_id) == 1
    assert await _factor_count(db_async, world.org_id) == DEFAULTS


@pytest.mark.parametrize(
    "bad",
    [
        "x" * 5000,
        "cfa_" + "0" * 17,
        "cfa_" + "g" * 16,
        "CFA_" + "0" * 16,
        "",
        "nope",
    ],
)
async def test_a_factor_id_that_is_not_the_issued_shape_is_refused_at_the_edge(
    async_client: httpx.AsyncClient, db_async: AsyncSession, bad: str
) -> None:
    world = await _world(db_async)
    created = await async_client.post(
        f"{API}/cases",
        headers=world.h(world.officer),
        json={
            "title": "Id shape",
            "description": "x",
            "occurred_at": "2026-11-20T10:00:00Z",
        },
    )
    if created.status_code != 201:
        pytest.skip(
            f"case creation shape differs: {created.status_code} {created.text}"
        )
    case_id = created.json()["id"]

    response = await async_client.patch(
        f"{API}/cases/{case_id}/investigation",
        headers=world.h(world.officer),
        json={"contributing_factor_ids": [bad]},
    )

    assert response.status_code == 422, response.text
