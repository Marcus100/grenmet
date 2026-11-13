"""HR setup routes: ``hr.setup.manage`` held per organisation (issue #1080).

An organisation's HR admin may run HR setup for their own organisation only. Every
other caller, including a holder of the key for a different organisation, is
refused. Superusers keep access everywhere. Role bundles and product-access policies
are shared definitions, so they stay superuser-only.
"""

from datetime import timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import Role, RoleAssignmentScope, User
from src.auth.permissions import (
    DEFAULT_ROLES,
    ORGANISATION_BOUND_KEYS,
    seed_permissions_and_roles_async,
)
from src.auth.utils import create_access_token
from src.baseline.models import ApprovalPolicy, BaselineStep, StaffCredential
from src.hr.models import Grade, Organisation
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_role_with_permission,
    make_user,
)

KEY = "hr.setup.manage"
OWN_ORG = "gaa"
FOREIGN_ORG = "org_setup_foreign"
OWN_DEPT = "dept_setup_own"
FOREIGN_DEPT = "dept_setup_foreign"
OWN_GRADE = "GRADE_SETUP_OWN"
FOREIGN_GRADE = "GRADE_SETUP_FOREIGN"
GRADE_BODY = {
    "department_id": OWN_DEPT,
    "code": "OWN",
    "label": "Own grade",
    "rank": 1,
}


def _headers(user: User) -> dict[str, str]:
    token = create_access_token(user.id, expires_delta=timedelta(minutes=5))
    return {"Authorization": f"Bearer {token}"}


async def _seed(db: AsyncSession) -> None:
    if not await db.get(Organisation, FOREIGN_ORG):
        db.add(Organisation(id=FOREIGN_ORG, code=FOREIGN_ORG, name="Foreign"))
        await db.flush()
    await make_department(db, OWN_DEPT, organisation_id=OWN_ORG)
    await make_department(db, FOREIGN_DEPT, organisation_id=FOREIGN_ORG)
    db.add(Grade(id=OWN_GRADE, department_id=OWN_DEPT, code="OWN", label="Own", rank=1))
    db.add(
        Grade(
            id=FOREIGN_GRADE,
            department_id=FOREIGN_DEPT,
            code="FOREIGN",
            label="Foreign",
            rank=1,
        )
    )
    await db.commit()


async def _setup_admin(db: AsyncSession, organisation_id: str = OWN_ORG) -> User:
    """A user holding ``hr.setup.manage`` through an organisation-wide assignment."""
    admin = await make_user(db)
    role, _ = await make_role_with_permission(db, KEY)
    await assign_role(
        db,
        user=admin,
        role=role,
        scope=RoleAssignmentScope.ALL,
        organisation_id=organisation_id,
    )
    return admin


@pytest.mark.asyncio
async def test_own_organisation_admin_reads_setup_grades(
    async_client: AsyncClient, db_async: AsyncSession
) -> None:
    await _seed(db_async)
    admin = await _setup_admin(db_async)

    response = await async_client.get(
        f"/api/v1/hr/setup/grades?organisation_id={OWN_ORG}",
        headers=_headers(admin),
    )

    assert response.status_code == 200
    ids = {grade["id"] for grade in response.json()}
    assert OWN_GRADE in ids
    assert FOREIGN_GRADE not in ids


