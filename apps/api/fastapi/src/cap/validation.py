from datetime import datetime, timezone

from src.cap.models import CapMessageType, CapScope
from src.cap.schemas import CapAlertPublic, CapValidationResult
from src.utils.datetime import utc_now


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

    return CapValidationResult(is_valid=not errors, errors=errors, warnings=warnings)


def _as_naive_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)
