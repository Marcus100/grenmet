import ipaddress
import logging
import re
import socket
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse, urlsplit
from uuid import UUID

from fastapi.concurrency import run_in_threadpool
from shapely.geometry import shape
from shapely.validation import explain_validity

from src.cap.exceptions import CapFeedUrlError, CapHostRefusedError, CapImportError
from src.cap.levels import validate_level, validate_sectors
from src.cap.models import CapMessageType, CapScope
from src.cap.schemas import CapAlertPublic, CapNameValue, CapValidationResult
from src.utils.datetime import utc_now

logger = logging.getLogger(__name__)

# Cap the response body pulled from an external CAP source (memory-DoS guard).
MAX_IMPORT_BYTES = 5 * 1024 * 1024

_URL_CONTROL_OR_SPACE = re.compile(r"[\s\x00-\x1f\x7f]")


def validate_import_url(url: str) -> None:
    """Reject non-public CAP import URLs before any network I/O (SSRF guard).

    Pure/no-DNS: enforces http(s), forbids embedded credentials, and rejects
    literal private/loopback/link-local/reserved IPs and local hostnames.
    Host resolution is checked separately by ``ensure_public_host``.
    """
    try:
        parsed = urlparse(url)
    except ValueError as exc:  # e.g. a malformed IPv6 literal
        raise CapHostRefusedError("malformed URL") from exc
    if parsed.scheme not in ("http", "https"):
        raise CapHostRefusedError(f"unsupported URL scheme '{parsed.scheme or ''}'")
    if parsed.username or parsed.password:
        raise CapHostRefusedError("credentials in import URL are not allowed")
    host = parsed.hostname
    if not host:
        raise CapHostRefusedError("import URL has no host")
    lowered = host.lower()
    if lowered == "localhost" or lowered.endswith(
        (".local", ".internal", ".localhost")
    ):
        raise CapHostRefusedError(f"host '{host}' is not permitted")
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return  # a hostname — DNS-resolved addresses are checked in ensure_public_host
    if not ip.is_global:
        raise CapHostRefusedError(f"host '{host}' resolves to a non-public address")


def validate_feed_url(url: str) -> None:
    """Save-time check for a registered feed URL: https, public literal host, no credentials.

    Runs the same pure checks as ``validate_import_url`` and adds the https-only rule.
    It does no DNS lookup: the ingest path resolves the host with ``ensure_public_host``
    before every fetch. Any refusal raises ``CapFeedUrlError`` with a fixed message; the
    reason is logged, not returned.
    """
    if _URL_CONTROL_OR_SPACE.search(url):
        logger.info(
            "CAP feed URL refused at save", extra={"reason": "control or space"}
        )
        raise CapFeedUrlError()
    try:
        scheme = urlsplit(url).scheme.lower()
        if scheme != "https":
            raise CapHostRefusedError(f"scheme '{scheme}' is not https")
        validate_import_url(url)
    except (CapImportError, ValueError) as exc:
        logger.info("CAP feed URL refused at save", extra={"reason": str(exc)})
        raise CapFeedUrlError() from exc


async def ensure_public_host(host: str) -> str:
    """Resolve ``host``, reject it if any address is non-public, and return the first address.

    The caller connects to the returned address (see ``src.cap.safe_fetch``), so the
    name is not resolved a second time between this check and the connection.
    """
    try:
        infos = await run_in_threadpool(socket.getaddrinfo, host, None)
    except socket.gaierror as exc:
        raise CapHostRefusedError(f"could not resolve host '{host}': {exc}") from exc
    addresses: list[str] = []
    for info in infos:
        addr = str(info[4][0])
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            continue
        if not ip.is_global:
            raise CapHostRefusedError(f"host '{host}' resolves to a non-public address")
        addresses.append(addr)
    if not addresses:
        raise CapHostRefusedError(f"could not resolve host '{host}'")
    return addresses[0]


