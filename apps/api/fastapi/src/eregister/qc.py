"""Acceptance, review, rejection and reopening of register observations.

States: ``draft`` (``qc_pending`` once reopened) -> ``accepted``, plus
``rejected`` and ``superseded`` (a correction replaced it, ``entries.correct``).

* ``accept``: the observer, or any other register staff member, alone. WIS2 and
  email go out from here (``sends.dispatch_after_acceptance``).
* ``review``: optional, by register staff other than the observer: ``reviewed``
  or ``query`` with a note. It is recorded on the row and audited, changes no
  state and never holds anything back.
* ``reject``: draft or qc_pending. ``reopen``: accepted or rejected, back to
  ``qc_pending``; both are refused once a WIS2 file was queued or sent (correct
  the observation with a new one instead).

The observation row lives in the separate register database and the audit
trail in the application database, so the two cannot share a transaction. The
state change commits first; the audit entry follows in its own commit.
"""

import logging
from datetime import datetime
from typing import Any, Literal, NamedTuple
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import bindparam, func, select, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth.models import User
from src.eregister.exceptions import HourHeldError, ObservationNotFoundError
from src.exceptions import AppException, AppValidationError, AuthorizationError
from src.utils.datetime import utc_now

from . import bufr, encodings, entries, gate, iwxxm, metar, sends, stations, transitions
from .models import STATUS_QUEUED, STATUS_SENT, TARGET_WIS2, ERegisterSend
from .schemas import RegisterObservationRead
from .transitions import RegisterState

logger = logging.getLogger(__name__)

# The states and the table of allowed moves live in transitions.py (a leaf module,
# so entries and sends can use the same table without importing this one).
QcAction = Literal["accept", "reject", "reopen"]

AUDIT_ENTITY = "eregister_observation"
REASON_REQUIRED: frozenset[QcAction] = frozenset({"reject", "reopen"})
MIN_REASON = 3


def _reason(action: QcAction, reason: str | None) -> str | None:
    clean = (reason or "").strip() or None
    if action in REASON_REQUIRED and (clean is None or len(clean) < MIN_REASON):
        raise AppValidationError(f"A reason is required to {action} an observation")
    return clean


async def _already_sent_to_wis2(
    app_session: AsyncSession, observation_id: UUID
) -> bool:
    count = await app_session.scalar(
        select(func.count())
        .select_from(ERegisterSend)
        .where(
            ERegisterSend.observation_id == observation_id,
            ERegisterSend.target == TARGET_WIS2,
            ERegisterSend.status.in_((STATUS_QUEUED, STATUS_SENT)),
        )
    )
    return bool(count)


async def _lock(register: AsyncSession, observation_id: UUID) -> dict[str, Any]:
    result = await register.execute(
        text("SELECT * FROM register_observations WHERE id = :id FOR UPDATE"),
        {"id": str(observation_id)},
    )
    found = result.mappings().first()
    if found is None:
        await register.rollback()
        raise ObservationNotFoundError()
    return dict(found)


async def _audit(
    app_session: AsyncSession,
    *,
    user: User,
    observation_id: UUID,
    action: str,
    changes: dict[str, tuple[Any, Any]],
) -> None:
    audit_service.set_actor(app_session, user.id)
    await audit_service.record_change(
        app_session,
        entity_type=AUDIT_ENTITY,
        entity_id=str(observation_id),
        record_type=AUDIT_ENTITY,
        record_id=str(observation_id),
        action=action,
        changes=changes,
    )
    await app_session.commit()


_STORE_ENCODINGS = text(
    """
    UPDATE register_observations
    SET iwxxm = CAST(:iwxxm AS jsonb), bufr = CAST(:bufr AS jsonb)
    WHERE id = :id
    RETURNING *
    """
).bindparams(
    bindparam("iwxxm", type_=JSONB(none_as_null=True)),
    bindparam("bufr", type_=JSONB(none_as_null=True)),
)


