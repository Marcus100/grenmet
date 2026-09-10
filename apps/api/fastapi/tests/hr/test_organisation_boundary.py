"""Prove ownership and permission boundaries with two real organisations."""

from datetime import timedelta

import httpx
import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import RoleAssignmentScope
from src.auth.policy import can_act_on_user
from src.dependencies import get_current_user
from src.exceptions import AppException
from src.hr.documents import service
from src.hr.documents.models import DocumentCategory
from src.hr.documents.schemas import DocumentUpload, EmployeeDocumentCreate
from src.hr.models import Department, Organisation
from src.hr.organisations import resolve_organisation
from src.main import app
from src.utils.datetime import utc_now
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_role_with_permission,
    make_user,
)


async def setup_pair(session: AsyncSession):
    session.add(Organisation(id="other", code="OTHER", name="Other organisation"))
    await session.commit()
    gaa = await make_department(session, "gaa-hr")
    other = await make_department(session, "other-hr", organisation_id="other")
    actor = await make_user(session)
    employee = await make_user(session)
    outsider = await make_user(session)
    await make_employee(session, user=actor, department_id=gaa.id)
    await make_employee(session, user=employee, department_id=gaa.id)
    other_employment = await make_employee(
        session, user=outsider, department_id=other.id
    )
    role, _ = await make_role_with_permission(
        session,
        "hr.document.create",
        "hr.document.manage",
        "hr.document.read.department",
        "hr.employment.manage",
        "user.manage",
    )
    grant = await assign_role(
        session, user=actor, role=role, scope=RoleAssignmentScope.ALL
    )
    return actor, employee, outsider, gaa, other, other_employment, role, grant


@pytest.fixture(autouse=True)
def storage_and_auth(monkeypatch: pytest.MonkeyPatch):
    async def store(**kwargs):
        pass

    monkeypatch.setattr(service, "_store_object", store)
    previous = dict(app.dependency_overrides)
    yield
    app.dependency_overrides.clear()
    app.dependency_overrides.update(previous)


async def test_all_scope_stays_inside_organisation(db_async: AsyncSession):
    actor, employee, outsider, *rest = await setup_pair(db_async)
    assert await can_act_on_user(
        session=db_async,
        current_user=actor,
        target_user_id=employee.id,
        permission_key="hr.employment.manage",
    )
    assert not await can_act_on_user(
        session=db_async,
        current_user=actor,
        target_user_id=outsider.id,
        permission_key="hr.employment.manage",
    )
    grant = rest[-1]
    grant.effective_to = utc_now() - timedelta(seconds=1)
    await db_async.commit()
    assert not await can_act_on_user(
        session=db_async,
        current_user=actor,
        target_user_id=employee.id,
        permission_key="hr.employment.manage",
    )


async def test_department_grant_may_target_another_unit_but_not_another_org(
    db_async: AsyncSession,
):
    actor, employee, outsider, gaa, other, _, role, grant = await setup_pair(db_async)
    grant.scope = RoleAssignmentScope.DEPARTMENT
    grant.department_id = gaa.id
    await db_async.commit()
    assert await can_act_on_user(
        session=db_async,
        current_user=actor,
        target_user_id=employee.id,
        permission_key="hr.employment.manage",
    )
    grant.department_id = other.id
    with pytest.raises(IntegrityError):
        await db_async.commit()
    await db_async.rollback()


async def test_department_codes_and_names_are_unique_per_org(db_async: AsyncSession):
    await setup_pair(db_async)
    db_async.add(
        Department(id="gaa-ops", organisation_id="gaa", code="OPS", name="Operations")
    )
    db_async.add(
        Department(
            id="other-ops", organisation_id="other", code="OPS", name="Operations"
        )
    )
    await db_async.commit()
    db_async.add(
        Department(
            id="duplicate", organisation_id="gaa", code="OPS", name="Different name"
        )
    )
    with pytest.raises(IntegrityError):
        await db_async.commit()
    await db_async.rollback()


