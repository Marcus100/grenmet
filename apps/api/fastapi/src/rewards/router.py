"""Rewards routes: the account's cards, badges and tickets; organisation programmes
and staff redemption; superuser/``rewards.manage`` administration.

Routers commit; service functions flush.
"""

import uuid
from typing import Any

from fastapi import APIRouter, Query, status
from sqlalchemy.exc import SQLAlchemyError

from src.dependencies import AccountUser, SessionDep
from src.events import schemas as events_schemas
from src.events import service as events_service
from src.openapi_responses import AUTHENTICATED, BAD_REQUEST, CONFLICT, NOT_FOUND
from src.pagination import PaginationDep
from src.utils.datetime import utc_now

from . import badges, service
from .dependencies import (
    OptionalEventsSession,
    RewardsManager,
    RewardsOrgAdmin,
    RewardsOrgMember,
)
from .models import EntryKind, EntryStatus, ProgramStatus
from .router_gamification import router as gamification_router
from .schemas import (
    AdjustmentCreate,
    BadgePublic,
    FlagPublic,
    FlagResolve,
    ProgramAdminListPublic,
    ProgramAdminPublic,
    ProgramCreate,
    ProgramPublic,
    ProgramUpdate,
    RedemptionConfirm,
    RedemptionConfirmed,
    RedemptionPublic,
    RedemptionRequest,
    RewardCardPublic,
    RewardEntryListPublic,
    RewardEntryPublic,
)
from .schemas_gamification import RewardsOrgEntryListPublic, RewardsOrgEntryPublic

router = APIRouter(prefix="/rewards", tags=["rewards"])

router.include_router(gamification_router)

WRITE_ERRORS = {**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND, **CONFLICT}


def _redemption(entry: Any, program: Any) -> RedemptionPublic:
    return RedemptionPublic(
        id=entry.id,
        program_id=program.id,
        program_name=program.name,
        reward_description=program.reward_description,
        stamps=-entry.amount,
        status=entry.status,
        code=entry.redeem_code if entry.status == "pending" else None,
        created_at=entry.created_at,
    )


# --- the signed-in account ------------------------------------------------------


@router.get(
    "/me",
    response_model=list[RewardCardPublic],
    summary="List my reward cards",
    description=(
        "The signed-in account's stamp cards with balances computed from the "
        "ledger. Stamps are non-monetary and cannot be transferred."
    ),
    operation_id="rewardsListMine",
    responses={**AUTHENTICATED},
)
async def list_my_cards(*, session: SessionDep, current_user: AccountUser) -> Any:
    return await service.cards(session, current_user.id)


@router.get(
    "/me/entries",
    response_model=RewardEntryListPublic,
    summary="My rewards history",
    description="The account's ledger entries, newest first.",
    operation_id="rewardsListMyEntries",
    responses={**AUTHENTICATED},
)
async def list_my_entries(
    *, session: SessionDep, current_user: AccountUser, pagination: PaginationDep
) -> Any:
    rows, total = await service.list_entries(
        session, current_user.id, skip=pagination.skip, limit=pagination.limit
    )
    return RewardEntryListPublic(
        data=[RewardEntryPublic(**row) for row in rows],
        count=total,
        page=pagination.page,
        size=pagination.size,
    )


@router.post(
    "/me/redemptions",
    response_model=RedemptionPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Start a redemption",
    description=(
        "Hold a full card of stamps behind a one-time code. Staff of the "
        "funding organisation confirm the code to hand over the reward."
    ),
    operation_id="rewardsRequestRedemption",
    responses={**WRITE_ERRORS},
)
async def request_redemption(
    *, session: SessionDep, current_user: AccountUser, payload: RedemptionRequest
) -> Any:
    entry, program = await service.request_redemption(
        session, account=current_user, program_id=payload.program_id
    )
    await session.commit()
    return _redemption(entry, program)


@router.post(
    "/me/redemptions/{redemption_id}/cancel",
    response_model=RedemptionPublic,
    summary="Cancel an open redemption",
    description="Release the stamps held by a redemption that staff have not confirmed.",
    operation_id="rewardsCancelRedemption",
    responses={**WRITE_ERRORS},
)
async def cancel_redemption(
    *, session: SessionDep, current_user: AccountUser, redemption_id: uuid.UUID
) -> Any:
    entry = await service.cancel_redemption(
        session, account=current_user, entry_id=redemption_id
    )
    program = await service.get_program(session, entry.program_id)
    await session.commit()
    return _redemption(entry, program)


@router.get(
    "/me/badges",
    response_model=list[BadgePublic],
    summary="My trust badges",
    description=(
        "Verified organiser, attendee and purchaser, derived from records on "
        "every read. Badges cannot be bought, granted or transferred."
    ),
    operation_id="rewardsListMyBadges",
    responses={**AUTHENTICATED},
)
async def list_my_badges(
    *, session: SessionDep, current_user: AccountUser, events: OptionalEventsSession
) -> Any:
    try:
        return await badges.badges_for(session, events, current_user.id)
    except SQLAlchemyError, OSError:
        return await badges.badges_for(session, None, current_user.id)


