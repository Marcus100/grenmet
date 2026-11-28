"""Case engine rules (ADR-0069). Service functions flush; routers commit.

Every query filters on the organisation and the programme, so a case of another
organisation or of another programme is 404. A closed case is locked until it is
reopened. Closing follows ICAO Doc 9859: a case closes when its latest residual
risk is acceptable, or tolerable and accepted by management; an intolerable risk
can never be accepted; a report in which no hazard was found closes as "no risk
found" with a reason. Every corrective action must be verified first.
"""

import re
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
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
    CaseInvestigation,
    CaseInvestigationFactor,
    CaseRiskAssessment,
    CaseRiskBand,
    CaseRiskGrid,
    CaseRiskKind,
    CaseStatus,
    ContributingFactor,
    FactorCategory,
    FactorSeed,
    InvestigationStatus,
    Programme,
    new_factor_id,
)
from .schemas import (
    FACTOR_ID_PATTERN,
    CaseActionCreate,
    CaseActionUpdate,
    CaseCreate,
    CaseRiskAssessmentCreate,
    CaseRiskGridUpdate,
    CaseUpdate,
    ContributingFactorCreate,
    ContributingFactorUpdate,
    InvestigationUpdate,
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
class FactorLink:
    factor_id: str
    name: str
    category: str
    is_active: bool


@dataclass(frozen=True)
class InvestigationView:
    investigation: CaseInvestigation
    factors: Sequence[FactorLink]


@dataclass(frozen=True)
class CaseDetailView:
    case: Case
    assessments: Sequence[CaseRiskAssessment]
    actions: Sequence[CaseAction]
    names: dict[uuid.UUID, str | None]
    investigation: InvestigationView | None


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
    if (
        target is CaseStatus.ACTIONS
        and target.value in transitions.CASE_TRANSITIONS.get(case.status, frozenset())
    ):
        await _check_investigation_decided(session, case)
    transitions.move_case(
        case,
        target,
        actor_id=actor.id,
        no_risk=no_risk if closing else False,
        reason=cleaned if closing else None,
    )
    if reopening:
        # A reopened case reassesses its investigation: an approved or not-needed
        # one returns to draft and must be decided again (ADR-0069 decision 5).
        investigation = await investigation_of(session, case)
        if investigation is not None:
            _reopen_investigation(investigation, actor_id=actor.id)
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
    investigation = await investigation_view_of(session, case)
    if investigation is not None:
        people.add(investigation.investigation.created_by)
    return CaseDetailView(
        case=case,
        assessments=assessments,
        actions=actions,
        names=await names(session, people),
        investigation=investigation,
    )


def is_overdue(action: CaseAction, today: date) -> bool:
    return action.status == CaseActionStatus.OPEN.value and action.due_date < today


# --- contributing factors -------------------------------------------------------------

#: The starting list (ICAO Doc 9859 and SHELL-style categories).
DEFAULT_CONTRIBUTING_FACTORS: tuple[tuple[FactorCategory, str], ...] = (
    (FactorCategory.HUMAN_FACTORS, "Fatigue"),
    (FactorCategory.HUMAN_FACTORS, "Workload or distraction"),
    (FactorCategory.PROCEDURES, "Procedure missing or unclear"),
    (FactorCategory.PROCEDURES, "Procedure not followed"),
    (FactorCategory.EQUIPMENT, "Equipment failure or defect"),
    (FactorCategory.EQUIPMENT, "Equipment unavailable"),
    (FactorCategory.ENVIRONMENT, "Weather"),
    (FactorCategory.ENVIRONMENT, "Lighting or visibility"),
    (FactorCategory.ENVIRONMENT, "Surface condition"),
    (FactorCategory.ORGANISATION, "Staffing or resources"),
    (FactorCategory.ORGANISATION, "Schedule pressure"),
    (FactorCategory.TRAINING, "Training not given or out of date"),
    (FactorCategory.TRAINING, "Competence not checked"),
    (FactorCategory.COMMUNICATION, "Handover or briefing gap"),
    (FactorCategory.COMMUNICATION, "Unclear instruction"),
    (FactorCategory.SUPERVISION, "Supervision not provided"),
)


async def is_seeded(
    session: AsyncSession, *, organisation_id: str, programme: Programme
) -> bool:
    marker = await session.scalar(
        select(FactorSeed.organisation_id).where(
            FactorSeed.organisation_id == organisation_id,
            FactorSeed.programme == programme.value,
        )
    )
    return marker is not None


async def seed_default_factors(
    session: AsyncSession, *, organisation_id: str, programme: Programme
) -> None:
    """Write the starting list once, on a write path. The marker row decides, not the
    factor rows, so a custom factor written first does not stop the seeding. Seeded
    rows have no creating user (system), and a default whose name is already taken
    is skipped. Written through the ORM so the audit trail sees every row."""
    if await is_seeded(session, organisation_id=organisation_id, programme=programme):
        return
    now = utc_now()
    # Two first writes can both pass the check above. The marker's primary key lets
    # exactly one win; the other waits for it, hits the key, and backs out because the
    # winner seeds the list in its own transaction. A savepoint, not
    # ON CONFLICT DO NOTHING: the marker is written through the ORM so the audit trail
    # records it ("Contributing factor list seed"), and a Core insert would skip that.
    # begin_nested() flushes whatever is already pending when it opens. Do that here,
    # outside the try, so a conflict on some other pending row is not mistaken for a
    # lost race and swallowed.
    await session.flush()
    try:
        async with session.begin_nested():
            session.add(
                FactorSeed(
                    organisation_id=organisation_id,
                    programme=programme.value,
                    seeded_at=now,
                )
            )
    except IntegrityError:
        return
    taken = set(
        (
            await session.scalars(
                select(func.lower(ContributingFactor.name)).where(
                    ContributingFactor.organisation_id == organisation_id,
                    ContributingFactor.programme == programme.value,
                )
            )
        ).all()
    )
    for category, name in DEFAULT_CONTRIBUTING_FACTORS:
        if name.lower() in taken:
            continue
        session.add(
            ContributingFactor(
                id=new_factor_id(),
                organisation_id=organisation_id,
                programme=programme.value,
                category=category.value,
                name=name,
                is_active=True,
                created_by=None,
                created_at=now,
                updated_at=now,
            )
        )
    await session.flush()


async def list_factors(
    session: AsyncSession, *, organisation_id: str, programme: Programme
) -> Sequence[ContributingFactor]:
    rows = await session.scalars(
        select(ContributingFactor)
        .where(
            ContributingFactor.organisation_id == organisation_id,
            ContributingFactor.programme == programme.value,
        )
        .order_by(ContributingFactor.category, ContributingFactor.name)
    )
    return rows.all()


async def _get_factor(
    session: AsyncSession, *, organisation_id: str, programme: Programme, factor_id: str
) -> ContributingFactor:
    factor = await session.scalar(
        select(ContributingFactor).where(
            ContributingFactor.id == factor_id,
            ContributingFactor.organisation_id == organisation_id,
            ContributingFactor.programme == programme.value,
        )
    )
    if factor is None:
        raise CaseNotFoundError("Contributing factor")
    return factor


async def _name_taken(
    session: AsyncSession,
    *,
    organisation_id: str,
    programme: Programme,
    name: str,
    except_id: str | None = None,
) -> bool:
    query = select(ContributingFactor.id).where(
        ContributingFactor.organisation_id == organisation_id,
        ContributingFactor.programme == programme.value,
        func.lower(ContributingFactor.name) == name.lower(),
    )
    if except_id is not None:
        query = query.where(ContributingFactor.id != except_id)
    return (await session.scalar(query.limit(1))) is not None


_FACTOR_NAME_TAKEN = "A factor with this name is already on the list"


async def _flush_factor(session: AsyncSession) -> None:
    """Flush a factor write inside a savepoint: a name the database refuses (the
    case-insensitive unique index, if a concurrent writer won) becomes a 409."""
    try:
        async with session.begin_nested():
            await session.flush()
    except IntegrityError as error:
        raise CaseConflictError(_FACTOR_NAME_TAKEN) from error


async def create_factor(
    session: AsyncSession,
    *,
    organisation_id: str,
    programme: Programme,
    actor: User,
    payload: ContributingFactorCreate,
) -> ContributingFactor:
    await seed_default_factors(
        session, organisation_id=organisation_id, programme=programme
    )
    name = _text(payload.name, "A factor needs a name")
    if await _name_taken(
        session, organisation_id=organisation_id, programme=programme, name=name
    ):
        raise CaseConflictError(_FACTOR_NAME_TAKEN)
    factor = ContributingFactor(
        id=new_factor_id(),
        organisation_id=organisation_id,
        programme=programme.value,
        category=payload.category.value,
        name=name,
        is_active=True,
        created_by=actor.id,
    )
    session.add(factor)
    await _flush_factor(session)
    return factor


async def update_factor(
    session: AsyncSession,
    *,
    organisation_id: str,
    programme: Programme,
    factor_id: str,
    payload: ContributingFactorUpdate,
) -> ContributingFactor:
    await seed_default_factors(
        session, organisation_id=organisation_id, programme=programme
    )
    factor = await _get_factor(
        session,
        organisation_id=organisation_id,
        programme=programme,
        factor_id=factor_id,
    )
    sent = payload.model_fields_set
    if "name" in sent:
        name = _text(payload.name, "A factor needs a name")
        if await _name_taken(
            session,
            organisation_id=organisation_id,
            programme=programme,
            name=name,
            except_id=factor.id,
        ):
            raise CaseConflictError(_FACTOR_NAME_TAKEN)
        factor.name = name
    if "category" in sent:
        if payload.category is None:
            raise AppValidationError("A factor needs a category")
        factor.category = payload.category.value
    if "is_active" in sent:
        if payload.is_active is None:
            raise AppValidationError("Say whether the factor is active")
        factor.is_active = payload.is_active
    await _flush_factor(session)
    return factor


# --- investigation --------------------------------------------------------------------

_READ_ONLY = "The investigation is decided and read-only; reopen the case to change it"


async def investigation_of(
    session: AsyncSession, case: Case
) -> CaseInvestigation | None:
    row: CaseInvestigation | None = await session.scalar(
        select(CaseInvestigation).where(
            CaseInvestigation.case_id == case.id,
            CaseInvestigation.organisation_id == case.organisation_id,
            CaseInvestigation.programme == case.programme,
        )
    )
    return row


async def investigation_view_of(
    session: AsyncSession, case: Case
) -> InvestigationView | None:
    investigation = await investigation_of(session, case)
    if investigation is None:
        return None
    return await _view(session, investigation)


async def _view(
    session: AsyncSession, investigation: CaseInvestigation
) -> InvestigationView:
    """Decided investigations show the factor names and categories as they were at
    approval (the link snapshot); open ones show the list's current values."""
    decided = investigation.status in (
        InvestigationStatus.APPROVED.value,
        InvestigationStatus.NOT_NEEDED.value,
    )
    rows = (
        await session.execute(
            select(CaseInvestigationFactor, ContributingFactor)
            .join(
                ContributingFactor,
                ContributingFactor.id == CaseInvestigationFactor.factor_id,
            )
            .where(
                CaseInvestigationFactor.investigation_id == investigation.id,
                CaseInvestigationFactor.organisation_id
                == investigation.organisation_id,
            )
        )
    ).all()
    links = [
        FactorLink(
            factor_id=link.factor_id,
            name=link.name_snapshot if decided else factor.name,
            category=link.category_snapshot if decided else factor.category,
            is_active=factor.is_active,
        )
        for link, factor in rows
    ]
    links.sort(key=lambda item: (item.category, item.name))
    return InvestigationView(investigation=investigation, factors=links)


async def _refresh_snapshots(
    session: AsyncSession, investigation: CaseInvestigation
) -> None:
    rows = (
        await session.execute(
            select(CaseInvestigationFactor, ContributingFactor)
            .join(
                ContributingFactor,
                ContributingFactor.id == CaseInvestigationFactor.factor_id,
            )
            .where(CaseInvestigationFactor.investigation_id == investigation.id)
        )
    ).all()
    for link, factor in rows:
        link.name_snapshot = factor.name
        link.category_snapshot = factor.category


def _require_investigating(case: Case) -> None:
    if case.status != CaseStatus.INVESTIGATING.value:
        raise CaseConflictError(
            "Move the case to investigating before writing its investigation"
        )


def _require_draft(investigation: CaseInvestigation) -> None:
    if investigation.status == InvestigationStatus.SUBMITTED.value:
        raise CaseConflictError(
            "The investigation is awaiting approval and cannot change"
        )
    if investigation.status != InvestigationStatus.DRAFT.value:
        raise CaseConflictError(_READ_ONLY)


def _is_party(investigation: CaseInvestigation, actor_id: uuid.UUID) -> bool:
    """Whoever created, edited (at any point) or submitted the investigation may not
    approve, return or waive it."""
    if actor_id in {investigation.created_by, investigation.submitted_by}:
        return True
    return str(actor_id) in set(investigation.editor_ids or [])


def _record_edit(investigation: CaseInvestigation, actor: User) -> None:
    investigation.last_edited_by = actor.id
    editors = list(investigation.editor_ids or [])
    if str(actor.id) not in editors:
        editors.append(str(actor.id))
    investigation.editor_ids = editors


async def _investigation_for_write(
    session: AsyncSession, case: Case, actor: User
) -> CaseInvestigation:
    investigation = await investigation_of(session, case)
    if investigation is None:
        investigation = CaseInvestigation(
            case_id=case.id,
            organisation_id=case.organisation_id,
            programme=case.programme,
            status=InvestigationStatus.DRAFT.value,
            why_steps=[],
            created_by=actor.id,
            last_edited_by=actor.id,
            editor_ids=[str(actor.id)],
        )
        session.add(investigation)
        await session.flush()
    return investigation


def _optional(value: str | None) -> str | None:
    return (value or "").strip() or None


_FACTOR_ID = re.compile(FACTOR_ID_PATTERN)
FACTOR_NOT_CHOOSABLE = "A contributing factor is not on this programme's active list"


def require_factor_id_shape(factor_ids: list[str]) -> None:
    """Refuse an id that is not the shape the service issues, before it reaches a query.

    The body field stays a plain list of strings in the contract: tightening it there
    would be a breaking change to the request schema, and a client that sends such an id
    already got this 422 (the lookup found nothing). This keeps that answer and stops
    a junk or oversized string from ever being sent to the database as a value."""
    if not all(_FACTOR_ID.fullmatch(factor_id) for factor_id in factor_ids):
        raise AppValidationError(FACTOR_NOT_CHOOSABLE)


async def _set_factors(
    session: AsyncSession,
    *,
    investigation: CaseInvestigation,
    factor_ids: list[str],
) -> None:
    """Replace the chosen factors. A factor already chosen stays choosable even if it
    has since been retired; a newly added one must be active. Links keep the factor's
    name and category as they are now."""
    require_factor_id_shape(factor_ids)
    wanted = list(dict.fromkeys(factor_ids))
    current = (
        await session.scalars(
            select(CaseInvestigationFactor).where(
                CaseInvestigationFactor.investigation_id == investigation.id
            )
        )
    ).all()
    linked = {row.factor_id for row in current}
    factors: dict[str, ContributingFactor] = {}
    if wanted:
        found = await session.scalars(
            select(ContributingFactor).where(
                ContributingFactor.id.in_(wanted),
                ContributingFactor.organisation_id == investigation.organisation_id,
                ContributingFactor.programme == investigation.programme,
            )
        )
        factors = {factor.id: factor for factor in found}
        for factor_id in wanted:
            factor = factors.get(factor_id)
            if factor is None or (not factor.is_active and factor_id not in linked):
                raise AppValidationError(FACTOR_NOT_CHOOSABLE)
    for row in current:
        if row.factor_id not in wanted:
            await session.delete(row)
    for factor_id in wanted:
        factor = factors[factor_id]
        existing = next((r for r in current if r.factor_id == factor_id), None)
        if existing is None:
            session.add(
                CaseInvestigationFactor(
                    investigation_id=investigation.id,
                    factor_id=factor_id,
                    organisation_id=investigation.organisation_id,
                    programme=investigation.programme,
                    name_snapshot=factor.name,
                    category_snapshot=factor.category,
                )
            )
        else:
            existing.name_snapshot = factor.name
            existing.category_snapshot = factor.category


async def update_investigation(
    session: AsyncSession,
    *,
    organisation_id: str,
    programme: Programme,
    case_id: str,
    actor: User,
    payload: InvestigationUpdate,
) -> InvestigationView:
    case = await get_case(
        session,
        organisation_id=organisation_id,
        programme=programme,
        case_id=case_id,
        lock=True,
    )
    _require_unlocked(case)
    _require_investigating(case)
    await seed_default_factors(
        session, organisation_id=organisation_id, programme=programme
    )
    investigation = await _investigation_for_write(session, case, actor)
    _require_draft(investigation)
    sent = payload.model_fields_set
    if "what_happened" in sent:
        investigation.what_happened = _optional(payload.what_happened)
    if "unsafe_acts" in sent:
        investigation.unsafe_acts = _optional(payload.unsafe_acts)
    if "unsafe_conditions" in sent:
        investigation.unsafe_conditions = _optional(payload.unsafe_conditions)
    if "root_cause" in sent:
        investigation.root_cause = _optional(payload.root_cause)
    if "why_steps" in sent:
        investigation.why_steps = [
            {"question": step.question, "answer": step.answer}
            for step in (payload.why_steps or [])
        ]
    if "contributing_factor_ids" in sent:
        await _set_factors(
            session,
            investigation=investigation,
            factor_ids=payload.contributing_factor_ids or [],
        )
    _record_edit(investigation, actor)
    await session.flush()
    return await _view(session, investigation)


async def get_investigation(
    session: AsyncSession, *, organisation_id: str, programme: Programme, case_id: str
) -> InvestigationView:
    case = await get_case(
        session,
        organisation_id=organisation_id,
        programme=programme,
        case_id=case_id,
    )
    view = await investigation_view_of(session, case)
    if view is None:
        raise CaseNotFoundError("Investigation")
    return view


async def submit_investigation(
    session: AsyncSession,
    *,
    organisation_id: str,
    programme: Programme,
    case_id: str,
    actor: User,
) -> InvestigationView:
    """Send the draft for approval. Needs what happened, at least one why with every
    answer, and a root cause."""
    case = await get_case(
        session,
        organisation_id=organisation_id,
        programme=programme,
        case_id=case_id,
        lock=True,
    )
    _require_unlocked(case)
    _require_investigating(case)
    investigation = await investigation_of(session, case)
    if investigation is None:
        raise CaseConflictError("Write the investigation before submitting it")
    _require_draft(investigation)
    if investigation.what_happened is None:
        raise AppValidationError("Say what happened before submitting")
    if not investigation.why_steps:
        raise AppValidationError("Ask at least one why before submitting")
    if any(not step.get("answer") for step in investigation.why_steps):
        raise AppValidationError("Answer every why before submitting")
    if investigation.root_cause is None:
        raise AppValidationError("State the root cause before submitting")
    transitions.move_investigation(
        investigation, InvestigationStatus.SUBMITTED, actor_id=actor.id
    )
    await session.flush()
    return await _view(session, investigation)


async def _review_target(
    session: AsyncSession,
    *,
    organisation_id: str,
    programme: Programme,
    case_id: str,
    actor: User,
) -> CaseInvestigation:
    case = await get_case(
        session,
        organisation_id=organisation_id,
        programme=programme,
        case_id=case_id,
        lock=True,
    )
    _require_unlocked(case)
    _require_investigating(case)
    investigation = await investigation_of(session, case)
    if investigation is None:
        raise CaseConflictError("There is no investigation to review")
    if investigation.status != InvestigationStatus.SUBMITTED.value:
        raise CaseConflictError(
            "Only a submitted investigation can be approved or returned"
        )
    if _is_party(investigation, actor.id):
        raise CaseForbiddenError(
            "An investigation is reviewed by someone who did not create, edit or "
            "submit it"
        )
    return investigation


async def approve_investigation(
    session: AsyncSession,
    *,
    organisation_id: str,
    programme: Programme,
    case_id: str,
    actor: User,
) -> InvestigationView:
    investigation = await _review_target(
        session,
        organisation_id=organisation_id,
        programme=programme,
        case_id=case_id,
        actor=actor,
    )
    transitions.move_investigation(
        investigation, InvestigationStatus.APPROVED, actor_id=actor.id
    )
    await _refresh_snapshots(session, investigation)
    await session.flush()
    return await _view(session, investigation)


async def return_investigation(
    session: AsyncSession,
    *,
    organisation_id: str,
    programme: Programme,
    case_id: str,
    actor: User,
    reason: str,
) -> InvestigationView:
    cleaned = _text(reason, "Say why the investigation is returned")
    investigation = await _review_target(
        session,
        organisation_id=organisation_id,
        programme=programme,
        case_id=case_id,
        actor=actor,
    )
    transitions.move_investigation(
        investigation,
        InvestigationStatus.DRAFT,
        actor_id=actor.id,
        reason=cleaned,
    )
    await session.flush()
    return await _view(session, investigation)


async def _has_content(session: AsyncSession, investigation: CaseInvestigation) -> bool:
    if any(
        (
            investigation.what_happened,
            investigation.unsafe_acts,
            investigation.unsafe_conditions,
            investigation.root_cause,
            investigation.why_steps,
        )
    ):
        return True
    chosen = await session.scalar(
        select(func.count())
        .select_from(CaseInvestigationFactor)
        .where(CaseInvestigationFactor.investigation_id == investigation.id)
    )
    return bool(chosen)


async def waive_investigation(
    session: AsyncSession,
    *,
    organisation_id: str,
    programme: Programme,
    case_id: str,
    actor: User,
    reason: str,
) -> InvestigationView:
    """Record, with a reason, that the case needs no investigation. Allowed while the
    case is assessing or investigating. It is a decision for a case that needs none,
    not a way to waive written work: refused when the actor created, edited or
    submitted the investigation, or when the draft already holds content. On an empty
    draft it stores the reason only."""
    case = await get_case(
        session,
        organisation_id=organisation_id,
        programme=programme,
        case_id=case_id,
        lock=True,
    )
    _require_unlocked(case)
    if case.status not in (
        CaseStatus.ASSESSING.value,
        CaseStatus.INVESTIGATING.value,
    ):
        raise CaseConflictError(
            "The no-investigation decision is made while the case is assessing or "
            "investigating"
        )
    cleaned = _text(reason, "Say why no investigation is needed")
    investigation = await investigation_of(session, case)
    if investigation is None:
        investigation = await _investigation_for_write(session, case, actor)
    else:
        if investigation.status != InvestigationStatus.DRAFT.value:
            raise CaseConflictError(
                "An investigation that is decided or awaiting approval cannot be waived"
            )
        if _is_party(investigation, actor.id):
            raise CaseForbiddenError(
                "Someone who created, edited or submitted the investigation cannot "
                "waive it"
            )
        if await _has_content(session, investigation):
            raise CaseConflictError(
                "The draft already holds investigation content, so it cannot be "
                "waived; approve it instead"
            )
        _record_edit(investigation, actor)
    transitions.move_investigation(
        investigation,
        InvestigationStatus.NOT_NEEDED,
        actor_id=actor.id,
        reason=cleaned,
    )
    await session.flush()
    return await _view(session, investigation)


def _reopen_investigation(
    investigation: CaseInvestigation, *, actor_id: uuid.UUID
) -> None:
    """A reopened case returns its investigation to a clean draft. The decision, the
    waiver reason, the last return and the submission are cleared; the audit history
    keeps them."""
    if investigation.status != InvestigationStatus.DRAFT.value:
        transitions.move_investigation(
            investigation, InvestigationStatus.DRAFT, actor_id=actor_id
        )
    investigation.no_investigation_reason = None
    investigation.return_reason = None
    investigation.returned_by = None
    investigation.returned_at = None
    investigation.submitted_by = None
    investigation.submitted_at = None


async def _check_investigation_decided(session: AsyncSession, case: Case) -> None:
    """The actions stage needs a decided investigation: approved, or not needed."""
    investigation = await investigation_of(session, case)
    if investigation is None or investigation.status not in (
        InvestigationStatus.APPROVED.value,
        InvestigationStatus.NOT_NEEDED.value,
    ):
        raise CaseConflictError(
            "Approve the investigation, or record that none is needed, before the "
            "actions stage"
        )
