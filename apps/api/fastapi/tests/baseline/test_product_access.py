import pytest
from fastapi.concurrency import run_in_threadpool
from sqlmodel import select

from src.auth.models import User
from src.auth.permissions import seed_permissions_and_roles_async
from src.baseline import product_access, service
from src.baseline.models import BaselineAudit, StaffCredential
from src.baseline.schemas import ProductAccessInput
from src.hr.models import EmploymentStatus, Grade
from src.utils.datetime import utc_now
from tests.baseline.test_baseline import seed


@pytest.mark.asyncio
async def test_grade_policy_changes_apply_immediately_and_stay_product_specific(
    db_async,
):
    await seed_permissions_and_roles_async(db_async)
    await run_in_threadpool(seed, True)
    users = (
        (await db_async.execute(select(User).where(User.username != "admin")))
        .scalars()
        .all()
    )
    admin = next(u for u in users if u.is_superuser)
    staff = next(u for u in users if not u.is_superuser)
    staff.is_active = True
    employment = await service.employment_for(db_async, staff.id)
    for code, allowed in [
        ("MANAGER", True),
        ("ASSISTANT_MANAGER", True),
        ("SENIOR_TECH", True),
        ("MID_TECH", False),
        ("ENTRY_TECH", False),
        ("CADET", False),
    ]:
        employment.grade_id = f"GMS_{code}"
        db_async.add(employment)
        await db_async.flush()
        assert bool(await product_access.allowed_kinds(db_async, staff)) == allowed

    employment.grade_id = "GMS_MID_TECH"
    db_async.add(employment)
    await product_access.save_policy(
        db_async, admin, "marine", ProductAccessInput(grade_ids=["GMS_MID_TECH"])
    )
    assert await product_access.allowed_kinds(db_async, staff) == ["marine"]
    await product_access.save_policy(
        db_async, admin, "marine", ProductAccessInput(grade_ids=[])
    )
    assert await product_access.allowed_kinds(db_async, staff) == []
    assert (
        (
            await db_async.execute(
                select(BaselineAudit).where(BaselineAudit.action == "product.access")
            )
        )
        .scalars()
        .all()
    )
    employment.grade_id = "GMS_SENIOR_TECH"
    await db_async.flush()
    assert "marine" not in await product_access.allowed_kinds(db_async, staff)
    assert "morning" in await product_access.allowed_kinds(db_async, staff)

    credential = await db_async.get(StaffCredential, staff.id)
    credential.revoked_at = utc_now()
    assert await product_access.allowed_kinds(db_async, staff) == []
    credential.revoked_at = None
    employment.status = EmploymentStatus.TERMINATED
    assert await product_access.allowed_kinds(db_async, staff) == []
    employment.status = EmploymentStatus.ACTIVE
    staff.registration_pending = True
    assert await product_access.allowed_kinds(db_async, staff) == []
    staff.registration_pending = False
    grade = await db_async.get(Grade, "GMS_SENIOR_TECH")
    grade.is_active = False
    assert await product_access.allowed_kinds(db_async, staff) == []
    admin.is_active = True
    assert len(await product_access.allowed_kinds(db_async, admin)) == 13


@pytest.mark.asyncio
async def test_policy_api_is_admin_only_and_rejects_unknown_products_and_grades(
    async_client, superuser_token_headers_async, normal_user_token_headers_async
):
    url = "/api/v1/hr/setup/product-access"
    denied = await async_client.put(
        url + "/marine", headers=normal_user_token_headers_async, json={"grade_ids": []}
    )
    assert denied.status_code == 403
    for kind, grades in [
        ("cap", []),
        ("marine", ["OTHER_MANAGER"]),
        ("marine", ["missing"]),
    ]:
        response = await async_client.put(
            url + "/" + kind,
            headers=superuser_token_headers_async,
            json={"grade_ids": grades},
        )
        assert response.status_code == 400
    response = await async_client.get(url, headers=superuser_token_headers_async)
    assert response.status_code == 200 and len(response.json()) == 13
    response = await async_client.get(
        "/api/v1/hr/product-access/me", headers=normal_user_token_headers_async
    )
    assert response.json() == {"allowed_kinds": []}
