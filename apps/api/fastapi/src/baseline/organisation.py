"""Additive GAA establishment seed. Job structure never grants access."""

import logging
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select

from src.auth.models import User
from src.baseline import service
from src.baseline.department import GMS_DEPARTMENT_IDS
from src.baseline.models import BaselineAudit, OrganisationPosition, OrganisationUnit
from src.baseline.schemas import OrganisationCatalogue as OrganisationCatalogue
from src.baseline.schemas import OrganisationPreview as OrganisationPreview
from src.baseline.schemas import PositionSpec as PositionSpec
from src.baseline.schemas import UnitSpec as UnitSpec
from src.exceptions import AppException
from src.hr.models import Department, EmploymentRecord, Grade

CATALOGUE = OrganisationCatalogue.model_validate_json(
    Path(__file__).with_name("gaa-organisation.json").read_text()
)


async def department_mapping(session: AsyncSession) -> dict[str, str]:
    departments = (await session.execute(select(Department))).scalars().all()
    reserved = {spec.id for spec in CATALOGUE.units} | GMS_DEPARTMENT_IDS
    if any(d.organisation_id != "gaa" and d.id in reserved for d in departments):
        raise AppException(
            "GAA department identity belongs to another organisation", 409
        )
    departments = [d for d in departments if d.organisation_id == "gaa"]
    gms_ids = {d.id for d in departments} & GMS_DEPARTMENT_IDS
    if len(gms_ids) > 1:
        raise AppException(
            "Multiple GMS department identities require reconciliation", 409
        )
    result: dict[str, str] = {}
    for spec in CATALOGUE.units:
        candidates = {
            d.id for d in departments if d.id == spec.id or d.name == spec.name
        }
        if spec.id == "gms":
            candidates |= gms_ids
        if len(candidates) > 1:
            raise AppException(f"Ambiguous department identity: {spec.id}", 409)
        result[spec.id] = next(iter(candidates), spec.id)
    return result


async def preview(session: AsyncSession, actor: User) -> OrganisationPreview:
    service.require_admin(actor)
    mapping = await department_mapping(session)
    result = OrganisationPreview(catalogue=CATALOGUE)
    for spec in CATALOGUE.units:
        if await session.get(Department, mapping[spec.id]) is None:
            result.missing_departments.append(spec.id)
        unit = await session.get(OrganisationUnit, spec.id)
        if unit is None:
            result.missing_units.append(spec.id)
        elif unit.department_id != mapping[spec.id] or unit.parent_id != spec.parent_id:
            result.conflicts.append(f"Existing organisation unit differs: {spec.id}")
    for position_spec in CATALOGUE.positions:
        position = await session.get(OrganisationPosition, position_spec.id)
        if position is None:
            result.missing_positions.append(position_spec.id)
        elif (
            PositionSpec.model_validate(position, from_attributes=True) != position_spec
        ):
            result.conflicts.append(
                f"Existing position differs: {position_spec.id}; preserve and review"
            )
    rows = (
        (
            await session.execute(
                select(Grade.code)
                .join(EmploymentRecord, col(EmploymentRecord.grade_id) == Grade.id)
                .where(EmploymentRecord.department_id == mapping["gms"])
            )
        )
        .scalars()
        .all()
    )
    for code in rows:
        result.gms_staff_by_grade[code] = result.gms_staff_by_grade.get(code, 0) + 1
    for position_spec in (p for p in CATALOGUE.positions if p.unit_id == "gms"):
        count = result.gms_staff_by_grade.get(position_spec.grade_code, 0)
        expected = (position_spec.authorised_posts or 0) - (
            position_spec.reported_vacancies or 0
        )
        if count != expected:
            result.gms_differences.append(
                f"{position_spec.grade_code}: current employment {count}, chart occupancy {expected}; retain current GMS data"
            )
    return result


async def apply(session: AsyncSession, actor: User) -> OrganisationPreview:
    service.require_admin(actor)
    await session.execute(text("SELECT pg_advisory_xact_lock(73190506)"))
    before = await preview(session, actor)
    if before.conflicts:
        raise AppException("Resolve organisation conflicts before importing", 409)
    mapping = await department_mapping(session)
    for spec in CATALOGUE.units:
        if spec.id in before.missing_departments:
            session.add(
                Department(
                    organisation_id="gaa",
                    code=mapping[spec.id],
                    id=mapping[spec.id],
                    name=spec.name,
                )
            )
    await session.flush()
    for spec in CATALOGUE.units:
        if spec.id in before.missing_units:
            session.add(
                OrganisationUnit(
                    id=spec.id,
                    department_id=mapping[spec.id],
                    source_slide=spec.source_slide,
                )
            )
    await session.flush()
    for spec in CATALOGUE.units:
        if spec.id in before.missing_units:
            unit = await session.get(OrganisationUnit, spec.id)
            assert unit is not None
            unit.parent_id = spec.parent_id
    for position_spec in CATALOGUE.positions:
        if position_spec.id in before.missing_positions:
            session.add(
                OrganisationPosition.model_validate(
                    position_spec.model_dump(),
                    update={
                        "reports_to_position_id": None,
                        "additional_connection_id": None,
                    },
                )
            )
    await session.flush()
    for position_spec in CATALOGUE.positions:
        if position_spec.id in before.missing_positions:
            position = await session.get(OrganisationPosition, position_spec.id)
            assert position is not None
            position.reports_to_position_id = position_spec.reports_to_position_id
            position.additional_connection_id = position_spec.additional_connection_id
    if before.missing_units or before.missing_positions or before.missing_departments:
        session.add(
            BaselineAudit(
                actor_id=actor.id,
                action="organisation.import",
                details={
                    "version": CATALOGUE.version,
                    "units": before.missing_units,
                    "positions": before.missing_positions,
                },
            )
        )
    await session.commit()
    logging.getLogger(__name__).info(
        "organisation.import", extra={"actor_id": str(actor.id)}
    )
    return await preview(session, actor)