async def _store_encodings(
    register: AsyncSession, row: dict[str, Any]
) -> dict[str, Any]:
    """Build the IWXXM METAR and the BUFR of the accepted SYNOP and store both on the row.

    Same register transaction as the acceptance, so a row is never accepted without its
    records. The encoders run in a thread (the IWXXM schema loads once per process).
    An encoder failure or a gap is stored in the record's ``errors``; it never blocks
    acceptance. Sending is refused by ``sends.load_sendable`` while the BUFR is not valid.
    Nothing is sent here (owner rule: report, never send).
    """
    body = row["body"] or {}
    try:
        station = await stations.pressure_for(register, str(row["station_id"]))
    except Exception:
        # Without the station's amounts neither record can be trusted: store both as errors.
        logger.exception(
            "eRegister pressure settings lookup failed; encodings stored as errors"
        )
        iwxxm_record = iwxxm.failed_record(encodings.ENCODER_FAILED)
        bufr_record = bufr.failed_record(encodings.ENCODER_FAILED)
    else:
        iwxxm_record = await encodings.run_encoder(
            "IWXXM",
            iwxxm.record_for_row,
            iwxxm.failed_record(encodings.ENCODER_FAILED),
            body=body,
            station=station,
            observed_at=row["observed_at"],
            aerodrome_icao=str(row["aerodrome_icao"] or metar.ICAO),
            correction=row.get("supersedes_id") is not None,
        )
        bufr_record = await encodings.run_encoder(
            "BUFR",
            bufr.record_for_row,
            bufr.failed_record(encodings.ENCODER_FAILED),
            body=body,
            station=station,
            observed_at=row["observed_at"],
        )
    result = await register.execute(
        _STORE_ENCODINGS,
        {"iwxxm": iwxxm_record, "bufr": bufr_record, "id": str(row["id"])},
    )
    return dict(result.mappings().one())


async def transition(
    *,
    register: AsyncSession,
    app_session: AsyncSession,
    observation_id: UUID,
    user: User,
    action: QcAction,
    reason: str | None,
) -> RegisterObservationRead:
    clean_reason = _reason(action, reason)
    row = await _lock(register, observation_id)
    target = transitions.fixed_target(action)
    previous: RegisterState = row["state"]
    try:
        transitions.guard(
            previous,
            action,
            refusal=f"Cannot {action} an observation that is {previous}",
        )
        if action == "accept":
            if row["kind"] != "SYNOP":
                raise AppException("Only SYNOP observations go through QC", 409)
            entries.require_valid_synop(
                row["body"] or {}, row["observed_at"], stored=True
            )
        else:
            transitions.guard(
                previous,
                action,
                refusal="Already queued or sent to WIS2; correct it with a new observation",
                wis2_sent=await _already_sent_to_wis2(app_session, observation_id),
            )
            if action == "reopen" and previous == "rejected":
                # A rejected row left the live set, so the hour may have been keyed
                # again. Same lock as saving; a rejected row is never row-locked by a
                # save, so taking it after the row lock cannot deadlock.
                await entries.lock_key(
                    register,
                    str(row["station_id"]),
                    row["observed_at"],
                    str(row["kind"]),
                )
                if await entries.live_row(
                    register,
                    str(row["station_id"]),
                    row["observed_at"],
                    str(row["kind"]),
                ):
                    raise HourHeldError()
    except AppException, HTTPException:
        # HTTPException: the SYNOP refusal from entries.require_valid_synop.
        await register.rollback()
        raise
    restored: Restored | None = None
    try:
        updated = await _set_state(
            register, observation_id, user, target, clean_reason, action
        )
        saved = dict(updated.mappings().one())
        if action == "accept":
            saved = await _store_encodings(register, row)
        if action == "reject" and row.get("supersedes_id"):
            # The rejected correction has left the live set, so the original returns
            # to it in the same transaction. No save lock here: row locks are taken
            # in one order (this row, then the original) and the unique index
            # decides a race with a concurrent save (409 below).
            restored = await _restore_original(
                register,
                row,
                observation_id,
                str(user.id),
                app_session=app_session,
            )
    except IntegrityError as exc:
        await register.rollback()
        if action not in ("reopen", "reject"):
            raise
        raise AppException(
            "Another observation now holds this hour; correct that one instead", 409
        ) from exc
    await register.commit()
    if restored is not None:
        # The reading the rejected correction replaced stands again, so release its
        # file. Without a restore the original stays superseded and its file stays held.
        await sends.release_held_wis2(
            app_session,
            station_id=str(row["station_id"]),
            observed_at=row["observed_at"],
            original_id=UUID(str(row["supersedes_id"])),
        )
    await _audit(
        app_session,
        user=user,
        observation_id=observation_id,
        action=action,
        changes={"state": (previous, target), "qc_notes": (None, clean_reason)},
    )
    if restored is not None:
        await _audit(
            app_session,
            user=user,
            observation_id=UUID(str(row["supersedes_id"])),
            action="restore",
            changes={
                "state": ("superseded", restored.state),
                "qc_notes": (restored.notes_before, restored.notes_after),
            },
        )
    return RegisterObservationRead.model_validate(saved)


