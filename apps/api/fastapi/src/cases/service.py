"""Case engine rules (ADR-0069). Service functions flush; routers commit.

Every query filters on the organisation and the programme, so a case of another
organisation or of another programme is 404. A closed case is locked until it is
reopened. Closing follows ICAO Doc 9859: a case closes when its latest residual
risk is acceptable, or tolerable and accepted by management; an intolerable risk
can never be accepted; a report in which no hazard was found closes as "no risk
found" with a reason. Every corrective action must be verified first.
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src import record_links
from src.auth.models import User
from src.exceptions import AppValidationError
from src.notifications import service as notification_service
from src.organisations.models import Membership, MembershipStatus
from src.pagination import PaginationParams
from src.utils.datetime import utc_now

from . import notifications as case_notifications
from . import risk, transitions
from .exceptions import CaseConflictError, CaseForbiddenError, CaseNotFoundError
from .models import (
    Case,
    CaseAction,
    CaseActionStatus,
    CaseCounter,
    CaseRiskAssessment,
    CaseRiskBand,
    CaseRiskGrid,
    CaseRiskKind,
    CaseStatus,
    Programme,
)
from .schemas import (
    CaseActionCreate,
    CaseActionUpdate,
    CaseCreate,
    CaseRiskAssessmentCreate,
    CaseRiskGridUpdate,
    CaseUpdate,
)

REFERENCE_PREFIX: dict[Programme, str] = {
    Programme.SAFETY: "SAF",
    Programme.AVIATION_SECURITY: "SEC",
    Programme.OCCUPATIONAL_HEALTH: "OHS",
    Programme.ENVIRONMENTAL_MANAGEMENT: "ENV",
}


def naive_utc(moment: datetime) -> datetime:
    if moment.tzinfo is None:
        return moment
    return moment.astimezone(UTC).replace(tzinfo=None)


def _text(value: str | None, message: str) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        raise AppValidationError(message)
    return cleaned


def _escaped(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def names(
    session: AsyncSession, user_ids: set[uuid.UUID]
) -> dict[uuid.UUID, str | None]:
    if not user_ids:
        return {}
    users = await session.scalars(select(User).where(User.id.in_(user_ids)))
    return {user.id: (user.full_name or None) for user in users}


async def _require_member(
    session: AsyncSession, *, organisation_id: str, user_id: uuid.UUID
) -> None:
    found = await session.scalar(
        select(Membership.id).where(
            Membership.organisation_id == organisation_id,
            Membership.user_id == user_id,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
    )
    if found is None:
        raise AppValidationError("The owner must be an active member")


# --- risk grid ----------------------------------------------------------------------


async def get_grid(
    session: AsyncSession, *, organisation_id: str, programme: Programme
) -> risk.Grid:
    row = await session.get(CaseRiskGrid, (organisation_id, programme.value))
    return risk.from_row(row)


async def set_grid(
    session: AsyncSession,
    *,
    organisation_id: str,
    programme: Programme,
    actor: User,
    payload: CaseRiskGridUpdate,
) -> risk.Grid:
    likelihoods = sorted(
        (item.model_dump() for item in payload.likelihoods),
        key=lambda item: -int(item["value"]),
    )
    severities = sorted(
        (item.model_dump() for item in payload.severities),
        key=lambda item: item["code"],
    )
    cells = {index: band.value for index, band in payload.cells.items()}
    risk.validate(likelihoods, severities, cells)
    row = await session.get(CaseRiskGrid, (organisation_id, programme.value))
    if row is None:
        row = CaseRiskGrid(
            organisation_id=organisation_id,
            programme=programme.value,
            likelihoods=likelihoods,
            severities=severities,
            cells=cells,
            updated_by=actor.id,
        )
        session.add(row)
    else:
        row.likelihoods = likelihoods
        row.severities = severities
        row.cells = cells
        row.updated_by = actor.id
    await session.flush()
    return risk.from_row(row)


# --- cases --------------------------------------------------------------------------


@dataclass(frozen=True)
class CaseDetailView:
    case: Case
    assessments: Sequence[CaseRiskAssessment]
    actions: Sequence[CaseAction]
    names: dict[uuid.UUID, str | None]


async def _next_reference(
    session: AsyncSession, *, organisation_id: str, programme: Programme, year: int
) -> str:
    number = await session.scalar(
        pg_insert(CaseCounter)
        .values(
            organisation_id=organisation_id,
            programme=programme.value,
            year=year,
            last_number=1,
        )
        .on_conflict_do_update(
            index_elements=["organisation_id", "programme", "year"],
            set_={"last_number": CaseCounter.last_number + 1},
        )
        .returning(CaseCounter.last_number)
    )
    return f"{REFERENCE_PREFIX[programme]}-{year}-{int(number or 0):04d}"


async def get_case(
    session: AsyncSession,
    *,
    organisation_id: str,
    programme: Programme,
    case_id: str,
    lock: bool = False,
) -> Case:
    query = select(Case).where(
        Case.id == case_id,
        Case.organisation_id == organisation_id,
        Case.programme == programme.value,
    )
    if lock:
        query = query.with_for_update()
    case = await session.scalar(query)
    if case is None:
        raise CaseNotFoundError()
    return case


def _require_unlocked(case: Case) -> None:
    if case.status == CaseStatus.CLOSED.value:
        raise CaseConflictError("This case is closed; reopen it to change it")


async def list_cases(
    session: AsyncSession,
    *,
    organisation_id: str,
    programme: Programme,
    status: CaseStatus | None,
    q: str | None,
    pagination: PaginationParams,
) -> tuple[Sequence[Case], int]:
    query = select(Case).where(
        Case.organisation_id == organisation_id, Case.programme == programme.value
    )
    if status is not None:
        query = query.where(Case.status == status.value)
    if q:
        term = f"%{_escaped(q)}%"
        query = query.where(
            Case.title.ilike(term, escape="\\")
            | Case.reference.ilike(term, escape="\\")
        )
    count = await session.scalar(select(func.count()).select_from(query.subquery()))
    rows = await session.scalars(
        query.order_by(Case.created_at.desc(), Case.id.desc())
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    return rows.all(), int(count or 0)


async def create_case(
    session: AsyncSession,
    *,
    organisation_id: str,
    programme: Programme,
    membership: Membership,
    reporter: User,
    payload: CaseCreate,
) -> Case:
    source_kind = source_id = None
    if payload.source is not None:
        # The reporter must be able to see the record the case is raised from.
        found = await record_links.resolve(
            session,
            organisation_id=organisation_id,
            membership=membership,
            refs=[(payload.source.kind, payload.source.id)],
        )
        if (payload.source.kind, payload.source.id) not in found:
            raise AppValidationError("The source record is not available to you")
        source_kind, source_id = payload.source.kind, payload.source.id
    case = Case(
        organisation_id=organisation_id,
        programme=programme.value,
        reference=await _next_reference(
            session,
            organisation_id=organisation_id,
            programme=programme,
            year=utc_now().year,
        ),
        title=_text(payload.title, "A case needs a title"),
        description=payload.description,
        location=payload.location,
        occurred_at=naive_utc(payload.occurred_at) if payload.occurred_at else None,
        status=CaseStatus.REPORTED.value,
        source_kind=source_kind,
        source_id=source_id,
        reported_by=reporter.id,
    )
    session.add(case)
    await session.flush()
    return case


async def update_case(
    session: AsyncSession,
    *,
    organisation_id: str,
    programme: Programme,
    case_id: str,
    payload: CaseUpdate,
) -> Case:
    case = await get_case(
        session,
        organisation_id=organisation_id,
        programme=programme,
        case_id=case_id,
        lock=True,
    )
    _require_unlocked(case)
    sent = payload.model_fields_set
    if "title" in sent:
        case.title = _text(payload.title, "A case needs a title")
    if "description" in sent:
        case.description = payload.description
    if "location" in sent:
        case.location = payload.location
    if "occurred_at" in sent:
        case.occurred_at = (
            naive_utc(payload.occurred_at) if payload.occurred_at else None
        )
    await session.flush()
    return case


async def _latest_residual(
    session: AsyncSession, case: Case
) -> CaseRiskAssessment | None:
    assessment: CaseRiskAssessment | None = await session.scalar(
        select(CaseRiskAssessment)
        .where(
            CaseRiskAssessment.case_id == case.id,
            CaseRiskAssessment.kind == CaseRiskKind.RESIDUAL.value,
        )
        .order_by(CaseRiskAssessment.created_at.desc(), CaseRiskAssessment.id.desc())
        .limit(1)
    )
    return assessment


async def _check_may_close(session: AsyncSession, case: Case, *, no_risk: bool) -> None:
    unverified = await session.scalar(
        select(func.count())
        .select_from(CaseAction)
        .where(
            CaseAction.case_id == case.id,
            CaseAction.status != CaseActionStatus.VERIFIED.value,
        )
    )
    if unverified:
        raise CaseConflictError(
            f"{unverified} corrective action(s) are not verified yet"
        )
    if no_risk:
        # "No risk found" is for a report with no hazard. Once a risk above
        # acceptable has been assessed, the case closes through the risk rules.
        assessed = await session.scalar(
            select(func.count())
            .select_from(CaseRiskAssessment)
            .where(
                CaseRiskAssessment.case_id == case.id,
                CaseRiskAssessment.band != CaseRiskBand.ACCEPTABLE.value,
            )
        )
        if assessed:
            raise CaseConflictError(
                "A risk above acceptable was assessed; this case cannot close as "
                "no risk found"
            )
        return
    residual = await _latest_residual(session, case)
    if (
        residual is not None
        and case.reopened_at is not None
        and residual.created_at < case.reopened_at
    ):
        raise CaseConflictError(
            "The case was reopened: assess the residual risk again before closing"
        )
    if residual is None:
        raise CaseConflictError(
            "Assess the residual risk first, or close the case as no risk found"
        )
    if residual.band == CaseRiskBand.INTOLERABLE.value:
        raise CaseConflictError(
            "The residual risk is intolerable: mitigate it and assess it again"
        )
    if residual.band == CaseRiskBand.TOLERABLE.value and residual.accepted_at is None:
        raise CaseConflictError(
            "The tolerable residual risk must be accepted before the case closes"
        )


async def change_status(
    session: AsyncSession,
    *,
    organisation_id: str,
    programme: Programme,
    case_id: str,
    actor: User,
    can_approve: bool,
    target: CaseStatus,
    no_risk: bool,
    reason: str | None,
) -> Case:
    case = await get_case(
        session,
        organisation_id=organisation_id,
        programme=programme,
        case_id=case_id,
        lock=True,
    )
    cleaned = (reason or "").strip() or None
    closing = target is CaseStatus.CLOSED
    reopening = case.status == CaseStatus.CLOSED.value
    if (closing or reopening) and not can_approve:
        raise CaseForbiddenError("Closing and reopening a case need the approve key")
    if no_risk and not closing:
        raise AppValidationError("Only closing takes the no-risk flag")
    if (reopening or no_risk) and cleaned is None:
        raise AppValidationError("Give a reason")
    if closing:
        await _check_may_close(session, case, no_risk=no_risk)
    transitions.move_case(
        case,
        target,
        actor_id=actor.id,
        no_risk=no_risk if closing else False,
        reason=cleaned if closing else None,
    )
    await session.flush()
    return case


# --- risk assessments ---------------------------------------------------------------


async def add_assessment(
    session: AsyncSession,
    *,
    organisation_id: str,
    programme: Programme,
    case_id: str,
    actor: User,
    payload: CaseRiskAssessmentCreate,
) -> CaseRiskAssessment:
    case = await get_case(
        session,
        organisation_id=organisation_id,
        programme=programme,
        case_id=case_id,
        lock=True,
    )
    _require_unlocked(case)
    grid = await get_grid(session, organisation_id=organisation_id, programme=programme)
    likelihood_label, severity_label, band = grid.rate(
        payload.likelihood, payload.severity
    )
    assessment = CaseRiskAssessment(
        case_id=case.id,
        organisation_id=organisation_id,
        programme=programme.value,
        kind=payload.kind.value,
        likelihood=payload.likelihood,
        likelihood_label=likelihood_label,
        severity=payload.severity,
        severity_label=severity_label,
        band=band.value,
        rationale=(payload.rationale or "").strip() or None,
        assessed_by=actor.id,
    )
    session.add(assessment)
    await session.flush()
    return assessment


async def accept_risk(
    session: AsyncSession,
    *,
    organisation_id: str,
    programme: Programme,
    case_id: str,
    assessment_id: str,
    actor: User,
    note: str,
) -> CaseRiskAssessment:
    """Management accepts a tolerable residual risk (Doc 9859). Only the latest
    residual assessment can be accepted, and never an intolerable one."""
    case = await get_case(
        session,
        organisation_id=organisation_id,
        programme=programme,
        case_id=case_id,
        lock=True,
    )
    _require_unlocked(case)
    latest = await _latest_residual(session, case)
    if latest is None or latest.id != assessment_id:
        raise CaseConflictError("Only the latest residual assessment can be accepted")
    if latest.band == CaseRiskBand.INTOLERABLE.value:
        raise CaseConflictError("An intolerable risk can never be accepted")
    if latest.band == CaseRiskBand.ACCEPTABLE.value:
        raise CaseConflictError("An acceptable risk needs no acceptance")
    if latest.accepted_at is not None:
        raise CaseConflictError("This risk is already accepted")
    if latest.assessed_by == actor.id:
        raise CaseForbiddenError(
            "A risk is accepted by someone other than the person who assessed it"
        )
    latest.accepted_by = actor.id
    latest.accepted_at = utc_now()
    latest.acceptance_note = _text(note, "Say why the risk is accepted")
    await session.flush()
    return latest


# --- corrective actions -------------------------------------------------------------


async def _get_action(session: AsyncSession, case: Case, action_id: str) -> CaseAction:
    action: CaseAction | None = await session.scalar(
        select(CaseAction).where(
            CaseAction.id == action_id,
            CaseAction.case_id == case.id,
            CaseAction.organisation_id == case.organisation_id,
            CaseAction.programme == case.programme,
        )
    )
    if action is None:
        raise CaseNotFoundError("Action")
    return action


async def _tell_owner(
    session: AsyncSession, case: Case, action: CaseAction, *, actor: User
) -> None:
    if action.owner_user_id == actor.id:
        return
    await notification_service.notify(
        session,
        event_key=case_notifications.ACTION_ASSIGNED,
        organisation_id=case.organisation_id,
        recipients=[action.owner_user_id],
        context={
            "reference": case.reference,
            "title": action.title,
            "due": f"{action.due_date:%-d %B %Y}",
        },
        entity_type="case_action",
        entity_id=action.id,
        exclude=[actor.id],
    )


async def add_action(
    session: AsyncSession,
    *,
    organisation_id: str,
    programme: Programme,
    case_id: str,
    actor: User,
    payload: CaseActionCreate,
) -> CaseAction:
    case = await get_case(
        session,
        organisation_id=organisation_id,
        programme=programme,
        case_id=case_id,
        lock=True,
    )
    _require_unlocked(case)
    await _require_member(
        session, organisation_id=organisation_id, user_id=payload.owner_user_id
    )
    action = CaseAction(
        case_id=case.id,
        organisation_id=organisation_id,
        programme=programme.value,
        title=_text(payload.title, "An action needs a title"),
        description=payload.description,
        owner_user_id=payload.owner_user_id,
        due_date=payload.due_date,
        created_by=actor.id,
    )
    session.add(action)
    await session.flush()
    await _tell_owner(session, case, action, actor=actor)
    return action


async def update_action(
    session: AsyncSession,
    *,
    organisation_id: str,
    programme: Programme,
    case_id: str,
    action_id: str,
    actor: User,
    payload: CaseActionUpdate,
) -> CaseAction:
    case = await get_case(
        session,
        organisation_id=organisation_id,
        programme=programme,
        case_id=case_id,
        lock=True,
    )
    _require_unlocked(case)
    action = await _get_action(session, case, action_id)
    if action.status == CaseActionStatus.VERIFIED.value:
        raise CaseConflictError("A verified action must be sent back to open first")
    sent = payload.model_fields_set
    if "title" in sent:
        action.title = _text(payload.title, "An action needs a title")
    if "description" in sent:
        action.description = payload.description
    if "due_date" in sent:
        if payload.due_date is None:
            raise AppValidationError("An action needs a due date")
        action.due_date = payload.due_date
    if "progress_note" in sent:
        action.progress_note = (payload.progress_note or "").strip() or None
    new_owner = False
    if "owner_user_id" in sent:
        if payload.owner_user_id is None:
            raise AppValidationError("An action needs an owner")
        if payload.owner_user_id != action.owner_user_id:
            await _require_member(
                session, organisation_id=organisation_id, user_id=payload.owner_user_id
            )
            action.owner_user_id = payload.owner_user_id
            new_owner = True
    await session.flush()
    if new_owner:
        await _tell_owner(session, case, action, actor=actor)
    return action


async def change_action_status(
    session: AsyncSession,
    *,
    organisation_id: str,
    programme: Programme,
    case_id: str,
    action_id: str,
    actor: User,
    can_approve: bool,
    target: CaseActionStatus,
) -> CaseAction:
    case = await get_case(
        session,
        organisation_id=organisation_id,
        programme=programme,
        case_id=case_id,
        lock=True,
    )
    _require_unlocked(case)
    action = await _get_action(session, case, action_id)
    if target is CaseActionStatus.VERIFIED:
        if not can_approve:
            raise CaseForbiddenError("Verifying an action needs the approve key")
        if action.owner_user_id == actor.id:
            raise CaseForbiddenError(
                "An action is verified by someone other than its owner"
            )
    transitions.move_action(action, target, actor_id=actor.id)
    await session.flush()
    return action


# --- reading ------------------------------------------------------------------------


async def detail_of(session: AsyncSession, case: Case) -> CaseDetailView:
    assessments = (
        await session.scalars(
            select(CaseRiskAssessment)
            .where(CaseRiskAssessment.case_id == case.id)
            .order_by(CaseRiskAssessment.created_at, CaseRiskAssessment.id)
        )
    ).all()
    actions = (
        await session.scalars(
            select(CaseAction)
            .where(CaseAction.case_id == case.id)
            .order_by(CaseAction.due_date, CaseAction.created_at, CaseAction.id)
        )
    ).all()
    people = {case.reported_by} | {a.owner_user_id for a in actions}
    return CaseDetailView(
        case=case,
        assessments=assessments,
        actions=actions,
        names=await names(session, people),
    )


def is_overdue(action: CaseAction, today: date) -> bool:
    return action.status == CaseActionStatus.OPEN.value and action.due_date < today