def validate_cap_alert(alert: CapAlertPublic) -> CapValidationResult:
    errors: list[str] = []
    warnings: list[str] = []

    if not alert.identifier:
        errors.append("identifier is required")
    if not alert.sender:
        errors.append("sender is required")
    if not alert.sent:
        errors.append("sent is required")
    if alert.scope == CapScope.RESTRICTED and not alert.restriction:
        errors.append("restriction is required when scope is Restricted")
    if alert.scope == CapScope.PRIVATE and not alert.addresses:
        errors.append("addresses are required when scope is Private")
    if alert.msg_type != CapMessageType.ALERT and not alert.references:
        errors.append("references are required for Update, Cancel, Ack, and Error")
    if (
        alert.msg_type in (CapMessageType.ALERT, CapMessageType.UPDATE)
        and not alert.info
    ):
        errors.append("at least one info block is required")

    for info_index, info in enumerate(alert.info, start=1):
        prefix = f"info[{info_index}]"
        if not info.categories:
            errors.append(f"{prefix}.category is required")
        if not info.event:
            errors.append(f"{prefix}.event is required")
        if not info.headline:
            errors.append(f"{prefix}.headline is required")
        if not info.description:
            errors.append(f"{prefix}.description is required")
        if info.effective and info.onset and info.onset < info.effective:
            errors.append(f"{prefix}.onset must be on or after effective")
        if info.onset and info.expires and info.expires <= info.onset:
            errors.append(f"{prefix}.expires must be after onset")
        if info.effective and info.expires and info.expires <= info.effective:
            errors.append(f"{prefix}.expires must be after effective")
        if info.expires and _as_naive_utc(info.expires) <= utc_now():
            warnings.append(f"{prefix}.expires is in the past")
        if not info.areas:
            warnings.append(f"{prefix} has no area blocks")
        level_errors, level_warnings = validate_level(
            info.parameters, info.severity, prefix
        )
        errors.extend(level_errors)
        warnings.extend(level_warnings)
        errors.extend(validate_sectors(info.parameters, prefix))
        errors.extend(_validate_source_bulletin_link(info.parameters, prefix))
        for area_index, area in enumerate(info.areas, start=1):
            area_prefix = f"{prefix}.area[{area_index}]"
            if not area.area_desc:
                errors.append(f"{area_prefix}.area_desc is required")
            if area.altitude is not None and area.ceiling is not None:
                if area.ceiling < area.altitude:
                    errors.append(f"{area_prefix}.ceiling must be above altitude")
            geom_error = _validate_geometry(area.geometry)
            if geom_error:
                errors.append(f"{area_prefix}.geometry {geom_error}")

    return CapValidationResult(is_valid=not errors, errors=errors, warnings=warnings)


_SOURCE_BULLETIN_KEYS = {
    "GMS:source-bulletin-kind",
    "GMS:source-bulletin-id",
    "GMS:source-bulletin-revision",
}


def _validate_source_bulletin_link(
    parameters: list[CapNameValue], prefix: str
) -> list[str]:
    entries = [item for item in parameters if item.value_name in _SOURCE_BULLETIN_KEYS]
    if not entries:
        return []
    values = {item.value_name: item.value for item in entries}
    if len(entries) != 3 or set(values) != _SOURCE_BULLETIN_KEYS:
        return [f"{prefix} source bulletin requires kind, ID, and revision once each"]
    try:
        source_id = UUID(values["GMS:source-bulletin-id"])
    except ValueError:
        return [f"{prefix} source bulletin ID must be a UUID"]
    if str(source_id) != values["GMS:source-bulletin-id"].lower():
        return [f"{prefix} source bulletin ID must be a canonical UUID"]
    if not re.fullmatch(r"[1-9][0-9]*", values["GMS:source-bulletin-revision"]):
        return [f"{prefix} source bulletin revision must be a positive integer"]
    if not re.fullmatch(r"[a-z][a-z0-9_-]*", values["GMS:source-bulletin-kind"]):
        return [f"{prefix} source bulletin kind is invalid"]
    return []


def _validate_geometry(geojson: dict[str, Any] | None) -> str | None:
    """Validate a GeoJSON geometry with shapely; None if absent or valid."""
    if not geojson:
        return None
    try:
        geom = shape(geojson)
    except Exception as exc:  # noqa: BLE001 - malformed GeoJSON of any shape
        return f"is malformed: {exc}"
    if not geom.is_valid:
        return f"is invalid: {explain_validity(geom)}"
    return None


def _as_naive_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)
