"""Table-driven checks for the author's submit move on HR forms
(``submit_request`` in src/hr/workflow/transitions.py).

Leave, absentee report, shift swap, parking permit and status report all submit
through it. The expected rows are written out here. No database is needed.
"""

from types import SimpleNamespace
from typing import Any

import pytest

from src.exceptions import AppException
from src.hr.models import RequestStatus
from src.hr.workflow import transitions as wt

EXPECTED_SUBMIT_FROM = frozenset({RequestStatus.DRAFT, RequestStatus.RETURNED})


def test_submit_is_allowed_from_the_editable_statuses_only() -> None:
    assert wt.SUBMIT_FROM == EXPECTED_SUBMIT_FROM


@pytest.mark.parametrize("state", list(RequestStatus))
def test_submit_from_every_status(state: RequestStatus) -> None:
    form: Any = SimpleNamespace(status=state)

    if state in EXPECTED_SUBMIT_FROM:
        wt.submit_request(form)
        assert form.status is RequestStatus.SUBMITTED
    else:
        with pytest.raises(AppException) as raised:
            wt.submit_request(form)
        assert raised.value.status_code == 409
        assert form.status is state


def test_refusal_message_is_kept_when_given() -> None:
    form: Any = SimpleNamespace(status=RequestStatus.APPROVED)
    with pytest.raises(AppException, match="Only a draft application"):
        wt.submit_request(form, refusal="Only a draft application can be submitted")


def test_unknown_stored_status_is_refused_not_crashed() -> None:
    form: Any = SimpleNamespace(status="ARCHIVED")
    with pytest.raises(AppException) as raised:
        wt.submit_request(form)
    assert raised.value.status_code == 409
    assert form.status == "ARCHIVED"
