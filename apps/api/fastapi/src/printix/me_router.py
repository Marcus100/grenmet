"""Printix self routes (ADR-0060 organiser amendment, ADR-0025 zone ``me``).

Names no organisation: the signed-in person sees which organisations they may run
Printix organiser routes for, so the screen can hide what they cannot do. Needs a
``printix`` app session that passed the authenticator.
"""

from typing import Any

from fastapi import APIRouter

from src.dependencies import SessionDep
from src.openapi_responses import AUTHENTICATED

from . import service
from .dependencies import PrintixAppUser
from .schemas import PrintixOrganiserOrganisation

router = APIRouter(prefix="/printix/me", tags=["printix-me"])


@router.get(
    "/organisations",
    response_model=list[PrintixOrganiserOrganisation],
    summary="List the organisations I can run Printix for",
    description=(
        "The organisations where the signed-in person is an active member, the "
        "organisation is entitled to printix, and they hold printix.events.manage or "
        "printix.gates.manage. Each item says which of the two keys they hold. Needs a "
        "printix app session that passed the authenticator."
    ),
    responses=AUTHENTICATED,
)
async def list_my_organiser_organisations_endpoint(
    *, session: SessionDep, user: PrintixAppUser
) -> Any:
    return await service.organiser_organisations(session, user.id)