@router.get(
    "/me/tickets",
    response_model=list[events_schemas.TicketSummary],
    summary="My tickets (account page)",
    description=(
        "The account's Events tickets for the Barrels ID page, read-only. "
        "Empty when Events has no database. Manage tickets in Barrels Events."
    ),
    operation_id="rewardsListMyTickets",
    responses={**AUTHENTICATED},
)
async def list_my_tickets(
    *, current_user: AccountUser, events: OptionalEventsSession
) -> Any:
    if events is None:
        return []
    try:
        return await events_service.my_tickets(events, current_user)
    except SQLAlchemyError, OSError:
        return []


# --- organisation programmes and staff redemption ------------------------------


@router.get(
    "/programs",
    response_model=list[ProgramPublic],
    summary="List my organisation's reward programmes",
    description="Programmes of the organisation named in X-Barrels-Organisation.",
    operation_id="rewardsListPrograms",
    responses={**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND},
)
async def list_programs(*, session: SessionDep, org: RewardsOrgMember) -> Any:
    return await service.list_programs(session, organisation_id=org.organisation_id)


@router.post(
    "/programs",
    response_model=ProgramPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create a stamp card programme",
    description=(
        "An organisation admin or owner configures a stamp card: N stamps earn "
        "a reward, one stamp per qualifying admission at this organiser."
    ),
    operation_id="rewardsCreateProgram",
    responses={**WRITE_ERRORS},
)
async def create_program(
    *, session: SessionDep, org: RewardsOrgAdmin, payload: ProgramCreate
) -> Any:
    program = await service.create_program(
        session, organisation_id=org.organisation_id, actor=org.user, payload=payload
    )
    await session.commit()
    return program


@router.patch(
    "/programs/{program_id}",
    response_model=ProgramPublic,
    summary="Update a stamp card programme",
    description="Rename, pause or resume a programme, or change its redemption cap.",
    operation_id="rewardsUpdateProgram",
    responses={**WRITE_ERRORS},
)
async def update_program(
    *,
    session: SessionDep,
    org: RewardsOrgAdmin,
    program_id: uuid.UUID,
    payload: ProgramUpdate,
) -> Any:
    program = await service.get_program(
        session, program_id, organisation_id=org.organisation_id
    )
    await service.update_program(session, program, actor=org.user, payload=payload)
    await session.commit()
    return program


@router.post(
    "/redemptions/confirm",
    response_model=RedemptionConfirmed,
    summary="Confirm a customer's redemption code",
    description=(
        "Staff of the funding organisation confirm a one-time code. A code from "
        "another organisation answers 404."
    ),
    operation_id="rewardsConfirmRedemption",
    responses={**WRITE_ERRORS},
)
async def confirm_redemption(
    *, session: SessionDep, org: RewardsOrgMember, payload: RedemptionConfirm
) -> Any:
    entry, program = await service.confirm_redemption(
        session,
        organisation_id=org.organisation_id,
        code=payload.code,
        staff=org.user,
    )
    await session.commit()
    return RedemptionConfirmed(
        program_name=program.name,
        reward_description=program.reward_description,
        stamps=-entry.amount,
        confirmed_at=entry.settled_at or utc_now(),
    )


@router.post(
    "/org/programs/{program_id}/pause",
    response_model=ProgramPublic,
    summary="Pause a programme",
    description="A paused programme earns and redeems nothing. Idempotent.",
    operation_id="rewardsOrgPauseProgram",
    responses={**WRITE_ERRORS},
)
async def org_pause_program(
    *, session: SessionDep, org: RewardsOrgAdmin, program_id: uuid.UUID
) -> Any:
    program = await service.get_program(
        session, program_id, organisation_id=org.organisation_id
    )
    await service.set_program_status(
        session, program, actor=org.user, status=ProgramStatus.PAUSED
    )
    await session.commit()
    return program


@router.post(
    "/org/programs/{program_id}/resume",
    response_model=ProgramPublic,
    summary="Resume a programme",
    description="Makes a paused programme active again. Idempotent.",
    operation_id="rewardsOrgResumeProgram",
    responses={**WRITE_ERRORS},
)
async def org_resume_program(
    *, session: SessionDep, org: RewardsOrgAdmin, program_id: uuid.UUID
) -> Any:
    program = await service.get_program(
        session, program_id, organisation_id=org.organisation_id
    )
    await service.set_program_status(
        session, program, actor=org.user, status=ProgramStatus.ACTIVE
    )
    await session.commit()
    return program


