"""Organisation upload lifecycle as a declared table. No database access.

One upload (``OrgUpload.status``), one move:

    complete  PENDING -> COMPLETE     the file is in storage and matches what was asked for

An upload is created PENDING when the client asks for a signed upload link (an insert,
not a move). COMPLETE is final. A pending upload whose link expires is never moved; it
stays PENDING and ``uploads.py`` removes it later.

The one write to ``OrgUpload.status`` goes through ``move_upload``. Asking to complete
an upload that is already COMPLETE is answered by the caller with the same row (the
request is safe to repeat), so it never reaches the table.
"""

from typing import Literal, NamedTuple

from src.exceptions import AppException

from .models import OrgUpload, UploadStatus

UploadMove = Literal["complete"]


class Transition(NamedTuple):
    allowed_from: frozenset[UploadStatus]
    target: UploadStatus


TRANSITIONS: dict[UploadMove, Transition] = {
    "complete": Transition(frozenset({UploadStatus.PENDING}), UploadStatus.COMPLETE),
}


def can_move(state: UploadStatus, move: UploadMove) -> bool:
    return state in TRANSITIONS[move].allowed_from


def move_upload(upload: OrgUpload, move: UploadMove) -> None:
    """Set ``upload.status`` to the move's target. Raises a 409 when the table does
    not allow the move, or when the stored value is not a declared status."""
    try:
        state = UploadStatus(upload.status)
    except ValueError:
        raise AppException(
            f"This upload has an unknown status '{upload.status}'", 409
        ) from None
    if not can_move(state, move):
        raise AppException(f"An upload cannot {move} from status {state.value}", 409)
    upload.status = TRANSITIONS[move].target.value
