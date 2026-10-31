"""Named request-body wrappers accept and reject exactly what the old annotations did.

Each wrapper replaced an anonymous annotation so the OpenAPI body is a ``$ref``.
The wire behaviour (accepted values, validation error locations and types) must
not change, so every wrapper is compared with the annotation it replaced.
"""

from collections.abc import Callable
from typing import Any

import pytest
from pydantic import TypeAdapter, ValidationError

from src.billing.schemas import InvoiceIssue, InvoiceIssueBody
from src.bookings.schemas import BookingPublicCancel, BookingPublicCancelBody
from src.eregister.schemas import (
    QcDecisionBody,
    QcDecisionRequest,
    SendObservationBody,
    SendObservationRequest,
)
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


@pytest.mark.parametrize(
    "wrapper",
    [
        InvoiceIssueBody,
        BookingPublicCancelBody,
        ClockPunchApproveBody,
        SendObservationBody,
        QcDecisionBody,
    ],
)
def test_absent_optional_body_defaults_to_none(wrapper: Any) -> None:
    # Routes declare ``payload: Wrapper = Wrapper(None)``: an absent body is None.
    assert wrapper(None).root is None