class Restored(NamedTuple):
    """What restoring an original changed, for the audit entry."""

    state: str
    notes_before: str | None
    notes_after: str | None


async def _restore_original(
    register: AsyncSession,
    correction: dict[str, Any],
    correction_id: UUID,
    actor: str,
    *,
    app_session: AsyncSession,
) -> Restored | None:
    """Put the reading a rejected correction replaced back where it was.

    Only a row that is still ``superseded`` moves; it gets its earlier state
    (``superseded_from``) and its own ``qc_notes`` back, so a never-accepted draft
    stays a draft. A row superseded before migration ``eregister_0005`` remembers
    nothing: when it has a held WIS2 file it was accepted, so it
    returns as ``accepted`` (its earlier notes are not recoverable); otherwise it
    stays superseded (the file is only looked up for such a row). If the correction had taken the publish gate (it was
    accepted, its WIS2 send failed, then it was reopened), the gate returns to an
    original that is accepted again; for any other restored state the correction's
    claim is simply released. Returns what changed, or None when nothing was
    restored.
    """
    original_id = str(correction["supersedes_id"])
    found = (
        (
            await register.execute(
                text(
                    "SELECT state, qc_notes, superseded_from, superseded_qc_notes"
                    " FROM register_observations WHERE id = :id FOR UPDATE"
                ),
                {"id": original_id},
            )
        )
        .mappings()
        .first()
    )
    if found is None or not transitions.can_transition(found["state"], "restore"):
        return None
    earlier = found["superseded_from"]
    if earlier is None and await sends.has_held_wis2(
        app_session, UUID(str(correction["supersedes_id"]))
    ):
        earlier = "accepted"
    if earlier is None:
        return None
    await register.execute(
        text(
            """
            UPDATE register_observations
            SET state = CAST(:earlier AS register_state),
                qc_notes = superseded_qc_notes,
                superseded_from = NULL, superseded_qc_notes = NULL,
                updated_at = now()
            WHERE id = :id
            """
        ),
        {"id": original_id, "earlier": str(earlier)},
    )
    restored = Restored(str(earlier), found["qc_notes"], found["superseded_qc_notes"])
    station_id = str(correction["station_id"])
    hour = gate.valid_hour(correction["observed_at"])
    if restored.state != "accepted":
        # A draft was never published: it cannot hold the hour.
        await gate.release_hour(
            register,
            station_id=station_id,
            observed_at=correction["observed_at"],
            observation_id=correction_id,
            commit=False,
        )
        return restored
    moved = await register.execute(
        text(
            "UPDATE observations.publish_gate SET observation_id = :orig,"
            " claimed_by = :actor, claimed_at = now()"
            " WHERE station_id = :station AND valid_hour = :hour"
            " AND observation_id = :corr RETURNING 1"
        ),
        {
            "orig": original_id,
            "corr": str(correction_id),
            "actor": actor,
            "station": station_id,
            "hour": hour,
        },
    )
    if moved.first() is not None:
        await gate.log_decision(
            register,
            station_id=station_id,
            hour=hour,
            observation_id=UUID(original_id),
            actor=actor,
            reason="Hour returns to the original: its correction was rejected",
        )
    return restored


