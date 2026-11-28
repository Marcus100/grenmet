"""Follow-ups from the reviews of the cases investigation (#1956).

Two first writes for the same organisation and programme can both pass the
``is_seeded`` check and both try to write the marker. The primary key lets one win; the
other used to fail with an unhandled ``IntegrityError`` (a 500). Factor ids in the
investigation body were also unbounded strings.
"""

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.cases import router, service
from src.cases.models import (
    FACTOR_ID_PATTERN,
    ContributingFactor,
    FactorSeed,
    Programme,
    new_factor_id,
)
from src.exceptions import AppValidationError
from tests.cases.test_cases_investigation import (
    API,
    _case,
    _to_investigating,
    _world,
)

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


async def test_a_conflict_on_other_pending_work_is_not_taken_for_a_lost_race(
    db_async: AsyncSession,
) -> None:
    """Opening a savepoint flushes whatever is already pending. If that flush fails
    because of some other row, it must surface: swallowing it as "someone else seeded
    first" would hide the real error and leave the request on a dead transaction."""
    world = await _world(db_async)
    for _ in range(2):
        db_async.add(
            ContributingFactor(
                id=new_factor_id(),
                organisation_id=world.org_id,
                programme=Programme.SAFETY.value,
                category="training",
                name="Same name twice",
                is_active=True,
                created_by=None,
            )
        )

    with pytest.raises(IntegrityError):
        await service.seed_default_factors(
            db_async, organisation_id=world.org_id, programme=Programme.SAFETY
        )


BAD_FACTOR_IDS = [
    "x" * 5000,
    "cfa_" + "0" * 17,
    "cfa_" + "g" * 16,
    "CFA_" + "0" * 16,
    "",
    "nope",
]


def test_a_factor_id_in_the_issued_shape_passes_the_check() -> None:
    service.require_factor_id_shape([new_factor_id(), "cfa_" + "0" * 16])
    service.require_factor_id_shape([])


@pytest.mark.parametrize("bad", BAD_FACTOR_IDS)
def test_a_factor_id_that_is_not_the_issued_shape_is_refused_before_any_lookup(
    bad: str,
) -> None:
    """The shape is checked in plain Python, so a junk or oversized string never reaches
    the database as a value. The body field stays a plain list of strings in the contract
    (tightening it there is a breaking change to the request schema)."""
    with pytest.raises(AppValidationError):
        service.require_factor_id_shape([new_factor_id(), bad])


@pytest.mark.parametrize("bad", BAD_FACTOR_IDS)
async def test_a_malformed_factor_id_still_answers_422_through_the_api(
    async_client: httpx.AsyncClient, db_async: AsyncSession, bad: str
) -> None:
    """The same 422 a client got before, now without the lookup."""
    world = await _world(db_async)
    case_id = await _case(async_client, world)
    await _to_investigating(async_client, world, case_id)

    response = await async_client.patch(
        f"{API}/cases/{case_id}/investigation",
        headers=world.h(world.officer),
        json={"contributing_factor_ids": [bad]},
    )

    assert response.status_code == 422, response.text
    assert response.json()["detail"] == service.FACTOR_NOT_CHOOSABLE


async def test_the_investigation_write_checks_the_shape_before_looking_ids_up(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The API answers 422 for a bad id either way (the lookup finds nothing), so only
    this test notices if the shape check is ever unplugged from the write path."""
    world = await _world(db_async)
    case_id = await _case(async_client, world)
    await _to_investigating(async_client, world, case_id)
    seen: list[list[str]] = []
    real = service.require_factor_id_shape

    def spy(factor_ids: list[str]) -> None:
        seen.append(list(factor_ids))
        real(factor_ids)

    monkeypatch.setattr(service, "require_factor_id_shape", spy)

    await async_client.patch(
        f"{API}/cases/{case_id}/investigation",
        headers=world.h(world.officer),
        json={"contributing_factor_ids": ["nope"]},
    )

    assert seen == [["nope"]]


def test_the_router_and_the_service_declare_the_same_factor_id_shape() -> None:
    """The path parameter keeps its own literal (touching the router would demand a
    regenerated contract that does not change), so pin it to the shared constant."""
    patterns = [
        found
        for constraint in router.FactorId.__metadata__[0].metadata
        if (found := getattr(constraint, "pattern", None)) is not None
    ]
    assert patterns == [FACTOR_ID_PATTERN]
