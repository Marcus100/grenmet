"""One response shape for every server-rendered PDF."""

from typing import Literal

from fastapi import Response

from src.utils.filenames import content_disposition

PDF_MEDIA_TYPE = "application/pdf"

# For a route's ``responses[200]``, so the OpenAPI contract states what ``pdf_response`` sends.
PDF_HEADERS_DOC: dict[str, dict[str, object]] = {
    "Cache-Control": {
        "description": "Always `private, no-store`.",
        "schema": {"type": "string"},
    },
    "Content-Disposition": {
        "description": "RFC 6266 `filename` and `filename*` for download and print.",
        "schema": {"type": "string"},
    },
    "X-Content-Type-Options": {
        "description": "Always `nosniff`.",
        "schema": {"type": "string"},
    },
}


def pdf_response(
    content: bytes,
    filename: str,
    disposition: Literal["inline", "attachment"] = "inline",
) -> Response:
    """A PDF that is never cached or sniffed, named for download and print."""
    return Response(
        content,
        media_type=PDF_MEDIA_TYPE,
        headers={
            "Cache-Control": "private, no-store",
            "Content-Disposition": content_disposition(disposition, filename),
            "X-Content-Type-Options": "nosniff",
        },
    )
