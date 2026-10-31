"""Check CAP XML against the official OASIS CAP 1.2 schema before it is published or imported.

The schema is ``src/cap/standards/CAP-v1.2.xsd``, the unmodified OASIS file (see the
README beside it). The check is structural only: the schema cannot express the
standard's schematron rules (for example, a Restricted scope needs a restriction),
so ``src/cap/validation.py`` still enforces those.

A non-conforming document is refused with HTTP 422 and logged. Malformed XML is
not handled here; the parser rejects it first.
"""

import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

from lxml import etree

from src.cap.exceptions import CapSchemaValidationError

logger = logging.getLogger(__name__)

SCHEMA_PATH = Path(__file__).resolve().parent / "standards" / "CAP-v1.2.xsd"
MAX_REPORTED_ERRORS = 5
_MAX_ERROR_CHARS = 300


def _parser() -> etree.XMLParser:
    # No entity expansion and no network access, for the schema and for untrusted input.
    return etree.XMLParser(
        resolve_entities=False, no_network=True, dtd_validation=False
    )


@lru_cache(maxsize=1)
def _schema() -> etree.XMLSchema:
    return etree.XMLSchema(etree.parse(str(SCHEMA_PATH), parser=_parser()))


def cap_schema_errors(xml: str | bytes) -> list[str]:
    """The first schema errors for ``xml``, or an empty list when it conforms."""
    raw = xml.encode("utf-8") if isinstance(xml, str) else xml
    document = etree.fromstring(raw, parser=_parser())
    try:
        _schema().assertValid(document)
    except etree.DocumentInvalid as exc:
        return [_describe(error) for error in exc.error_log][:MAX_REPORTED_ERRORS]
    return []


def first_schema_error(xml: str | bytes) -> str | None:
    """The first schema error for ``xml``, cut to fit the stored column, or None when it conforms."""
    errors = cap_schema_errors(xml)
    return errors[0][:1000] if errors else None


def ensure_cap_schema(
    xml: str | bytes,
    *,
    action: str,
    identifier: str | None = None,
    alert_id: Any = None,
) -> None:
    """Raise ``CapSchemaValidationError`` (422) when ``xml`` does not conform; log the refusal."""
    errors = cap_schema_errors(xml)
    if not errors:
        return
    logger.warning(
        "CAP XML refused by the CAP 1.2 schema",
        extra={
            "action": action,
            "identifier": identifier,
            "alert_id": str(alert_id) if alert_id is not None else None,
            "error_count": len(errors),
            "errors": errors,
        },
    )
    raise CapSchemaValidationError(errors)


def _describe(error: etree._LogEntry) -> str:
    message = f"line {error.line}: {error.message}"
    return message[:_MAX_ERROR_CHARS]
