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

from typing import Any, Literal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth.models import User
from src.utils.datetime import utc_now

from . import entries
from .models import STATUS_QUEUED, STATUS_SENT, TARGET_WIS2, ERegisterSend
from .schemas import RegisterObservationRead

QcAction = Literal["accept", "reject", "reopen"]

AUDIT_ENTITY = "eregister_observation"
PENDING_STATES = ("draft", "qc_pending")
# State an observation must be in for each action, and the state it moves to.
TRANSITIONS: dict[QcAction, tuple[tuple[str, ...], str]] = {
    "accept": (PENDING_STATES, "accepted"),
    "reject": (PENDING_STATES, "rejected"),
    "reopen": (("accepted", "rejected"), "qc_pending"),
}
REASON_REQUIRED: frozenset[QcAction] = frozenset({"reject", "reopen"})
MIN_REASON = 3
REVIEWABLE_STATES = (*PENDING_STATES, "accepted")


def _reason(action: QcAction, reason: str | None) -> str | None:
    clean = (reason or "").strip() or None
    if action in REASON_REQUIRED and (clean is None or len(clean) < MIN_REASON):
        raise HTTPException(422, f"A reason is required to {action} an observation")
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
        raise HTTPException(404, "Observation not found")
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
    allowed, target = TRANSITIONS[action]
    previous = str(row["state"])
    try:
        if previous not in allowed:
            raise HTTPException(
                409, f"Cannot {action} an observation that is {previous}"
            )
        if action == "accept":
            if row["kind"] != "SYNOP":
                raise HTTPException(409, "Only SYNOP observations go through QC")
            entries.require_valid_synop(row["body"] or {}, row["observed_at"])
        elif await _already_sent_to_wis2(app_session, observation_id):
            raise HTTPException(
                409, "Already queued or sent to WIS2; correct it with a new observation"
            )
        elif action == "reopen" and previous == "rejected":
            # A rejected row left the live set, so the hour may have been keyed again.
            # Same lock as saving; a rejected row is never row-locked by a save, so
            # taking it after the row lock cannot deadlock.
            await entries.lock_key(
                register, str(row["station_id"]), row["observed_at"], str(row["kind"])
            )
            if await entries.live_row(
                register, str(row["station_id"]), row["observed_at"], str(row["kind"])
            ):
                raise HTTPException(
                    409,
                    "Another observation now holds this hour; correct that one instead",
                )
    except HTTPException:
        await register.rollback()
        raise
    try:
        updated = await _set_state(
            register, observation_id, user, target, clean_reason, action
        )
    except IntegrityError as exc:
        await register.rollback()
        if action != "reopen":
            raise
        raise HTTPException(
            409, "Another observation now holds this hour; correct that one instead"
        ) from exc
    saved = dict(updated.mappings().one())
    await register.commit()
    await _audit(
        app_session,
        user=user,
        observation_id=observation_id,
        action=action,
        changes={"state": (previous, target), "qc_notes": (None, clean_reason)},
    )
    return RegisterObservationRead.model_validate(saved)


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


async def review(
    *,
    register: AsyncSession,
    app_session: AsyncSession,
    observation_id: UUID,
    user: User,
    outcome: str,
    note: str | None,
) -> RegisterObservationRead:
    """Record an optional review; the state and any sending are untouched."""
    clean = (note or "").strip() or None
    if outcome == "query" and (clean is None or len(clean) < MIN_REASON):
        raise HTTPException(422, "A note is required to raise a query")
    row = await _lock(register, observation_id)
    try:
        if str(row["actor_id"]) == str(user.id):
            raise HTTPException(
                403, "A different person from the observer records the review"
            )
        if row["state"] not in REVIEWABLE_STATES:
            raise HTTPException(
                409, f"Cannot review an observation that is {row['state']}"
            )
    except HTTPException:
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
