"""Check CAP XML against the official OASIS CAP 1.2 schema.

The schema is ``src/cap/standards/CAP-v1.2.xsd``, the unmodified OASIS file (see the
README beside it). The check is structural only: the schema cannot express the
standard's schematron rules (for example, a Restricted scope needs a restriction),
so ``src/cap/validation.py`` still enforces those.

Normal publish refuses a non-conforming document (422, logged). Emergency publish and
cancellation are never blocked by a schema mismatch: they go out, the mismatch is
returned to the caller to audit and notify. Validation is CPU-bound, so callers run
it in a thread (``run_in_threadpool``).
"""

import logging
import threading
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi.concurrency import run_in_threadpool
from lxml import etree

from src.cap.exceptions import CapSchemaValidationError

logger = logging.getLogger(__name__)

SCHEMA_PATH = Path(__file__).resolve().parent / "standards" / "CAP-v1.2.xsd"
MAX_REPORTED_ERRORS = 5
_MAX_ERROR_CHARS = 300
_THREAD = threading.local()
# XML 1.0 Char production; anything outside it makes a document not well-formed.
_ILLEGAL = (
    set(range(0x00, 0x09)) | {0x0B, 0x0C} | set(range(0x0E, 0x20)) | {0xFFFE, 0xFFFF}
)


def _parser() -> etree.XMLParser:
    # No entity expansion and no network access, for the schema and for untrusted input.
    # huge_tree stays off, so libxml2's depth and size limits apply.
    return etree.XMLParser(
        resolve_entities=False, no_network=True, dtd_validation=False
    )


def _schema() -> etree.XMLSchema:
    """One compiled schema per thread: validation records errors on the schema object."""
    schema = getattr(_THREAD, "schema", None)
    if schema is None:
        schema = _load_schema()
        _THREAD.schema = schema
    return schema


@lru_cache(maxsize=1)
def _load_schema() -> etree.XMLSchema:
    return etree.XMLSchema(etree.parse(str(SCHEMA_PATH), parser=_parser()))


def cap_schema_errors(xml: str | bytes) -> list[str]:
    """The first schema errors for ``xml``, or an empty list when it conforms.

    Raises ``etree.XMLSyntaxError`` when the document is not well-formed.
    """
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


def strip_illegal_xml_chars(text: str) -> str:
    """``text`` with every character XML 1.0 forbids removed (a last resort before publish)."""
    return "".join(char for char in text if ord(char) not in _ILLEGAL)


def ensure_cap_schema(
    xml: str | bytes,
    *,
    action: str,
    identifier: str | None = None,
    alert_id: Any = None,
) -> None:
    """Raise ``CapSchemaValidationError`` (422) when ``xml`` does not conform; log the refusal.

    A document that is not well-formed is refused the same way, with a readable reason.
    """
    try:
        errors = cap_schema_errors(xml)
    except etree.XMLSyntaxError as exc:
        errors = [f"not well-formed XML: {exc.msg}"[:_MAX_ERROR_CHARS]]
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


async def gate_cap_xml(
    xml: str,
    *,
    action: str,
    identifier: str,
    alert_id: Any,
    allow_mismatch: bool,
) -> tuple[str, str | None]:
    """Check outgoing XML off the event loop. Returns ``(xml_to_send, mismatch)``.

    * Conforming XML: returned unchanged, ``mismatch`` is None.
    * Not well-formed (illegal characters that slipped past save-time checks): the
      illegal characters are stripped and the result is checked again. Publishing
      goes ahead, and the repair is logged as an error.
    * Schema mismatch: normal publish refuses (422, logged). With ``allow_mismatch``
      (emergency publish and cancellation) the XML goes out and the first error is
      returned so the caller can audit and notify. It is logged as an error.
    """
    try:
        errors = await run_in_threadpool(cap_schema_errors, xml)
    except etree.XMLSyntaxError:
        xml = strip_illegal_xml_chars(xml)
        logger.error(
            "CAP XML had illegal characters at publish; stripped before publishing",
            extra={
                "action": action,
                "identifier": identifier,
                "alert_id": str(alert_id),
            },
        )
        try:
            errors = await run_in_threadpool(cap_schema_errors, xml)
        except etree.XMLSyntaxError as exc:
            raise CapSchemaValidationError([f"not well-formed XML: {exc.msg}"]) from exc
    if not errors:
        return xml, None
    if not allow_mismatch:
        logger.warning(
            "CAP XML refused by the CAP 1.2 schema",
            extra={
                "action": action,
                "identifier": identifier,
                "alert_id": str(alert_id),
                "error_count": len(errors),
                "errors": errors,
            },
        )
        raise CapSchemaValidationError(errors)
    logger.error(
        "CAP warning sent with a schema mismatch",
        extra={
            "action": action,
            "identifier": identifier,
            "alert_id": str(alert_id),
            "schema_error": errors[0],
        },
    )
    return xml, errors[0]


def _describe(error: etree._LogEntry) -> str:
    message = f"line {error.line}: {error.message}"
    return message[:_MAX_ERROR_CHARS]
