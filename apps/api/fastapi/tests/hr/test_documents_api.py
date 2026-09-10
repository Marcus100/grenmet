"""Exercise multipart upload, scoped choices, capability flags and downloads."""

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.dependencies import get_current_user
from src.hr.documents import service
from src.main import app
from src.storage.service import StorageNotConfiguredError
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_role_with_permission,
    make_supervised_pair,
    make_user,
)


@pytest.fixture(autouse=True)
def restore_auth_override():
    previous = app.dependency_overrides.get(get_current_user)
    yield
    if previous is None:
        app.dependency_overrides.pop(get_current_user, None)
    else:
        app.dependency_overrides[get_current_user] = previous


async def test_document_http_flow(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = await make_user(db_async)
    department = await make_department(db_async)
    await make_employee(db_async, user=user, department_id=department.id)
    role, _ = await make_role_with_permission(db_async, "hr.document.create")
    await assign_role(db_async, user=user, role=role)
    app.dependency_overrides[get_current_user] = lambda: user

    async def store(**_kwargs):
        pass

    monkeypatch.setattr(service, "_store_object", store)
    data = {"user_id": str(user.id), "category": "CERTIFICATION", "title": "Licence"}
    uploaded = await async_client.post(
        "/api/v1/hr/documents",
        data=data,
        files={"file": ("licence.pdf", b"%PDF-1.4 document", "application/pdf")},
    )
    assert uploaded.status_code == 201, uploaded.text
    document_id = uploaded.json()["id"]
    assert "object_key" not in uploaded.json()
    assert uploaded.json()["can_manage"] is True
    detail = await async_client.get(f"/api/v1/hr/documents/{document_id}")
    assert detail.json()["can_manage"] is True
    listed = await async_client.get("/api/v1/hr/documents")
    assert listed.status_code == 200
    assert listed.json()["can_upload"] is True
    assert listed.json()["data"][0]["can_manage"] is True
    monkeypatch.setattr(
        service.storage_service,
        "presigned_download_url",
        lambda *args, **kwargs: (
            "https://storage.example.test/private?signature=temporary"
        ),
    )
    downloaded = await async_client.get(
        f"/api/v1/hr/documents/{document_id}/download", follow_redirects=False
    )
    assert downloaded.status_code == 307
    assert downloaded.headers["cache-control"] == "private, no-store"
    assert downloaded.headers["location"].startswith("https://storage.example.test/")
    rejected = await async_client.post(
        "/api/v1/hr/documents",
        data={**data, "category": "MEDICAL"},
        files={"file": ("medical.pdf", b"%PDF-1.4 document", "application/pdf")},
    )
    assert rejected.status_code == 400
    invalid = await async_client.patch(
        f"/api/v1/hr/documents/{document_id}", json={"title": None}
    )
    assert invalid.status_code == 400


async def test_choices_search_and_counts_are_scoped(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    hr, employee, _, _ = await make_supervised_pair(
        db_async,
        "hr.document.read.department",
        "hr.document.manage",
        "hr.document.create",
    )
    outsider = await make_user(db_async)
    department = await make_department(db_async)
    await make_employee(db_async, user=outsider, department_id=department.id)
    app.dependency_overrides[get_current_user] = lambda: hr
    response = await async_client.get(
        "/api/v1/hr/document-employees", params={"size": 1}
    )
    assert response.status_code == 200, response.text
    assert response.json()["count"] == 2
    assert len(response.json()["data"]) == 1
    choices = await async_client.get("/api/v1/hr/document-employees")
    assert {row["user_id"] for row in choices.json()["data"]} == {
        str(hr.id),
        str(employee.id),
    }
    literal = await async_client.get(
        "/api/v1/hr/document-employees", params={"search": "%"}
    )
    assert literal.status_code == 200, literal.text
    assert literal.json()["count"] == 0


async def test_storage_unavailable_returns_actionable_error(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = await make_user(db_async)
    department = await make_department(db_async)
    await make_employee(db_async, user=user, department_id=department.id)
    role, _ = await make_role_with_permission(db_async, "hr.document.create")
    await assign_role(db_async, user=user, role=role)
    app.dependency_overrides[get_current_user] = lambda: user

    async def fail(**_kwargs):
        raise StorageNotConfiguredError()

    monkeypatch.setattr(service, "_store_object", fail)
    response = await async_client.post(
        "/api/v1/hr/documents",
        data={"user_id": str(user.id), "category": "CONTRACT", "title": "Contract"},
        files={"file": ("contract.pdf", b"%PDF-1.4 document", "application/pdf")},
    )
    assert response.status_code == 503
    assert response.json()["detail"] == "Document storage is not configured"
