"""QC decisions on register observations: accept, reject, reopen.

The observation row lives in the separate register database and the audit
trail in the application database, so the two cannot share a transaction. The
state change commits first and carries who and when (``qc_by``, ``qc_at``,
``qc_notes``) on the row itself; the audit entry follows in its own commit.

Four-eyes: the person who keyed the observation can never accept it, whatever
their permissions (a superuser included). If nobody else holds ``eregister.qc``
the observation waits; it is not waved through.
"""

from typing import Any, Literal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth.models import User
from src.utils.datetime import utc_now

from . import encode, rules
from .models import STATUS_QUEUED, STATUS_SENT, TARGET_WIS2, ERegisterSend
from .schemas import RegisterObservationRead

QcAction = Literal["accept", "reject", "reopen"]

AUDIT_ENTITY = "eregister_observation"
# State an observation must be in for each action, and the state it moves to.
PENDING_STATES = ("draft", "qc_pending")
TRANSITIONS: dict[QcAction, tuple[tuple[str, ...], str]] = {
    "accept": (PENDING_STATES, "accepted"),
    "reject": (PENDING_STATES, "rejected"),
    "reopen": (("accepted", "rejected"), "qc_pending"),
}
REASON_REQUIRED: frozenset[QcAction] = frozenset({"reject", "reopen"})
MIN_REASON_LENGTH = 3


def _reason(action: QcAction, reason: str | None) -> str | None:
    clean = (reason or "").strip() or None
    if action in REASON_REQUIRED and (clean is None or len(clean) < MIN_REASON_LENGTH):
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


def _check_accept(row: dict[str, Any], user: User) -> None:
    if str(row["actor_id"]) == str(user.id):
        raise HTTPException(
            403, "A different person from the observer must accept an observation"
        )
    if row["kind"] != "SYNOP":
        raise HTTPException(409, "Only SYNOP observations go through QC")
    workbook = encode.workbook_from_body(row["body"] or {})
    issues, _decoded = rules.validate_synop(workbook)
    errors = [issue for issue in issues if issue.severity == "error"]
    if errors:
        detail = "; ".join(f"{issue.field}: {issue.message}" for issue in errors[:3])
        raise HTTPException(422, f"Observation does not pass validation: {detail}")


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
    result = await register.execute(
        text("SELECT * FROM register_observations WHERE id = :id FOR UPDATE"),
        {"id": str(observation_id)},
    )
    found = result.mappings().first()
    if found is None:
        raise HTTPException(404, "Observation not found")
    row = dict(found)
    allowed, target = TRANSITIONS[action]
    previous = str(row["state"])
    if previous not in allowed:
        raise HTTPException(409, f"Cannot {action} an observation that is {previous}")
    if action == "accept":
        _check_accept(row, user)
    if action == "reopen" and await _already_sent_to_wis2(app_session, observation_id):
        raise HTTPException(
            409, "Already queued or sent to WIS2; correct it with a new observation"
        )
    updated = await register.execute(
        text(
            """
            UPDATE register_observations
            SET state = CAST(:state AS register_state), qc_notes = :notes,
                qc_by = :by, qc_at = :at, updated_at = :at
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
        },
    )
    saved = dict(updated.mappings().one())
    await register.commit()
    audit_service.set_actor(app_session, user.id)
    await audit_service.record_change(
        app_session,
        entity_type=AUDIT_ENTITY,
        entity_id=str(observation_id),
        record_type=AUDIT_ENTITY,
        record_id=str(observation_id),
        action=action,
        changes={"state": (previous, target), "qc_notes": (None, clean_reason)},
    )
    await app_session.commit()
    return RegisterObservationRead.model_validate(saved)
