"""Table-driven checks for the upload lifecycle (src/storage/transitions.py).
No database is needed."""

from types import SimpleNamespace
from typing import Any

import pytest

from src.exceptions import AppException
from src.storage import transitions as ut
from src.storage.models import UploadStatus


def test_declared_moves_are_exactly_the_expected_rows() -> None:
    assert set(ut.TRANSITIONS) == {"complete"}
    complete = ut.TRANSITIONS["complete"]
    assert complete.allowed_from == frozenset({UploadStatus.PENDING})
    assert complete.target is UploadStatus.COMPLETE


def test_a_pending_upload_completes() -> None:
    upload: Any = SimpleNamespace(status="pending")
    ut.move_upload(upload, "complete")
    assert upload.status == "complete"


@pytest.mark.parametrize("stored", ["complete", "quarantined"])
def test_a_finished_or_unknown_upload_is_refused(stored: str) -> None:
    upload: Any = SimpleNamespace(status=stored)
    with pytest.raises(AppException) as raised:
        ut.move_upload(upload, "complete")
    assert raised.value.status_code == 409
    assert upload.status == stored