async def test_ambiguous_context_requires_selection(db_async: AsyncSession):
    actor, _, _, _, _, _, role, _ = await setup_pair(db_async)
    assert await resolve_organisation(db_async, actor) == "gaa"
    with pytest.raises(AppException):
        await resolve_organisation(db_async, actor, "other")
    await assign_role(
        db_async,
        user=actor,
        role=role,
        scope=RoleAssignmentScope.ALL,
        organisation_id="other",
    )
    with pytest.raises(AppException, match="context is not unique"):
        await resolve_organisation(db_async, actor)
    assert await resolve_organisation(db_async, actor, "other") == "other"


async def test_cross_org_document_ids_and_queries_are_rejected(
    db_async: AsyncSession, async_client: httpx.AsyncClient
):
    actor, _, outsider, _, _, _, _, _ = await setup_pair(db_async)
    admin = await make_user(db_async, superuser=True)
    document = await service.create_document(
        session=db_async,
        current_user=admin,
        payload=EmployeeDocumentCreate(
            user_id=outsider.id,
            organisation_id="other",
            category=DocumentCategory.CONTRACT,
            title="Private contract",
        ),
        upload=DocumentUpload(
            filename="contract.pdf",
            content_type="application/pdf",
            data=b"%PDF-contract",
        ),
    )
    app.dependency_overrides[get_current_user] = lambda: actor
    for path in (f"/documents/{document.id}", f"/documents/{document.id}/download"):
        response = await async_client.get(f"/api/v1/hr{path}")
        assert response.status_code == 403, response.text
    response = await async_client.patch(
        f"/api/v1/hr/documents/{document.id}", json={"title": "Changed"}
    )
    assert response.status_code == 403
    response = await async_client.post(f"/api/v1/hr/documents/{document.id}/archive")
    assert response.status_code == 403
    response = await async_client.get(
        "/api/v1/hr/documents",
        params={"organisation_id": "other", "user_id": str(outsider.id)},
    )
    assert response.status_code == 403
    choices = await async_client.get(
        "/api/v1/hr/document-employees", params={"organisation_id": "gaa"}
    )
    assert choices.status_code == 200, choices.text
    assert choices.json()["count"] == 2
    assert str(outsider.id) not in {row["user_id"] for row in choices.json()["data"]}


async def test_document_filing_org_survives_employment_change(db_async: AsyncSession):
    actor, _, outsider, gaa, _, employment, role, _ = await setup_pair(db_async)
    admin = await make_user(db_async, superuser=True)
    document = await service.create_document(
        session=db_async,
        current_user=admin,
        payload=EmployeeDocumentCreate(
            user_id=outsider.id,
            organisation_id="other",
            category=DocumentCategory.CONTRACT,
            title="Historical contract",
        ),
        upload=DocumentUpload(
            filename="contract.pdf",
            content_type="application/pdf",
            data=b"%PDF-contract",
        ),
    )
    # Simulate a separately designed future transfer. The filing key is immutable.
    employment.organisation_id = "gaa"
    employment.department_id = gaa.id
    await db_async.commit()
    await db_async.refresh(document)
    assert document.organisation_id == "other"
    with pytest.raises(AppException):
        await service.get_document(
            session=db_async, current_user=actor, document_id=document.id
        )
    await assign_role(
        db_async,
        user=actor,
        role=role,
        scope=RoleAssignmentScope.ALL,
        organisation_id="other",
    )
    assert (
        await service.get_document(
            session=db_async, current_user=actor, document_id=document.id
        )
    ).id == document.id
    rows, count = await service.list_documents(
        session=db_async,
        current_user=actor,
        organisation_id="other",
        user_id=outsider.id,
    )
    assert count == 1 and rows[0].id == document.id


