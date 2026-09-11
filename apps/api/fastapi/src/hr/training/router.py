import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Query

from src.dependencies import CurrentUser, SessionDep
from src.pagination import PaginationDep

from . import service
from .schemas import (
    TrainingArchiveInput,
    TrainingEmployeeList,
    TrainingRecordInput,
    TrainingRecordList,
    TrainingRecordPublic,
)

router = APIRouter(prefix="/hr", tags=["hr-training"])


@router.get(
    "/training-records",
    response_model=TrainingRecordList,
    status_code=200,
    summary="Read employee training history",
    description="Own history or history within active training read/manage grants. Scope is applied before pagination.",
    responses={403: {"description": "Organisation access denied"}},
)
async def read_training_records(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    pagination: PaginationDep,
    organisation_id: str,
    user_id: uuid.UUID | None = None,
    include_archived: bool = False,
) -> Any:
    return await service.list_records(
        session=session,
        actor=current_user,
        organisation_id=organisation_id,
        user_id=user_id,
        include_archived=include_archived,
        page=pagination.page,
        size=pagination.size,
    )


@router.get(
    "/training-employees",
    response_model=TrainingEmployeeList,
    status_code=200,
    summary="Find employees within training access",
    description="Scoped employee search for training history. Employees can find themselves; managers can find employees within their active grants.",
    responses={403: {"description": "Organisation access denied"}},
)
async def read_training_employees(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    pagination: PaginationDep,
    organisation_id: str,
    search: Annotated[str, Query(max_length=100)] = "",
) -> Any:
    return await service.list_employees(
        session=session,
        actor=current_user,
        organisation_id=organisation_id,
        search=search,
        page=pagination.page,
        size=pagination.size,
    )


@router.post(
    "/training-records",
    response_model=TrainingRecordPublic,
    status_code=201,
    summary="Record an employee training outcome",
    description="Requires an active hr.training.manage grant for the employee's department. A completion record does not certify competency.",
    responses={
        400: {"description": "Invalid training date"},
        403: {"description": "Training management access denied"},
    },
)
async def create_training_record(
    *, session: SessionDep, current_user: CurrentUser, payload: TrainingRecordInput
) -> Any:
    record = await service.create_record(
        session=session, actor=current_user, payload=payload
    )
    return TrainingRecordPublic.model_validate(record, from_attributes=True).model_copy(
        update={"can_manage": True}
    )


@router.post(
    "/training-records/{record_id}/archive",
    response_model=TrainingRecordPublic,
    status_code=200,
    summary="Archive an incorrect training record",
    description="Retains history and records an archive reason. Corrections are entered as replacement records.",
    responses={
        403: {"description": "Organisation access denied"},
        404: {"description": "Training record not found or inaccessible"},
    },
)
async def archive_training_record(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    record_id: uuid.UUID,
    payload: TrainingArchiveInput,
) -> Any:
    record = await service.archive_record(
        session=session, actor=current_user, record_id=record_id, payload=payload
    )
    return TrainingRecordPublic.model_validate(record, from_attributes=True).model_copy(
        update={"can_manage": True}
    )
