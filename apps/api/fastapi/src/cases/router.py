"""Case engine routes (ADR-0069, ADR-0025 zone ``org``).

``/cases/org/{programme}/...`` acts for the organisation named in
``X-Barrels-Organisation``. Each programme is its own product: the organisation
needs that programme's entitlement and the caller that programme's key
(``<programme>.cases.read``, ``.cases.write``, ``.cases.approve``,
``<programme>.settings.manage``). Owners and admins hold them. No superuser
bypass. Only ``safety`` exists today. Routers commit; service functions flush.
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status

from src import record_links
from src.dependencies import SessionDep
from src.openapi_responses import AUTHENTICATED, BAD_REQUEST, CONFLICT, NOT_FOUND
from src.pagination import PaginationDep
from src.utils.datetime import utc_now

from . import service
from .dependencies import CaseContext, has_key, require_case_permission
from .models import (
    Case,
    CaseAction,
    CaseActionStatus,
    CaseRiskAssessment,
    CaseRiskBand,
    CaseRiskKind,
    CaseStatus,
)
from .risk import Grid
from .schemas import (
    CaseActionCreate,
    CaseActionPublic,
    CaseActionStatusChange,
    CaseActionUpdate,
    CaseCreate,
    CaseDetail,
    CasePage,
    CasePublic,
    CaseRiskAcceptance,
    CaseRiskAssessmentCreate,
    CaseRiskAssessmentPublic,
    CaseRiskGridPublic,
    CaseRiskGridUpdate,
    CaseRiskLikelihood,
    CaseRiskSeverity,
    CaseSourcePublic,
    CaseStatusChange,
    CaseUpdate,
)

router = APIRouter(prefix="/cases/org/{programme}", tags=["cases"])

CaseReader = Annotated[CaseContext, Depends(require_case_permission("cases.read"))]
CaseWriter = Annotated[CaseContext, Depends(require_case_permission("cases.write"))]
CaseApprover = Annotated[CaseContext, Depends(require_case_permission("cases.approve"))]
CaseSettings = Annotated[
    CaseContext, Depends(require_case_permission("settings.manage"))
]

READ_ERRORS = {**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND}
WRITE_ERRORS = {**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND, **CONFLICT}


def _grid(grid: Grid) -> CaseRiskGridPublic:
    return CaseRiskGridPublic(
        likelihoods=[CaseRiskLikelihood(**item) for item in grid.likelihoods],
        severities=[CaseRiskSeverity(**item) for item in grid.severities],
        cells={index: CaseRiskBand(band) for index, band in grid.cells.items()},
        custom=grid.custom,
    )


def _assessment(row: CaseRiskAssessment) -> CaseRiskAssessmentPublic:
    return CaseRiskAssessmentPublic(
        id=row.id,
        kind=CaseRiskKind(row.kind),
        likelihood=row.likelihood,
        likelihood_label=row.likelihood_label,
        severity=row.severity,
        severity_label=row.severity_label,
        index=f"{row.likelihood}{row.severity}",
        band=CaseRiskBand(row.band),
        rationale=row.rationale,
        assessed_by=row.assessed_by,
        accepted_by=row.accepted_by,
        accepted_at=row.accepted_at,
        acceptance_note=row.acceptance_note,
        created_at=row.created_at,
    )


def _action(row: CaseAction, owner_name: str | None) -> CaseActionPublic:
    return CaseActionPublic(
        id=row.id,
        case_id=row.case_id,
        title=row.title,
        description=row.description,
        owner_user_id=row.owner_user_id,
        owner_name=owner_name,
        due_date=row.due_date,
        overdue=service.is_overdue(row, utc_now().date()),
        status=CaseActionStatus(row.status),
        progress_note=row.progress_note,
        done_at=row.done_at,
        verified_by=row.verified_by,
        verified_at=row.verified_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _case(
    case: Case,
    reporter_name: str | None,
    links: dict[tuple[str, str], record_links.RecordLink],
) -> CasePublic:
    source = None
    if case.source_kind is not None and case.source_id is not None:
        link = links.get((case.source_kind, case.source_id))
        source = CaseSourcePublic(
            kind=case.source_kind,
            id=case.source_id,
            title=link.title if link else None,
            available=link is not None,
        )
    return CasePublic(
        id=case.id,
        programme=case.programme,
        reference=case.reference,
        title=case.title,
        description=case.description,
        location=case.location,
        occurred_at=case.occurred_at,
        status=CaseStatus(case.status),
        source=source,
        reported_by=case.reported_by,
        reported_by_name=reporter_name,
        closed_at=case.closed_at,
        closed_by=case.closed_by,
        closed_no_risk=case.closed_no_risk,
        close_reason=case.close_reason,
        created_at=case.created_at,
        updated_at=case.updated_at,
    )


async def _links(
    session: SessionDep, context: CaseContext, cases: list[Case]
) -> dict[tuple[str, str], record_links.RecordLink]:
    refs = [
        (c.source_kind, c.source_id)
        for c in cases
        if c.source_kind is not None and c.source_id is not None
    ]
    if not refs:
        return {}
    return await record_links.resolve(
        session,
        organisation_id=context.organisation_id,
        membership=context.org.membership,
        refs=refs,
    )


async def _detail(session: SessionDep, context: CaseContext, case: Case) -> CaseDetail:
    view = await service.detail_of(session, case)
    links = await _links(session, context, [case])
    base = _case(case, view.names.get(case.reported_by), links)
    return CaseDetail(
        **base.model_dump(),
        risk_assessments=[_assessment(a) for a in view.assessments],
        actions=[_action(a, view.names.get(a.owner_user_id)) for a in view.actions],
    )


# --- risk grid ----------------------------------------------------------------------


@router.get(
    "/risk-grid",
    response_model=CaseRiskGridPublic,
    summary="Read the programme's risk grid",
    description=(
        "Likelihood against severity, and the band of every cell. Until the "
        "organisation sets its own, this is the ICAO Doc 9859 example grid."
    ),
    operation_id="casesGetRiskGrid",
    responses=READ_ERRORS,
)
async def get_risk_grid(*, session: SessionDep, context: CaseReader) -> Any:
    grid = await service.get_grid(
        session, organisation_id=context.organisation_id, programme=context.programme
    )
    return _grid(grid)


@router.put(
    "/risk-grid",
    response_model=CaseRiskGridPublic,
    summary="Set the organisation's own risk grid",
    description=(
        "Two to seven levels each way and exactly one band (`acceptable`, "
        "`tolerable`, `intolerable`) per cell. Past assessments keep the labels and "
        "band they were made with."
    ),
    operation_id="casesSetRiskGrid",
    responses=WRITE_ERRORS,
)
async def set_risk_grid(
    *, session: SessionDep, context: CaseSettings, payload: CaseRiskGridUpdate
) -> Any:
    grid = await service.set_grid(
        session,
        organisation_id=context.organisation_id,
        programme=context.programme,
        actor=context.org.user,
        payload=payload,
    )
    await session.commit()
    return _grid(grid)


# --- cases --------------------------------------------------------------------------


@router.get(
    "/cases",
    response_model=CasePage,
    summary="List cases",
    description="Newest first. `q` searches the title and reference.",
    operation_id="casesListCases",
    responses=READ_ERRORS,
)
async def list_cases(
    *,
    session: SessionDep,
    context: CaseReader,
    pagination: PaginationDep,
    status_filter: Annotated[CaseStatus | None, Query(alias="status")] = None,
    q: Annotated[str | None, Query(max_length=200)] = None,
) -> Any:
    rows, count = await service.list_cases(
        session,
        organisation_id=context.organisation_id,
        programme=context.programme,
        status=status_filter,
        q=q,
        pagination=pagination,
    )
    cases = list(rows)
    reporters = await service.names(session, {c.reported_by for c in cases})
    links = await _links(session, context, cases)
    size = pagination.size
    return CasePage(
        data=[_case(c, reporters.get(c.reported_by), links) for c in cases],
        count=count,
        page=pagination.page,
        size=size,
        total_pages=(count + size - 1) // size if count > 0 else 1,
    )


@router.post(
    "/cases",
    response_model=CaseDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Report a case",
    description=(
        "A concern, or a case raised from another record (`source`, for example "
        "an incident the caller may see). References run per programme and year, "
        "such as `SAF-2026-0001`."
    ),
    operation_id="casesCreateCase",
    responses=WRITE_ERRORS,
)
async def create_case(
    *, session: SessionDep, context: CaseWriter, payload: CaseCreate
) -> Any:
    case = await service.create_case(
        session,
        organisation_id=context.organisation_id,
        programme=context.programme,
        membership=context.org.membership,
        reporter=context.org.user,
        payload=payload,
    )
    await session.commit()
    return await _detail(session, context, case)


@router.get(
    "/cases/{case_id}",
    response_model=CaseDetail,
    summary="Read a case",
    description="With its risk assessments and corrective actions.",
    operation_id="casesGetCase",
    responses=READ_ERRORS,
)
async def get_case(*, session: SessionDep, context: CaseReader, case_id: str) -> Any:
    case = await service.get_case(
        session,
        organisation_id=context.organisation_id,
        programme=context.programme,
        case_id=case_id,
    )
    return await _detail(session, context, case)


@router.patch(
    "/cases/{case_id}",
    response_model=CaseDetail,
    summary="Change a case",
    description="Only the fields sent change. A closed case is locked (409).",
    operation_id="casesUpdateCase",
    responses=WRITE_ERRORS,
)
async def update_case(
    *, session: SessionDep, context: CaseWriter, case_id: str, payload: CaseUpdate
) -> Any:
    case = await service.update_case(
        session,
        organisation_id=context.organisation_id,
        programme=context.programme,
        case_id=case_id,
        payload=payload,
    )
    await session.commit()
    return await _detail(session, context, case)


@router.post(
    "/cases/{case_id}/status",
    response_model=CaseDetail,
    summary="Move a case to another stage",
    description=(
        "Reported, assessing, investigating, actions, monitoring, closed. Closing "
        "and reopening need the approve key. A case closes only when every "
        "corrective action is verified and its latest residual risk is acceptable, "
        "or tolerable and accepted; an intolerable risk blocks closing. `no_risk` "
        "with a `reason` closes a report in which no hazard was found."
    ),
    operation_id="casesChangeCaseStatus",
    responses=WRITE_ERRORS,
)
async def change_case_status(
    *,
    session: SessionDep,
    context: CaseWriter,
    case_id: str,
    payload: CaseStatusChange,
) -> Any:
    case = await service.change_status(
        session,
        organisation_id=context.organisation_id,
        programme=context.programme,
        case_id=case_id,
        actor=context.org.user,
        can_approve=await has_key(session, context, "cases.approve"),
        target=payload.status,
        no_risk=payload.no_risk,
        reason=payload.reason,
    )
    await session.commit()
    return await _detail(session, context, case)


# --- risk ---------------------------------------------------------------------------


@router.post(
    "/cases/{case_id}/risk-assessments",
    response_model=CaseRiskAssessmentPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Assess the risk of a case",
    description=(
        "`initial` before controls, `residual` after them. The band comes from the "
        "programme's grid. Assessments are never changed; assess again instead."
    ),
    operation_id="casesCreateRiskAssessment",
    responses=WRITE_ERRORS,
)
async def create_risk_assessment(
    *,
    session: SessionDep,
    context: CaseWriter,
    case_id: str,
    payload: CaseRiskAssessmentCreate,
) -> Any:
    assessment = await service.add_assessment(
        session,
        organisation_id=context.organisation_id,
        programme=context.programme,
        case_id=case_id,
        actor=context.org.user,
        payload=payload,
    )
    await session.commit()
    return _assessment(assessment)


@router.post(
    "/cases/{case_id}/risk-assessments/{assessment_id}/acceptance",
    response_model=CaseRiskAssessmentPublic,
    summary="Accept a tolerable residual risk",
    description=(
        "Management's acceptance, with a note. Only the latest residual assessment, "
        "and only when its band is `tolerable`: an intolerable risk can never be "
        "accepted (ICAO Doc 9859)."
    ),
    operation_id="casesAcceptRisk",
    responses=WRITE_ERRORS,
)
async def accept_risk(
    *,
    session: SessionDep,
    context: CaseApprover,
    case_id: str,
    assessment_id: str,
    payload: CaseRiskAcceptance,
) -> Any:
    assessment = await service.accept_risk(
        session,
        organisation_id=context.organisation_id,
        programme=context.programme,
        case_id=case_id,
        assessment_id=assessment_id,
        actor=context.org.user,
        note=payload.note,
    )
    await session.commit()
    return _assessment(assessment)


# --- corrective actions -------------------------------------------------------------


@router.post(
    "/cases/{case_id}/actions",
    response_model=CaseActionPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Add a corrective action",
    description=(
        "Every action has an owner (an active member) and a due date. The owner "
        "is told by bell and email."
    ),
    operation_id="casesCreateAction",
    responses=WRITE_ERRORS,
)
async def create_action(
    *,
    session: SessionDep,
    context: CaseWriter,
    case_id: str,
    payload: CaseActionCreate,
) -> Any:
    action = await service.add_action(
        session,
        organisation_id=context.organisation_id,
        programme=context.programme,
        case_id=case_id,
        actor=context.org.user,
        payload=payload,
    )
    await session.commit()
    owners = await service.names(session, {action.owner_user_id})
    return _action(action, owners.get(action.owner_user_id))


@router.patch(
    "/cases/{case_id}/actions/{action_id}",
    response_model=CaseActionPublic,
    summary="Change a corrective action",
    description="Only the fields sent change. A new owner is told.",
    operation_id="casesUpdateAction",
    responses=WRITE_ERRORS,
)
async def update_action(
    *,
    session: SessionDep,
    context: CaseWriter,
    case_id: str,
    action_id: str,
    payload: CaseActionUpdate,
) -> Any:
    action = await service.update_action(
        session,
        organisation_id=context.organisation_id,
        programme=context.programme,
        case_id=case_id,
        action_id=action_id,
        actor=context.org.user,
        payload=payload,
    )
    await session.commit()
    owners = await service.names(session, {action.owner_user_id})
    return _action(action, owners.get(action.owner_user_id))


@router.post(
    "/cases/{case_id}/actions/{action_id}/status",
    response_model=CaseActionPublic,
    summary="Mark a corrective action done, verified or open again",
    description=(
        "Open, done, verified. Verifying needs the approve key and is done by "
        "someone other than the action's owner."
    ),
    operation_id="casesChangeActionStatus",
    responses=WRITE_ERRORS,
)
async def change_action_status(
    *,
    session: SessionDep,
    context: CaseWriter,
    case_id: str,
    action_id: str,
    payload: CaseActionStatusChange,
) -> Any:
    action = await service.change_action_status(
        session,
        organisation_id=context.organisation_id,
        programme=context.programme,
        case_id=case_id,
        action_id=action_id,
        actor=context.org.user,
        can_approve=await has_key(session, context, "cases.approve"),
        target=payload.status,
    )
    await session.commit()
    owners = await service.names(session, {action.owner_user_id})
    return _action(action, owners.get(action.owner_user_id))