@pytest.mark.asyncio
async def test_admin_refused_other_organisation_grades(
    async_client: AsyncClient, db_async: AsyncSession
) -> None:
    await _seed(db_async)
    admin = await _setup_admin(db_async)

    response = await async_client.get(
        f"/api/v1/hr/setup/grades?organisation_id={FOREIGN_ORG}",
        headers=_headers(admin),
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_admin_must_name_an_organisation_for_grades(
    async_client: AsyncClient, db_async: AsyncSession
) -> None:
    await _seed(db_async)
    admin = await _setup_admin(db_async)

    response = await async_client.get(
        "/api/v1/hr/setup/grades", headers=_headers(admin)
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_cannot_save_grade_in_other_organisation(
    async_client: AsyncClient, db_async: AsyncSession
) -> None:
    await _seed(db_async)
    admin = await _setup_admin(db_async)
    body = {**GRADE_BODY, "department_id": FOREIGN_DEPT, "code": "PWNED"}

    response = await async_client.put(
        "/api/v1/hr/setup/grades/GRADE_SETUP_NEW",
        headers=_headers(admin),
        json=body,
    )

    assert response.status_code == 404
    assert await db_async.get(Grade, "GRADE_SETUP_NEW") is None


@pytest.mark.asyncio
async def test_admin_saves_grade_in_own_organisation(
    async_client: AsyncClient, db_async: AsyncSession
) -> None:
    await _seed(db_async)
    admin = await _setup_admin(db_async)

    response = await async_client.put(
        "/api/v1/hr/setup/grades/GRADE_SETUP_NEW",
        headers=_headers(admin),
        json={**GRADE_BODY, "code": "NEW"},
    )

    assert response.status_code == 200
    assert (await db_async.get(Grade, "GRADE_SETUP_NEW")).department_id == OWN_DEPT


@pytest.mark.asyncio
async def test_user_without_key_refused(
    async_client: AsyncClient,
    db_async: AsyncSession,
    normal_user_token_headers_async: dict[str, str],
) -> None:
    await _seed(db_async)

    response = await async_client.get(
        f"/api/v1/hr/setup/grades?organisation_id={OWN_ORG}",
        headers=normal_user_token_headers_async,
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_superuser_keeps_every_organisation(
    async_client: AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    await _seed(db_async)

    response = await async_client.get(
        f"/api/v1/hr/setup/grades?organisation_id={FOREIGN_ORG}",
        headers=superuser_token_headers_async,
    )

    assert response.status_code == 200
    assert FOREIGN_GRADE in {grade["id"] for grade in response.json()}


@pytest.mark.asyncio
async def test_role_bundles_stay_superuser_only(
    async_client: AsyncClient, db_async: AsyncSession
) -> None:
    await _seed(db_async)
    admin = await _setup_admin(db_async)

    response = await async_client.get("/api/v1/hr/setup/roles", headers=_headers(admin))

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_policy_update_scoped_to_department_organisation(
    async_client: AsyncClient, db_async: AsyncSession
) -> None:
    await _seed(db_async)
    admin = await _setup_admin(db_async)
    key = f"hr:{FOREIGN_DEPT}:leave"
    db_async.add(ApprovalPolicy(key=key, allow_self_approval=False))
    await db_async.commit()

    response = await async_client.put(
        f"/api/v1/hr/setup/policies/{key}",
        headers=_headers(admin),
        json={"allow_self_approval": True, "require_distinct_approvers": True},
    )

    assert response.status_code == 404
    policy = await db_async.get(ApprovalPolicy, key)
    await db_async.refresh(policy)
    assert policy.allow_self_approval is False


@pytest.mark.asyncio
async def test_balance_import_scoped_to_organisation(
    async_client: AsyncClient, db_async: AsyncSession
) -> None:
    await _seed(db_async)
    admin = await _setup_admin(db_async)

    response = await async_client.post(
        "/api/v1/hr/setup/staff/balances/import",
        headers=_headers(admin),
        json={
            "organisation_id": FOREIGN_ORG,
            "source": "HrPlus",
            "as_of": "2026-01-01",
            "csv": "employee_number,leave_type,balance\nX1,ANNUAL,1\n",
            "apply": True,
        },
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_offboard_refused_for_staff_in_other_organisation(
    async_client: AsyncClient, db_async: AsyncSession
) -> None:
    await _seed(db_async)
    admin = await _setup_admin(db_async)
    colleague = await make_user(db_async)
    await make_employee(db_async, user=colleague, department_id=FOREIGN_DEPT)
    db_async.add(
        StaffCredential(
            user_id=colleague.id,
            department_id=FOREIGN_DEPT,
            grade_id=FOREIGN_GRADE,
            number="FOR-1",
        )
    )
    await db_async.commit()

    response = await async_client.post(
        f"/api/v1/hr/setup/staff/{colleague.id}/offboard",
        headers=_headers(admin),
    )

    assert response.status_code == 404
    await db_async.refresh(colleague)
    assert colleague.is_active is True


@pytest.mark.asyncio
async def test_admin_cannot_claim_account_with_no_organisation(
    async_client: AsyncClient, db_async: AsyncSession
) -> None:
    await _seed(db_async)
    admin = await _setup_admin(db_async)
    stranger = await make_user(db_async)

    response = await async_client.put(
        f"/api/v1/hr/setup/staff/{stranger.id}",
        headers=_headers(admin),
        json={"department_id": OWN_DEPT, "grade_id": OWN_GRADE},
    )

    assert response.status_code == 403
    assert await db_async.get(StaffCredential, stranger.id) is None


@pytest.mark.asyncio
async def test_key_is_global_and_held_by_hr_admin_bundle() -> None:
    assert KEY not in ORGANISATION_BOUND_KEYS
    assert KEY in DEFAULT_ROLES["hr-admin"][1]


@pytest.mark.asyncio
async def test_seed_backfills_key_onto_existing_hr_admin_role(
    db_async: AsyncSession,
) -> None:
    # Deployed databases already have hr-admin without the key. The seed adds it
    # once, then an owner's later removal sticks.
    # Simulate a deployed database: an hr-admin role seeded before the key existed.
    role = (
        await db_async.execute(select(Role).where(Role.name == "hr-admin"))
    ).scalar_one_or_none()
    if role is None:
        role = Role(name="hr-admin", description="Deployed before hr.setup.manage")
        db_async.add(role)
        await db_async.flush()
    await db_async.refresh(role, ["permissions"])
    role.permissions = [p for p in role.permissions if p.key != KEY]
    marker = await db_async.get(BaselineStep, f"bundle:hr-admin:{KEY}")
    if marker is not None:
        await db_async.delete(marker)
    await db_async.commit()

    await seed_permissions_and_roles_async(db_async)
    await db_async.refresh(role, ["permissions"])
    assert KEY in {p.key for p in role.permissions}

    role.permissions = [p for p in role.permissions if p.key != KEY]
    await db_async.commit()
    await seed_permissions_and_roles_async(db_async)
    await db_async.refresh(role, ["permissions"])
    assert KEY not in {p.key for p in role.permissions}
