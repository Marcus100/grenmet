"""Every server-rendered PDF leaves through one helper with safe headers."""

import re
from pathlib import Path

from src.utils.pdf_response import pdf_response

SRC = Path(__file__).resolve().parents[1] / "src"


def test_pdf_response_is_private_unsniffed_and_named() -> None:
    response = pdf_response(b"%PDF-1.7", "Leave Application.pdf", "attachment")
    assert response.media_type == "application/pdf"
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["content-disposition"].startswith(
        'attachment; filename="Leave Application.pdf"'
    )


HAND_BUILT_PDF = r"""media_type\s*=\s*['"]application/pdf|['"]content-type['"]\s*:\s*['"]application/pdf"""


def test_routes_never_build_a_pdf_response_by_hand() -> None:
    offenders = [
        str(path.relative_to(SRC))
        for path in SRC.rglob("*.py")
        if path.name != "pdf_response.py"
        and re.search(HAND_BUILT_PDF, path.read_text(), re.IGNORECASE)
    ]
    assert offenders == []
