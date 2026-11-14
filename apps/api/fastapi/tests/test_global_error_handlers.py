"""Global handlers: server bugs answer 500, genuine client errors keep their shape."""

import logging
import uuid
from collections.abc import Iterator
from types import SimpleNamespace

import httpx
import pytest
from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import _integrity_details
from src.main import app
from tests.factories import make_user


class Body(BaseModel):
    count: int


class Out(BaseModel):
    count: int


def _integrity(sqlstate: str, constraint: str) -> IntegrityError:
    orig = SimpleNamespace(
        sqlstate=sqlstate, diag=SimpleNamespace(constraint_name=constraint)
    )
    return IntegrityError("INSERT ...", {}, orig)  # type: ignore[arg-type]


_router = APIRouter(prefix="/_test-error-handlers")


@_router.post("/body")
async def _body(body: Body) -> Out:
    return Out(count=body.count)


@_router.get("/response-model", response_model=Out)
async def _response_model() -> dict[str, str]:
    return {"count": "not-a-number"}


@_router.get("/pydantic")
async def _pydantic() -> Out:
    return Out.model_validate({"count": "not-a-number"})


@_router.get("/not-null")
async def _not_null() -> None:
    raise _integrity("23502", "items_name_not_null")


@_router.get("/unique")
async def _unique() -> None:
    raise _integrity("23505", "items_name_key")


_REAL_ERRORS: list[IntegrityError] = []


@_router.get("/real-unique")
async def _real_unique() -> None:
    raise _REAL_ERRORS[-1]


@pytest.fixture
def client() -> Iterator[httpx.AsyncClient]:
    before = len(app.router.routes)
    app.include_router(_router)
    try:
        yield httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app, raise_app_exceptions=False),
            base_url="http://test",
        )
    finally:
        del app.router.routes[before:]


@pytest.mark.asyncio
async def test_response_model_failure_is_500(client: httpx.AsyncClient) -> None:
    response = await client.get("/_test-error-handlers/response-model")
    assert response.status_code == 500
    assert response.json() == {"detail": "Internal Server Error"}


@pytest.mark.asyncio
async def test_server_side_pydantic_error_is_500(client: httpx.AsyncClient) -> None:
    response = await client.get("/_test-error-handlers/pydantic")
    assert response.status_code == 500


@pytest.mark.asyncio
async def test_request_body_validation_still_422(client: httpx.AsyncClient) -> None:
    response = await client.post("/_test-error-handlers/body", json={"count": "x"})
    assert response.status_code == 422
    errors = response.json()["errors"]
    assert set(errors[0]) == {"type", "loc", "msg"}
    assert errors[0]["loc"] == ["body", "count"]


@pytest.mark.asyncio
async def test_unexpected_integrity_error_is_500(client: httpx.AsyncClient) -> None:
    response = await client.get("/_test-error-handlers/not-null")
    assert response.status_code == 500
    assert response.json() == {"detail": "Internal Server Error"}


@pytest.mark.asyncio
async def test_unique_violation_still_409_and_logged(
    client: httpx.AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.WARNING, logger="src.exceptions"):
        response = await client.get("/_test-error-handlers/unique")
    assert response.status_code == 409
    assert response.json() == {
        "detail": "Resource already exists or constraint violation"
    }
    records = [r for r in caplog.records if r.name == "src.exceptions"]
    assert len(records) == 1
    assert records[0].error_type == "IntegrityError"  # type: ignore[attr-defined]


@pytest.mark.asyncio
async def test_real_unique_violation_is_409(
    client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """The asyncpg driver error carries the SQLSTATE the handler reads."""
    email = f"dup-{uuid.uuid4()}@example.com"
    await make_user(db_async, email=email)
    with pytest.raises(IntegrityError) as caught:
        await make_user(db_async, email=email)
    await db_async.rollback()
    _REAL_ERRORS.append(caught.value)
    assert _integrity_details(caught.value)[0] == "23505"
    response = await client.get("/_test-error-handlers/real-unique")
    assert response.status_code == 409
