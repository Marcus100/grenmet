"""Append-only hazard profile definitions; approval never issues an alert."""

import uuid

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select

from src.auth.models import User
from src.auth.policy import require_permission
from src.cap import service
from src.cap.exceptions import CapStateError, CapValidationFailedError
from src.cap.models import CapCertainty, CapHazardProfile, CapSeverity, CapUrgency
from src.cap.profile_schemas import (
    CapProfileDefinition,
    CapProfileDraftRequest,
    CapProfilePublic,
    CapProfileSave,
)
from src.cap.schemas import CapAlertCreate, CapAlertPublic, CapInfoCreate, CapNameValue
from src.exceptions import AuthorizationError, NotFoundError
from src.utils.datetime import utc_now


def approval_errors(definition: CapProfileDefinition) -> list[str]:
    errors = []
    if (
        not definition.issuing_authority.strip()
        or not definition.reviewing_authority.strip()
    ):
        errors.append("Set the issuing and reviewing authorities.")
    if not definition.channels:
        errors.append("Select the intended distribution channels.")
    for subtype in definition.subtypes:
        if not subtype.rules:
            errors.append(f"{subtype.name}: add at least one assessment rule.")
        for template in definition.templates:
            if not any(rule.level == template.level for rule in subtype.rules):
                errors.append(f"{subtype.name}: add a rule for {template.level}.")
        for rule in subtype.rules:
            if not all(
                value.strip() for value in [rule.metric, rule.area, rule.evidence]
            ):
                errors.append(
                    f"{subtype.name}: rules need a metric, area and evidence source."
                )
            if rule.operator != "observed" and (
                rule.threshold is None
                or not rule.unit.strip()
                or rule.duration_minutes is None
            ):
                errors.append(
                    f"{subtype.name}: numeric rules need a threshold, unit and duration."
                )
        for label, values in [
            ("impacts", subtype.impacts),
            ("responses", subtype.responses),
            ("affected groups", subtype.affected_groups),
        ]:
            if not values or not all(value.strip() for value in values):
                errors.append(f"{subtype.name}: set {label}.")
    if not definition.templates:
        errors.append("Add at least one message template.")
    for template in definition.templates:
        if not all(
            value.strip()
            for value in [template.headline, template.description, template.instruction]
        ):
            errors.append(
                f"{template.level}: complete the headline, description and instruction."
            )
    return list(dict.fromkeys(errors))


def public(row: CapHazardProfile) -> CapProfilePublic:
    definition = CapProfileDefinition.model_validate(row.definition)
    return CapProfilePublic.model_validate(
        {
            **row.model_dump(),
            "definition": definition,
            "approval_errors": approval_errors(definition),
        }
    )


async def list_versions(
    session: AsyncSession, current_user: User
) -> list[CapProfilePublic]:
    require_permission(current_user=current_user, permission_key="cap.alert.read")
    result = await session.execute(
        select(CapHazardProfile).order_by(
            CapHazardProfile.key, col(CapHazardProfile.version).desc()
        )
    )
    return [public(row) for row in result.scalars()]


async def save_version(
    session: AsyncSession, current_user: User, key: str, payload: CapProfileSave
) -> CapProfilePublic:
    require_permission(current_user=current_user, permission_key="cap.settings.manage")
    result = await session.execute(
        select(CapHazardProfile)
        .where(CapHazardProfile.key == key)
        .order_by(col(CapHazardProfile.version).desc())
        .limit(1)
        .with_for_update()
    )
    latest = result.scalars().first()
    if payload.base_version != (latest.version if latest else 0):
        raise CapStateError("This profile changed. Reload before saving a new version.")
    row = CapHazardProfile(
        key=key,
        version=payload.base_version + 1,
        definition=payload.definition.model_dump(mode="json"),
        created_by=current_user.id,
    )
    session.add(row)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise CapStateError(
            "A profile version was saved concurrently. Reload and retry."
        ) from exc
    await session.refresh(row)
    return public(row)


async def get_row(session: AsyncSession, profile_id: uuid.UUID) -> CapHazardProfile:
    result = await session.execute(
        select(CapHazardProfile)
        .where(CapHazardProfile.id == profile_id)
        .with_for_update()
    )
    row = result.scalars().first()
    if row is None:
        raise NotFoundError("Hazard profile not found")
    return row


async def approve(
    session: AsyncSession, current_user: User, profile_id: uuid.UUID
) -> CapProfilePublic:
    require_permission(current_user=current_user, permission_key="cap.settings.manage")
    require_permission(current_user=current_user, permission_key="cap.alert.approve")
    row = await get_row(session, profile_id)
    if row.state != "DRAFT":
        raise CapStateError("Only draft profiles can be approved.")
    if row.created_by == current_user.id:
        raise AuthorizationError(
            "A different authorised reviewer must approve this profile."
        )
    errors = approval_errors(CapProfileDefinition.model_validate(row.definition))
    if errors:
        raise CapValidationFailedError(errors)
    row.state = "APPROVED"
    row.approved_by = current_user.id
    row.approved_at = utc_now()
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return public(row)


async def create_draft(
    session: AsyncSession,
    current_user: User,
    profile_id: uuid.UUID,
    payload: CapProfileDraftRequest,
) -> CapAlertPublic:
    require_permission(current_user=current_user, permission_key="cap.alert.create")
    row = await get_row(session, profile_id)
    if row.state != "APPROVED":
        raise CapStateError("Approve the profile before using it to start an alert.")
    definition = CapProfileDefinition.model_validate(row.definition)
    subtype = next((s for s in definition.subtypes if s.name == payload.subtype), None)
    template = next((t for t in definition.templates if t.level == payload.level), None)
    if subtype is None or template is None:
        raise CapValidationFailedError(
            ["Choose a subtype and template from this profile version."]
        )
    return await service.create_alert(
        session=session,
        current_user=current_user,
        payload=CapAlertCreate(
            info=[
                CapInfoCreate(
                    event=f"{subtype.name} {template.level}",
                    categories=subtype.categories,
                    headline=template.headline,
                    description=template.description,
                    instruction=template.instruction,
                    urgency=CapUrgency.UNKNOWN,
                    severity=CapSeverity.UNKNOWN,
                    certainty=CapCertainty.UNKNOWN,
                    sender_name=definition.issuing_authority,
                    contact=definition.contact,
                    parameters=[
                        CapNameValue(
                            value_name="GMS:hazard-profile",
                            value=f"{row.key}:v{row.version}",
                        )
                    ],
                )
            ]
        ),
    )
