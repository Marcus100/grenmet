"""Station-hour publish gate (ADR-0032).

For each ``(station, valid hour)`` exactly one source publishes. The station
registry schedule says which: ``automatic`` (SURFACE, ADR-0010), ``manual``
(eRegister) or ``hybrid`` (manual in ``manual_hours_utc``, automatic
otherwise). eRegister claims the hour here before it queues a WIS2 file; the
primary key on ``observations.publish_gate`` makes the claim atomic, so two
concurrent attempts cannot both win. Every decision is logged.
"""

from collections.abc import Collection
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import AppException

SOURCE_AUTOMATIC = "automatic"
SOURCE_MANUAL = "manual"


class PublishGateError(AppException):
    """The station-hour is not eRegister's to publish, or is already taken."""

    def __init__(self, message: str):
        super().__init__(message, 409)


def valid_hour(moment: datetime) -> datetime:
    return moment.astimezone(UTC).replace(minute=0, second=0, microsecond=0)


def official_source(schedule: str, manual_hours: list[int], hour: datetime) -> str:
    """Which source owns the hour. Pure: UTC hours only, no DST."""
    if schedule == "manual":
        return SOURCE_MANUAL
    if schedule == "hybrid" and hour.astimezone(UTC).hour in manual_hours:
        return SOURCE_MANUAL
    return SOURCE_AUTOMATIC


async def _log(
    register: AsyncSession,
    *,
    station_id: str,
    hour: datetime,
    official: str | None,
    observation_id: UUID,
    outcome: str,
    reason: str,
    actor: str | None,
) -> None:
    await register.execute(
        text(
            "INSERT INTO observations.publish_gate_decisions (station_id, valid_hour,"
            " requested_source, official_source, observation_id, outcome, reason,"
            " decided_by) VALUES (:station, :hour, :requested, :official, :obs,"
            " :outcome, :reason, :actor)"
        ),
        {
            "station": station_id,
            "hour": hour,
            "requested": SOURCE_MANUAL,
            "official": official,
            "obs": observation_id,
            "outcome": outcome,
            "reason": reason,
            "actor": actor,
        },
    )


async def log_decision(
    register: AsyncSession,
    *,
    station_id: str,
    hour: datetime,
    observation_id: UUID,
    actor: str | None,
    reason: str,
) -> None:
    """Record a gate hand-back (a rejected correction); the caller commits."""
    await _log(
        register,
        station_id=station_id,
        hour=hour,
        official=None,
        observation_id=observation_id,
        outcome="claimed",
        reason=reason,
        actor=actor,
    )


async def hour_holder(
    register: AsyncSession, *, station_id: str, observed_at: datetime
) -> UUID | None:
    """The observation that holds the station-hour, if any."""
    found: UUID | None = await register.scalar(
        text(
            "SELECT observation_id FROM observations.publish_gate"
            " WHERE station_id = :station AND valid_hour = :hour"
        ),
        {"station": station_id, "hour": valid_hour(observed_at)},
    )
    return found


async def ancestors(register: AsyncSession, observation_id: UUID) -> list[UUID]:
    """Observations this one supersedes, directly or through earlier corrections."""
    result = await register.execute(
        text(
            """
            WITH RECURSIVE chain(id, supersedes_id, depth) AS (
              SELECT id, supersedes_id, 0 FROM register_observations WHERE id = :id
              UNION ALL
              SELECT o.id, o.supersedes_id, chain.depth + 1
              FROM register_observations o JOIN chain ON o.id = chain.supersedes_id
              WHERE chain.depth < 50
            )
            SELECT id FROM chain WHERE id <> :id
            """
        ),
        {"id": str(observation_id)},
    )
    return [row[0] for row in result]


