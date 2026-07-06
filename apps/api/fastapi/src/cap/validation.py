import ipaddress
import socket
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse

from fastapi.concurrency import run_in_threadpool
from shapely.geometry import shape  # type: ignore[import-untyped]
from shapely.validation import explain_validity  # type: ignore[import-untyped]

from src.cap.exceptions import CapImportError
from src.cap.models import CapMessageType, CapScope
from src.cap.schemas import CapAlertPublic, CapValidationResult
from src.utils.datetime import utc_now

# Cap the response body pulled from an external CAP source (memory-DoS guard).
MAX_IMPORT_BYTES = 5 * 1024 * 1024


def validate_import_url(url: str) -> None:
    """Reject non-public CAP import URLs before any network I/O (SSRF guard).

    Pure/no-DNS: enforces http(s), forbids embedded credentials, and rejects
    literal private/loopback/link-local/reserved IPs and local hostnames.
    Host resolution is checked separately by ``ensure_public_host``.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise CapImportError(f"unsupported URL scheme '{parsed.scheme or ''}'")
    if parsed.username or parsed.password:
        raise CapImportError("credentials in import URL are not allowed")
    host = parsed.hostname
    if not host:
        raise CapImportError("import URL has no host")
    lowered = host.lower()
    if lowered == "localhost" or lowered.endswith(
        (".local", ".internal", ".localhost")
    ):
        raise CapImportError(f"host '{host}' is not permitted")
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return  # a hostname — DNS-resolved addresses are checked in ensure_public_host
    if not ip.is_global:
        raise CapImportError(f"host '{host}' resolves to a non-public address")


async def ensure_public_host(host: str) -> None:
    """Resolve ``host`` and reject it if any address is non-public (SSRF guard)."""
    try:
        infos = await run_in_threadpool(socket.getaddrinfo, host, None)
    except socket.gaierror as exc:
        raise CapImportError(f"could not resolve host '{host}': {exc}") from exc
    for info in infos:
        addr = info[4][0]
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            continue
        if not ip.is_global:
            raise CapImportError(f"host '{host}' resolves to a non-public address")


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
