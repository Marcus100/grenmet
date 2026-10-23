"""Human download file names and RFC 6266 ``Content-Disposition`` headers.

Names are built from readable parts (title, Grenada-local date, revision), never
from database IDs. ``content_disposition`` sends an ASCII ``filename`` fallback
plus ``filename*=UTF-8''...`` so accented names survive in modern browsers.
"""

import re
import unicodedata
from datetime import date, datetime
from typing import Literal
from urllib.parse import quote

from .datetime import utc_now
from .timezones import GRENADA, utc_to_local

_FORBIDDEN = re.compile(r'[\\/:*?"<>|\x00-\x1f\x7f]+')
_SPACES = re.compile(r"\s+")
MAX_STEM = 120


def clean_part(text: str) -> str:
    """One name part: no path or shell-hostile characters, single spaces."""
    return _SPACES.sub(" ", _FORBIDDEN.sub(" ", text)).strip(" .")


def grenada_date(moment: datetime | None = None) -> date:
    """The Grenada calendar date of a naive-UTC moment (default: now)."""
    return utc_to_local(moment or utc_now(), GRENADA).date()


def pdf_filename(*parts: str, note: str | None = None) -> str:
    """``Part - Part (note).pdf`` with empty parts dropped and length capped."""
    stem = " - ".join(p for p in (clean_part(part) for part in parts) if p)
    stem = stem[:MAX_STEM].rstrip(" .-") or "Document"
    cleaned_note = clean_part(note) if note else ""
    suffix = f" ({cleaned_note})" if cleaned_note else ""
    return f"{stem}{suffix}.pdf"


def ascii_fallback(filename: str) -> str:
    folded = unicodedata.normalize("NFKD", filename).encode("ascii", "ignore").decode()
    folded = clean_part(folded)
    stem = folded.removesuffix(".pdf").strip(" .")
    return folded if stem and stem.lower() != "pdf" else "document.pdf"


def content_disposition(
    disposition: Literal["inline", "attachment"], filename: str
) -> str:
    """RFC 6266 header value with both ``filename`` and ``filename*``."""
    fallback = ascii_fallback(filename)
    return (
        f'{disposition}; filename="{fallback}"; '
        f"filename*=UTF-8''{quote(filename, safe='')}"
    )
