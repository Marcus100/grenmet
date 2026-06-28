"""Parking permit service tests — permission requirements and decal issuance."""

import uuid
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import AuthorizationError
from src.hr.exceptions import ParkingPermitNotFoundError
from src.hr.models import RequestStatus
from src.hr.parking.models import ParkingAction
from src.hr.parking.schemas import ParkingPermitCreate, ParkingPermitIssue
from src.hr.parking.service import (
    create_parking_permit,
    issue_decal,
    list_parking_permits,
)
from tests.factories import (
    assign_role,
    make_department,
    make_role_with_permission,
    make_user,
)


def _payload(*, user_id: uuid.UUID, department_id: str) -> ParkingPermitCreate:
    return ParkingPermitCreate(
        user_id=user_id,
        department_id=department_id,
        vehicle_registration_no="P1234",
        action_requested=ParkingAction.NEW_PERMIT,
    )


async def test_create_parking_permit_requires_permission(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async)
    dept = await make_department(db_async, "dept_parking_noperm")

    with pytest.raises(AuthorizationError):
        await create_parking_permit(
            session=db_async,
            current_user=user,
            payload=_payload(user_id=user.id, department_id=dept.id),
        )


async def test_create_parking_permit_with_permission(db_async: AsyncSession) -> None:
    user = await make_user(db_async)
    dept = await make_department(db_async, "dept_parking_create")
    role, _ = await make_role_with_permission(db_async, "parking.permit.create")
    await assign_role(db_async, user=user, role=role)

    permit = await create_parking_permit(
        session=db_async,
        current_user=user,
        payload=_payload(user_id=user.id, department_id=dept.id),
    )

    assert permit.user_id == user.id
    assert permit.submitted_by_user_id == user.id
    assert permit.status == RequestStatus.SUBMITTED
    assert permit.fee_amount == Decimal("40.00")


async def test_list_department_filter_requires_permission(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async)
    dept = await make_department(db_async, "dept_parking_list")

    # No department-read permission → filtering by department is denied.
    with pytest.raises(AuthorizationError):
        await list_parking_permits(
            session=db_async, current_user=user, department_id=dept.id
        )

    # Own-only listing requires no permission and returns a list.
    own = await list_parking_permits(session=db_async, current_user=user)
    assert own == []


async def test_issue_decal_sets_fields(db_async: AsyncSession) -> None:
    applicant = await make_user(db_async)
    dept = await make_department(db_async, "dept_parking_issue")
    create_role, _ = await make_role_with_permission(db_async, "parking.permit.create")
    await assign_role(db_async, user=applicant, role=create_role)

    permit = await create_parking_permit(
        session=db_async,
        current_user=applicant,
        payload=_payload(user_id=applicant.id, department_id=dept.id),
    )

    officer = await make_user(db_async)
    issue_role, _ = await make_role_with_permission(db_async, "parking.permit.issue")
    await assign_role(db_async, user=officer, role=issue_role)

    issued = await issue_decal(
        session=db_async,
        current_user=officer,
        permit_id=permit.id,
        payload=ParkingPermitIssue(
            decal_number="DECAL-001",
            valid_from="2026-07-01",
            valid_to="2027-06-30",
            received_by="Jane Applicant",
        ),
    )

    assert issued.decal_number == "DECAL-001"
    assert issued.issued_by_user_id == officer.id
    assert issued.issued_at is not None


async def test_issue_decal_not_found(db_async: AsyncSession) -> None:
    officer = await make_user(db_async)
    issue_role, _ = await make_role_with_permission(db_async, "parking.permit.issue")
    await assign_role(db_async, user=officer, role=issue_role)

    with pytest.raises(ParkingPermitNotFoundError):
        await issue_decal(
            session=db_async,
            current_user=officer,
            permit_id=uuid.uuid4(),
            payload=ParkingPermitIssue(
                decal_number="X",
                valid_from="2026-07-01",
                valid_to="2027-06-30",
            ),
        )
