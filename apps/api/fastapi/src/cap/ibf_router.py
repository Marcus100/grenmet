from typing import Annotated

from fastapi import APIRouter, Query

from src.cap import ibf_suggest
from src.cap.profile_schemas import (
    IbfImpact,
    IbfLikelihood,
    IbfMatrixPublic,
    IbfSuggestion,
)
from src.dependencies import CurrentUser, SessionDep
from src.openapi_responses import AUTHENTICATED

router = APIRouter(prefix="/ibf", tags=["cap"])

Kind = Annotated[str, Query(pattern=r"^[a-z][a-z0-9-]{1,39}$")]


@router.get(
    "/matrix",
    response_model=IbfMatrixPublic,
    summary="The impact-based matrix for an alert kind",
    description=(
        "The 4x4 likelihood-by-impact grid with the meaning of each colour. It is the "
        "grid of the newest approved library entry `ibf-<kind>` when that sets its own, "
        "otherwise the WMO grid. Needs cap.alert.read or authority to author the kind."
    ),
    responses={**AUTHENTICATED},
)
async def read_ibf_matrix(
    session: SessionDep, current_user: CurrentUser, kind: Kind
) -> IbfMatrixPublic:
    return await ibf_suggest.matrix(session, current_user, kind)


@router.get(
    "/suggest",
    response_model=IbfSuggestion,
    summary="The colour and starting wording for a likelihood and impact",
    description=(
        "The colour from the matrix, with the impacts and response of the approved "
        "library entry `ibf-<kind>` as editable starting text. `available` is false "
        "when no approved entry exists; the colour is still suggested. Needs "
        "cap.alert.read or authority to author the kind."
    ),
    responses={**AUTHENTICATED},
)
async def suggest_ibf(
    session: SessionDep,
    current_user: CurrentUser,
    kind: Kind,
    likelihood: IbfLikelihood,
    impact: IbfImpact,
    subtype: Annotated[str | None, Query(max_length=200)] = None,
) -> IbfSuggestion:
    return await ibf_suggest.suggest(
        session,
        current_user,
        kind=kind,
        likelihood=likelihood,
        impact=impact,
        subtype=subtype,
    )
