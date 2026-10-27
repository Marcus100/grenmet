"""Read the impact-based matrix and the approved hazard library for a forecaster.

The library entry for an alert kind is the newest APPROVED hazard profile with
the key ``ibf-<kind>`` (for example ``ibf-flood``). Without one, the colour still
comes from the WMO grid and only the wording is left to the forecaster.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.policy import has_permission
from src.baseline import product_access
from src.cap import ibf
from src.cap.levels import GmsColour, awareness_value, severity_for
from src.cap.models import CapHazardProfile
from src.cap.profile_schemas import (
    CapProfileDefinition,
    CapProfileSubtype,
    IbfImpact,
    IbfLevelPublic,
    IbfLikelihood,
    IbfMatrixPublic,
    IbfSuggestion,
)
from src.exceptions import AuthorizationError, NotFoundError


def library_key(kind: str) -> str:
    return f"ibf-{kind}"


async def require_access(session: AsyncSession, user: User, kind: str) -> None:
    """CAP readers, or anyone allowed to author this kind of GMS product."""
    if has_permission(current_user=user, permission_key="cap.alert.read"):
        return
    if kind in await product_access.allowed_kinds(session, user):
        return
    raise AuthorizationError("You are not authorised to use the alert matrix.")


async def latest_approved(
    session: AsyncSession, kind: str
) -> tuple[CapHazardProfile, CapProfileDefinition] | None:
    row = (
        (
            await session.execute(
                select(CapHazardProfile)
                .where(
                    CapHazardProfile.key == library_key(kind),
                    CapHazardProfile.state == "APPROVED",
                )
                .order_by(CapHazardProfile.version.desc())
                .limit(1)
            )
        )
        .scalars()
        .first()
    )
    if row is None:
        return None
    return row, CapProfileDefinition.model_validate(row.definition)


def grid_of(definition: CapProfileDefinition | None) -> list[list[str]]:
    if definition is not None and definition.matrix is not None:
        return definition.matrix.grid()
    return [list(row) for row in ibf.WMO_MATRIX]


def _subtype(
    definition: CapProfileDefinition, name: str | None
) -> CapProfileSubtype | None:
    if name is not None:
        return next((s for s in definition.subtypes if s.name == name), None)
    return next((s for s in definition.subtypes if s.impact_levels), None)


async def matrix(session: AsyncSession, user: User, kind: str) -> IbfMatrixPublic:
    await require_access(session, user, kind)
    found = await latest_approved(session, kind)
    definition = found[1] if found else None
    return IbfMatrixPublic(
        likelihoods=[
            IbfLevelPublic(label=name, percent=ibf.LIKELIHOOD_PERCENT[name])
            for name in ibf.LIKELIHOODS
        ],
        impacts=[IbfLevelPublic(label=name) for name in ibf.IMPACTS],
        cells=[[GmsColour(c) for c in row] for row in grid_of(definition)],
        meanings={GmsColour(k): v for k, v in ibf.COLOUR_MEANING.items()},
        library_key=found[0].key
        if found and definition and definition.matrix
        else None,
        library_version=(
            found[0].version if found and definition and definition.matrix else None
        ),
    )


def colour_for_kind(
    definition: CapProfileDefinition | None, likelihood: str, impact: str
) -> str:
    return ibf.colour_for(likelihood, impact, grid_of(definition))


async def suggest(
    session: AsyncSession,
    user: User,
    *,
    kind: str,
    likelihood: IbfLikelihood,
    impact: IbfImpact,
    subtype: str | None = None,
) -> IbfSuggestion:
    await require_access(session, user, kind)
    found = await latest_approved(session, kind)
    definition = found[1] if found else None
    colour = GmsColour(colour_for_kind(definition, likelihood, impact))
    chosen = _subtype(definition, subtype) if definition else None
    if definition and subtype is not None and chosen is None:
        raise NotFoundError(f"The {kind} library has no subtype named {subtype!r}.")
    level = (
        next((lv for lv in chosen.impact_levels if lv.impact == impact), None)
        if chosen
        else None
    )
    cell = (
        next(
            (
                c
                for c in chosen.cell_texts
                if c.likelihood == likelihood and c.impact == impact
            ),
            None,
        )
        if chosen
        else None
    )
    by_colour = (
        {r.colour: r.response for r in chosen.colour_responses} if chosen else {}
    )
    impacts = (cell.impacts if cell and cell.impacts else None) or (
        level.impacts if level else []
    )
    response = (cell.response if cell and cell.response else None) or by_colour.get(
        colour, ""
    )
    return IbfSuggestion(
        colour=colour,
        meaning=ibf.COLOUR_MEANING[colour.value],
        likelihood=likelihood,
        impact=impact,
        percent=ibf.LIKELIHOOD_PERCENT[likelihood],
        severity=severity_for(colour),
        awareness_level=awareness_value(colour),
        available=chosen is not None and bool(impacts or response),
        subtype=chosen.name if chosen else None,
        thresholds=list(level.thresholds) if level else [],
        impacts=list(impacts),
        response=response,
        library_key=found[0].key if found else None,
        library_version=found[0].version if found else None,
    )