async def _org_entries(
    *,
    session: Any,
    org: Any,
    pagination: Any,
    program_id: uuid.UUID | None,
    kind: EntryKind | None,
    redemptions_only: bool,
) -> RewardsOrgEntryListPublic:
    rows, total = await service.list_org_entries(
        session,
        organisation_id=org.organisation_id,
        skip=pagination.skip,
        limit=pagination.limit,
        program_id=program_id,
        kind=kind,
        redemptions_only=redemptions_only,
    )
    return RewardsOrgEntryListPublic(
        data=[RewardsOrgEntryPublic(**row) for row in rows],
        count=total,
        page=pagination.page,
        size=pagination.size,
    )


@router.get(
    "/org/entries",
    response_model=RewardsOrgEntryListPublic,
    summary="List my organisation's ledger entries",
    description=(
        "Earn, redeem, reversal and adjustment entries of the organisation's "
        "programmes, newest first. No account identity is returned."
    ),
    operation_id="rewardsOrgListEntries",
    responses={**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND},
)
async def org_list_entries(
    *,
    session: SessionDep,
    org: RewardsOrgMember,
    pagination: PaginationDep,
    program_id: uuid.UUID | None = Query(default=None),
    kind: EntryKind | None = Query(default=None),
) -> Any:
    return await _org_entries(
        session=session,
        org=org,
        pagination=pagination,
        program_id=program_id,
        kind=kind,
        redemptions_only=False,
    )


@router.get(
    "/org/redemptions",
    response_model=RewardsOrgEntryListPublic,
    summary="List my organisation's redemptions",
    description="Pending and confirmed redemptions of the organisation's programmes.",
    operation_id="rewardsOrgListRedemptions",
    responses={**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND},
)
async def org_list_redemptions(
    *,
    session: SessionDep,
    org: RewardsOrgMember,
    pagination: PaginationDep,
    program_id: uuid.UUID | None = Query(default=None),
) -> Any:
    return await _org_entries(
        session=session,
        org=org,
        pagination=pagination,
        program_id=program_id,
        kind=None,
        redemptions_only=True,
    )


# --- administration (rewards.manage) -------------------------------------------


@router.get(
    "/admin/programs",
    response_model=ProgramAdminListPublic,
    summary="List all reward programmes",
    description="Every organisation's programmes, read-only, for the control plane.",
    operation_id="rewardsAdminListPrograms",
    responses={**AUTHENTICATED},
)
async def admin_list_programs(
    *, session: SessionDep, _manager: RewardsManager, pagination: PaginationDep
) -> Any:
    rows, total = await service.list_programs_admin(
        session, skip=pagination.skip, limit=pagination.limit
    )
    return ProgramAdminListPublic(
        data=[ProgramAdminPublic(**row) for row in rows],
        count=total,
        page=pagination.page,
        size=pagination.size,
    )


@router.post(
    "/admin/adjustments",
    response_model=RewardEntryPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Adjust an account's stamps",
    description=(
        "Audited manual correction with a required reason. It cannot take a "
        "card below zero."
    ),
    operation_id="rewardsAdminAdjust",
    responses={**WRITE_ERRORS},
)
async def admin_adjust(
    *, session: SessionDep, manager: RewardsManager, payload: AdjustmentCreate
) -> Any:
    entry = await service.adjust(
        session,
        actor=manager,
        account_id=payload.account_id,
        program_id=payload.program_id,
        amount=payload.amount,
        reason=payload.reason,
    )
    program = await service.get_program(session, entry.program_id)
    organisation_name = await service.organisation_name(
        session, program.organisation_id
    )
    await session.commit()
    return RewardEntryPublic(
        id=entry.id,
        program_id=entry.program_id,
        program_name=program.name,
        organisation_name=organisation_name,
        kind=EntryKind(entry.kind),
        amount=entry.amount,
        status=EntryStatus(entry.status),
        reason=entry.reason,
        redeem_code=None,
        created_at=entry.created_at,
    )


@router.get(
    "/admin/flags",
    response_model=list[FlagPublic],
    summary="List accounts flagged for review",
    description="Open suspicious-activity flags, newest first.",
    operation_id="rewardsAdminListFlags",
    responses={**AUTHENTICATED},
)
async def admin_list_flags(
    *,
    session: SessionDep,
    _manager: RewardsManager,
    include_resolved: bool = Query(default=False),
) -> Any:
    return await service.list_flags(session, include_resolved=include_resolved)


@router.post(
    "/admin/flags/{flag_id}/resolve",
    response_model=FlagPublic,
    summary="Resolve a review flag",
    description="Record the outcome of a review. A note is required.",
    operation_id="rewardsAdminResolveFlag",
    responses={**WRITE_ERRORS},
)
async def admin_resolve_flag(
    *,
    session: SessionDep,
    manager: RewardsManager,
    flag_id: uuid.UUID,
    payload: FlagResolve,
) -> Any:
    flag = await service.resolve_flag(
        session, flag_id=flag_id, actor=manager, note=payload.note
    )
    await session.commit()
    return flag
