"""Named request-body wrappers accept and reject exactly what the old annotations did.

Each wrapper replaced an anonymous annotation so the OpenAPI body is a ``$ref``.
The wire behaviour (accepted values, validation error locations and types) must
not change, so every wrapper is compared with the annotation it replaced. The
optional bodies are also called over HTTP with no body and with ``null``.
"""

import uuid
from collections.abc import Callable, Iterator
from datetime import date
from typing import Any

import httpx
import pytest
from fastapi.responses import JSONResponse
from pydantic import TypeAdapter, ValidationError

from src.billing import invoices
from src.billing.schemas import InvoiceIssue, InvoiceIssueBody
from src.bookings import public
from src.bookings.schemas import BookingPublicCancel, BookingPublicCancelBody
from src.config import settings
from src.eregister.schemas import (
    QcDecisionBody,
    QcDecisionRequest,
    SendObservationBody,
    SendObservationRequest,
)
from src.hr.attendance import punch_service
from src.hr.attendance.clock_schemas import ClockPunchApprove, ClockPunchApproveBody
from src.notifications.schemas import (
    NotificationPreferenceUpdate,
    NotificationPreferenceUpdateList,
)
from src.wxproducts.schemas import (
    ProductPreviewBody,
    ProductPreviewInput,
    ProductWrite,
    ProductWriteBody,
)

OPTIONAL_SAMPLES: list[Any] = [None, {}, {"kind": "not-a-kind"}, "not-an-object", 7]
LIST_SAMPLES: list[Any] = [[], [{}], [{"not": "a preference"}], {}, None]


def _outcome(run: Callable[[], Any]) -> tuple[str, Any]:
    try:
        return ("ok", run())
    except ValidationError as error:
        return ("err", [(tuple(item["loc"]), item["type"]) for item in error.errors()])


CASES: list[tuple[Any, Any, list[Any]]] = [
    (InvoiceIssue | None, InvoiceIssueBody, OPTIONAL_SAMPLES),
    (BookingPublicCancel | None, BookingPublicCancelBody, OPTIONAL_SAMPLES),
    (ClockPunchApprove | None, ClockPunchApproveBody, OPTIONAL_SAMPLES),
    (SendObservationRequest | None, SendObservationBody, OPTIONAL_SAMPLES),
    (QcDecisionRequest | None, QcDecisionBody, OPTIONAL_SAMPLES),
    (
        list[NotificationPreferenceUpdate],
        NotificationPreferenceUpdateList,
        LIST_SAMPLES,
    ),
    (ProductWrite, ProductWriteBody, OPTIONAL_SAMPLES),
    (ProductPreviewInput, ProductPreviewBody, OPTIONAL_SAMPLES),
]


@pytest.mark.parametrize(
    ("annotation", "wrapper", "samples"),
    CASES,
    ids=lambda case: getattr(case, "__name__", str(case)),
)
def test_wrapper_matches_the_replaced_annotation(
    annotation: Any, wrapper: Any, samples: list[Any]
) -> None:
    adapter: TypeAdapter[Any] = TypeAdapter(annotation)
    for sample in samples:
        expected = _outcome(lambda sample=sample: adapter.validate_python(sample))
        actual = _outcome(lambda sample=sample: wrapper.model_validate(sample).root)
        assert actual == expected, f"{wrapper.__name__} diverges on {sample!r}"


@pytest.fixture
def captured(monkeypatch: pytest.MonkeyPatch) -> Iterator[dict[str, Any]]:
    """Record the arguments each service receives; the route returns a Response.

    FastAPI returns a Response object unvalidated, so the fakes need no domain data.
    """
    calls: dict[str, Any] = {}

    async def issue(
        _session: Any, _manager: Any, invoice_id: uuid.UUID, **kwargs: Any
    ) -> JSONResponse:
        calls["issue"] = {"invoice_id": invoice_id, **kwargs}
        return JSONResponse({"ok": True})

    async def cancel(_session: Any, token: str, **kwargs: Any) -> JSONResponse:
        calls["cancel"] = {"token": token, **kwargs}
        return JSONResponse({"ok": True})

    async def approve(**kwargs: Any) -> JSONResponse:
        calls["approve"] = kwargs
        return JSONResponse({"ok": True})

    monkeypatch.setattr(invoices, "issue", issue)
    monkeypatch.setattr(public, "cancel_booking", cancel)
    monkeypatch.setattr(punch_service, "approve_punch", approve)
    yield calls


# Each route with its optional body: the URL, and the service call the body feeds.
ROUTES = [
    pytest.param(
        f"{settings.API_V1_STR}/billing/invoices/{uuid.uuid4()}/issue",
        "issue",
        {"issue_date": "2026-11-01"},
        "issue_date",
        date(2026, 11, 1),
        id="billing-issue-invoice",
    ),
    pytest.param(
        f"{settings.API_V1_STR}/bookings/public/bookings/{'t' * 32}/cancel",
        "cancel",
        {"reason": "Cannot attend"},
        "reason",
        "Cannot attend",
        id="bookings-public-cancel",
    ),
    pytest.param(
        f"{settings.API_V1_STR}/hr/attendance/clock-punches/{uuid.uuid4()}/approve",
        "approve",
        {"note": "Checked against the terminal"},
        "note",
        "Checked against the terminal",
        id="hr-clock-punch-approve",
    ),
]


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async")
@pytest.mark.parametrize(("url", "service", "_body", "field", "_value"), ROUTES)
@pytest.mark.parametrize("variant", ["absent", "null"])
async def test_optional_body_absent_or_null_reaches_the_service_as_none(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    captured: dict[str, Any],
    url: str,
    service: str,
    _body: dict[str, Any],
    field: str,
    _value: Any,
    variant: str,
) -> None:
    headers = dict(superuser_token_headers_async)
    if variant == "null":
        headers["Content-Type"] = "application/json"
        response = await async_client.post(url, headers=headers, content=b"null")
    else:
        response = await async_client.post(url, headers=headers)
    assert response.status_code == 200, response.text
    assert captured[service][field] is None


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async")
@pytest.mark.parametrize(("url", "service", "body", "field", "value"), ROUTES)
async def test_optional_body_value_reaches_the_service(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    captured: dict[str, Any],
    url: str,
    service: str,
    body: dict[str, Any],
    field: str,
    value: Any,
) -> None:
    response = await async_client.post(
        url, headers=superuser_token_headers_async, json=body
    )
    assert response.status_code == 200, response.text
    assert captured[service][field] == value
