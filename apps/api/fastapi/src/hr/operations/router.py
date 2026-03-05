import uuid
from typing import Any

from fastapi import APIRouter

from src.dependencies import CurrentUser, SessionDep

from .schemas import (
    AbsenteeReportCreate,
    AbsenteeReportListPublic,
    AbsenteeReportPublic,
    LeaveRequestAction,
    LeaveRequestCreate,
    LeaveRequestListPublic,
    LeaveRequestPublic,
    ShiftSwapAction,
    ShiftSwapRequestCreate,
    ShiftSwapRequestPublic,
    StatusReportCreate,
    StatusReportListPublic,
    StatusReportPublic,
)
from .service import (
    action_leave_request,
    action_shift_swap_request,
    create_absentee_report,
    create_leave_request,
    create_shift_swap_request,
    create_status_report,
    list_absentee_reports,
    list_leave_requests,
    list_status_reports,
)

router = APIRouter(prefix="/hr", tags=["hr-operations"])


@router.post("/leave-requests", response_model=LeaveRequestPublic)
def create_leave_request_endpoint(
    *, session: SessionDep, current_user: CurrentUser, payload: LeaveRequestCreate
) -> Any:
    return create_leave_request(session=session, current_user=current_user, payload=payload)


@router.patch("/leave-requests/{leave_request_id}/action", response_model=LeaveRequestPublic)
def action_leave_request_endpoint(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    leave_request_id: uuid.UUID,
    payload: LeaveRequestAction,
) -> Any:
    return action_leave_request(
        session=session,
        current_user=current_user,
        leave_request_id=leave_request_id,
        payload=payload,
    )


@router.get("/leave-requests/me", response_model=LeaveRequestListPublic)
def read_my_leave_requests(session: SessionDep, current_user: CurrentUser) -> Any:
    rows = list_leave_requests(session=session, current_user=current_user)
    return LeaveRequestListPublic(
        data=[LeaveRequestPublic.model_validate(item, from_attributes=True) for item in rows],
        count=len(rows),
    )


@router.post("/shift-swaps", response_model=ShiftSwapRequestPublic)
def create_shift_swap_endpoint(
    *, session: SessionDep, current_user: CurrentUser, payload: ShiftSwapRequestCreate
) -> Any:
    return create_shift_swap_request(session=session, current_user=current_user, payload=payload)


@router.patch("/shift-swaps/{shift_swap_id}/action", response_model=ShiftSwapRequestPublic)
def action_shift_swap_endpoint(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    shift_swap_id: uuid.UUID,
    payload: ShiftSwapAction,
) -> Any:
    return action_shift_swap_request(
        session=session,
        current_user=current_user,
        shift_swap_id=shift_swap_id,
        payload=payload,
    )


@router.post("/absentee-reports", response_model=AbsenteeReportPublic)
def create_absentee_endpoint(
    *, session: SessionDep, current_user: CurrentUser, payload: AbsenteeReportCreate
) -> Any:
    return create_absentee_report(session=session, current_user=current_user, payload=payload)


@router.get("/absentee-reports", response_model=AbsenteeReportListPublic)
def read_absentee_reports(
    session: SessionDep,
    current_user: CurrentUser,
    department_id: str | None = None,
) -> Any:
    rows = list_absentee_reports(
        session=session,
        current_user=current_user,
        department_id=department_id,
    )
    return AbsenteeReportListPublic(
        data=[AbsenteeReportPublic.model_validate(item, from_attributes=True) for item in rows],
        count=len(rows),
    )


@router.post("/status-reports", response_model=StatusReportPublic)
def create_status_report_endpoint(
    *, session: SessionDep, current_user: CurrentUser, payload: StatusReportCreate
) -> Any:
    return create_status_report(session=session, current_user=current_user, payload=payload)


@router.get("/status-reports", response_model=StatusReportListPublic)
def read_status_reports(
    session: SessionDep,
    department_id: str | None = None,
) -> Any:
    rows = list_status_reports(session=session, department_id=department_id)
    return StatusReportListPublic(
        data=[StatusReportPublic.model_validate(item, from_attributes=True) for item in rows],
        count=len(rows),
    )