async def test_expired_self_grant_cannot_upload(db_async: AsyncSession):
    actor, _, _, _, _, _, _, grant = await setup_pair(db_async)
    grant.scope = RoleAssignmentScope.SELF
    grant.effective_to = utc_now() - timedelta(seconds=1)
    await db_async.commit()
    with pytest.raises(AppException):
        await service.create_document(
            session=db_async,
            current_user=actor,
            payload=EmployeeDocumentCreate(
                user_id=actor.id,
                organisation_id="gaa",
                category=DocumentCategory.CONTRACT,
                title="Rejected",
            ),
            upload=DocumentUpload(
                filename="contract.pdf",
                content_type="application/pdf",
                data=b"%PDF-contract",
            ),
        )


async def test_own_historical_document_does_not_grant_directory_access(
    db_async: AsyncSession, async_client: httpx.AsyncClient
):
    _, _, outsider, gaa, other, employment, _, _ = await setup_pair(db_async)
    admin = await make_user(db_async, superuser=True)
    await service.create_document(
        session=db_async,
        current_user=admin,
        payload=EmployeeDocumentCreate(
            user_id=outsider.id,
            organisation_id="other",
            category=DocumentCategory.CONTRACT,
            title="Historical contract",
        ),
        upload=DocumentUpload(
            filename="contract.pdf",
            content_type="application/pdf",
            data=b"%PDF-contract",
        ),
    )
    employment.organisation_id = "gaa"
    employment.department_id = gaa.id
    await db_async.commit()
    role, _ = await make_role_with_permission(db_async, "roster.view")
    await assign_role(db_async, user=outsider, role=role, scope=RoleAssignmentScope.ALL)
    app.dependency_overrides[get_current_user] = lambda: outsider
    response = await async_client.get(
        "/api/v1/hr/departments", params={"organisation_id": "other"}
    )
    assert response.status_code == 200 and response.json()["count"] == 0
    response = await async_client.get(f"/api/v1/hr/departments/{other.id}/members")
    assert response.status_code == 403


async def test_role_list_and_detail_share_department_scope_and_null_is_rejected(
    db_async: AsyncSession, async_client: httpx.AsyncClient
):
    actor, employee, _, gaa, _, _, role, grant = await setup_pair(db_async)
    grant.scope = RoleAssignmentScope.DEPARTMENT
    grant.department_id = gaa.id
    await db_async.commit()
    subject = await assign_role(db_async, user=employee, role=role)
    app.dependency_overrides[get_current_user] = lambda: actor
    response = await async_client.get("/api/v1/auth/role-assignments")
    assert response.status_code == 200, response.text
    assert str(subject.id) in {row["id"] for row in response.json()["data"]}
    response = await async_client.get(f"/api/v1/auth/role-assignments/{subject.id}")
    assert response.status_code == 200
    response = await async_client.patch(
        f"/api/v1/auth/role-assignments/{subject.id}", json={"scope": None}
    )
    assert response.status_code == 400
    response = await async_client.patch(
        f"/api/v1/auth/role-assignments/{subject.id}", json={"scope": "ALL"}
    )
    assert response.status_code == 403


async def test_cross_org_employment_and_supervisor_are_rejected(db_async: AsyncSession):
    from src.hr import service as hr_service
    from src.hr.schemas import EmploymentCreate, EmploymentUpdate

    actor, employee, outsider, gaa, _, employment, _, _ = await setup_pair(db_async)
    newcomer = await make_user(db_async)
    with pytest.raises(AppException, match="same organisation"):
        await hr_service.create_employment_for_user(
            session=db_async,
            current_user=actor,
            target_user_id=newcomer.id,
            payload=EmploymentCreate(
                employee_number="NEW-1", department_id=gaa.id, supervisor_id=outsider.id
            ),
        )
    with pytest.raises(AppException, match="same organisation"):
        await hr_service.update_employment_for_user(
            session=db_async,
            current_user=actor,
            target_user_id=employee.id,
            employment_update=EmploymentUpdate(supervisor_id=outsider.id),
            approval_update=None,
        )
    employment.organisation_id = "gaa"
    with pytest.raises(IntegrityError):
        await db_async.commit()
    await db_async.rollback()