async def claim_manual_hour(
    register: AsyncSession,
    *,
    station_id: str,
    observed_at: datetime,
    observation_id: UUID,
    actor: str | None = None,
    supersedes: Collection[UUID] = (),
) -> bool:
    """Claim the station-hour for a manual publish.

    Returns True when newly claimed, False when this observation already holds
    it or took it over from an observation it corrects (``supersedes``).
    Raises ``PublishGateError`` (after logging the refusal) otherwise.
    """
    hour = valid_hour(observed_at)
    row = (
        (
            await register.execute(
                text(
                    "SELECT schedule, manual_hours_utc, active FROM observations.stations"
                    " WHERE station_id = :station"
                ),
                {"station": station_id},
            )
        )
        .mappings()
        .first()
    )
    official = (
        None
        if row is None
        else official_source(row["schedule"], list(row["manual_hours_utc"]), hour)
    )
    refusal: str | None = None
    if row is None:
        refusal = f"Station {station_id} is not in the observation station registry"
    elif not row["active"]:
        refusal = (
            f"Station {station_id} is inactive in the observation station registry"
        )
    elif official != SOURCE_MANUAL:
        refusal = (
            f"The {hour:%H}Z hour at station {station_id} is published by the "
            "automatic source, not eRegister"
        )
    claimed = False
    takeover = False
    if refusal is None:
        inserted = await register.execute(
            text(
                "INSERT INTO observations.publish_gate (station_id, valid_hour,"
                " source, observation_id, claimed_by) VALUES (:station, :hour,"
                " :source, :obs, :actor) ON CONFLICT DO NOTHING"
                " RETURNING observation_id"
            ),
            {
                "station": station_id,
                "hour": hour,
                "source": SOURCE_MANUAL,
                "obs": observation_id,
                "actor": actor,
            },
        )
        claimed = inserted.first() is not None
        if not claimed:
            holder = await register.scalar(
                text(
                    "SELECT observation_id FROM observations.publish_gate"
                    " WHERE station_id = :station AND valid_hour = :hour"
                ),
                {"station": station_id, "hour": hour},
            )
            if holder in supersedes:
                await register.execute(
                    text(
                        "UPDATE observations.publish_gate SET observation_id = :obs,"
                        " claimed_by = :actor, claimed_at = now()"
                        " WHERE station_id = :station AND valid_hour = :hour"
                        " AND observation_id = :old"
                    ),
                    {
                        "obs": observation_id,
                        "actor": actor,
                        "station": station_id,
                        "hour": hour,
                        "old": holder,
                    },
                )
                takeover = True
            elif holder != observation_id:
                refusal = (
                    f"The {hour:%Y-%m-%d %H}Z hour at station {station_id} was "
                    "already claimed by another observation"
                )
    if refusal is not None:
        await _log(
            register,
            station_id=station_id,
            hour=hour,
            official=official,
            observation_id=observation_id,
            actor=actor,
            outcome="refused",
            reason=refusal,
        )
        await register.commit()
        raise PublishGateError(refusal)
    await _log(
        register,
        station_id=station_id,
        hour=hour,
        official=official,
        observation_id=observation_id,
        actor=actor,
        outcome="claimed" if claimed or takeover else "reused",
        reason="Hour claimed for manual publish"
        if claimed
        else "Correction takes over the hour from the observation it supersedes"
        if takeover
        else "Hour already held by this observation",
    )
    await register.commit()
    return claimed


async def release_hour(
    register: AsyncSession,
    *,
    station_id: str,
    observed_at: datetime,
    observation_id: UUID,
    commit: bool = True,
) -> None:
    """Undo a claim (a publish that could not be queued, a restored draft).

    ``commit=False`` leaves the delete in the caller's transaction.
    """
    await register.execute(
        text(
            "DELETE FROM observations.publish_gate WHERE station_id = :station"
            " AND valid_hour = :hour AND observation_id = :obs"
        ),
        {"station": station_id, "hour": valid_hour(observed_at), "obs": observation_id},
    )
    if commit:
        await register.commit()