async def _set_state(
    register: AsyncSession,
    observation_id: UUID,
    user: User,
    target: str,
    clean_reason: str | None,
    action: QcAction,
) -> Any:
    return await register.execute(
        text(
            """
            UPDATE register_observations
            SET state = CAST(:state AS register_state), qc_notes = :notes,
                qc_by = :by, qc_at = :at, updated_at = :at,
                review_outcome = CASE WHEN :clear THEN NULL ELSE review_outcome END,
                review_note = CASE WHEN :clear THEN NULL ELSE review_note END,
                reviewed_by = CASE WHEN :clear THEN NULL ELSE reviewed_by END,
                reviewed_at = CASE WHEN :clear THEN NULL ELSE reviewed_at END
            WHERE id = :id
            RETURNING *
            """
        ),
        {
            "state": target,
            "notes": clean_reason,
            "by": str(user.id),
            "at": utc_now(),
            "id": str(observation_id),
            "clear": action == "reopen",
        },
    )


def _whole_seconds(moment: datetime) -> datetime:
    """The API shows ``updated_at`` to the second, so compare at that precision."""
    return moment.replace(microsecond=0)


async def review(
    *,
    register: AsyncSession,
    app_session: AsyncSession,
    observation_id: UUID,
    user: User,
    outcome: str,
    note: str | None,
    seen_updated_at: datetime | None = None,
) -> RegisterObservationRead:
    """Record an optional review; the state and any sending are untouched.

    ``seen_updated_at`` is the version the reviewer opened; a record saved since
    then is a 409, so the mark never lands on a reading nobody looked at. The
    comparison is to the whole second, the precision the API returns, so a change
    within the same second as the version the reviewer saw is not detected.
    """
    clean = (note or "").strip() or None
    if outcome == "query" and (clean is None or len(clean) < MIN_REASON):
        raise AppValidationError("A note is required to raise a query")
    row = await _lock(register, observation_id)
    try:
        if str(row["actor_id"]) == str(user.id):
            raise AuthorizationError(
                "A different person from the observer records the review"
            )
        if seen_updated_at is not None and _whole_seconds(
            row["updated_at"]
        ) != _whole_seconds(seen_updated_at):
            raise AppException(
                "The observation was saved or decided since you opened it; open it again",
                409,
            )
        if row["state"] not in transitions.REVIEWABLE_STATES:
            raise AppException(
                f"Cannot review an observation that is {row['state']}", 409
            )
    except AppException:
        await register.rollback()
        raise
    updated = await register.execute(
        text(
            """
            UPDATE register_observations
            SET review_outcome = :outcome, review_note = :note,
                reviewed_by = :by, reviewed_at = :at
            WHERE id = :id
            RETURNING *
            """
        ),
        {
            "outcome": outcome,
            "note": clean,
            "by": str(user.id),
            "at": utc_now(),
            "id": str(observation_id),
        },
    )
    saved = dict(updated.mappings().one())
    await register.commit()
    await _audit(
        app_session,
        user=user,
        observation_id=observation_id,
        action="review",
        changes={
            "review_outcome": (row["review_outcome"], outcome),
            "review_note": (row["review_note"], clean),
        },
    )
    return RegisterObservationRead.model_validate(saved)
