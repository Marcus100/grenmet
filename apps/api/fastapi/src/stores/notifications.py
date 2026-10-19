"""Stores notifications: who is told when a requisition moves.

Events are registered with the notifications catalogue (``register``) and queued
with ``notify`` inside the caller's transaction, so a rolled-back change never
notifies. Titles and bodies carry only the reference, department and requester:
approver notes and line detail stay behind the login. Every event uses a
``dedupe_key`` so a retry or a repeated action never tells anyone twice.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.hr.models import Department
from src.notifications import events
from src.notifications import service as notification_service
from src.notifications.events import EventDef

from .models import Requisition

SUBMITTED = "stores.requisition_submitted"
APPROVED = "stores.requisition_approved"
REJECTED = "stores.requisition_rejected"
PARTIALLY_DELIVERED = "stores.requisition_partially_delivered"
DELIVERED = "stores.requisition_delivered"

VARIABLES = ("reference", "requester_name", "department")
APPROVALS_LINK = "/salesbus/sales"
REQUISITIONS_LINK = "/salesbus/settlements/transactions"


def register() -> None:
    for event in (
        EventDef(
            key=SUBMITTED,
            label="Requisition waiting for approval",
            description="A stores requisition was submitted for your department.",
            audience="Stores approvers for the requisition's department",
            title="{{ reference }} waiting for your approval",
            body="{{ requester_name }} ({{ department }}) submitted a stores requisition.",
            variables=VARIABLES,
            email_mutable=False,
            default_roles=("stores-approver",),
        ),
        EventDef(
            key=APPROVED,
            label="Your requisition was approved",
            description="An approver approved your stores requisition.",
            audience="The person who raised the requisition",
            title="{{ reference }} was approved",
            body="Your stores requisition was approved and is waiting for the stores.",
            variables=VARIABLES,
        ),
        EventDef(
            key=REJECTED,
            label="Your requisition was not approved",
            description="An approver rejected your stores requisition.",
            audience="The person who raised the requisition",
            title="{{ reference }} was not approved",
            body="Open the portal to see the decision.",
            variables=VARIABLES,
        ),
        EventDef(
            key=PARTIALLY_DELIVERED,
            label="Part of your requisition was delivered",
            description="The stores delivered part of your approved requisition.",
            audience="The person who raised the requisition",
            title="{{ reference }} partly delivered",
            body="Some items were delivered; the rest are still to come.",
            variables=VARIABLES,
        ),
        EventDef(
            key=DELIVERED,
            label="Your requisition was delivered",
            description="The stores delivered everything approved on your requisition.",
            audience="The person who raised the requisition",
            title="{{ reference }} delivered",
            body="Everything approved on your stores requisition was delivered.",
            variables=VARIABLES,
        ),
    ):
        events.register(event)


async def _notify(
    session: AsyncSession,
    req: Requisition,
    *,
    event_key: str,
    reference: str,
    recipients: tuple[uuid.UUID, ...],
    link_path: str,
    actor_id: uuid.UUID,
    dedupe_suffix: str = "",
) -> int:
    requester = await session.get(User, req.requester_user_id)
    department = await session.get(Department, req.department_id)
    return await notification_service.notify(
        session,
        event_key=event_key,
        organisation_id=req.organisation_id,
        recipients=recipients,
        context={
            "reference": reference,
            "requester_name": requester.full_name if requester else "",
            "department": department.name if department else req.department_id,
        },
        link_path=link_path,
        entity_type="stores_requisition",
        entity_id=str(req.id),
        department_id=req.department_id,
        dedupe_key=f"{event_key}:{req.id}{dedupe_suffix}",
        exclude=(actor_id,),
    )


async def submitted(session: AsyncSession, req: Requisition, reference: str) -> int:
    """Tell the department's approvers; the requester is never told of their own."""
    return await _notify(
        session,
        req,
        event_key=SUBMITTED,
        reference=reference,
        recipients=(),
        link_path=APPROVALS_LINK,
        actor_id=req.requester_user_id,
    )


async def decided(
    session: AsyncSession,
    req: Requisition,
    reference: str,
    *,
    approved: bool,
    actor_id: uuid.UUID,
) -> int:
    return await _notify(
        session,
        req,
        event_key=APPROVED if approved else REJECTED,
        reference=reference,
        recipients=(req.requester_user_id,),
        link_path=REQUISITIONS_LINK,
        actor_id=actor_id,
    )


async def delivered(
    session: AsyncSession,
    req: Requisition,
    reference: str,
    *,
    complete: bool,
    actor_id: uuid.UUID,
) -> int:
    # Partial deliveries repeat, so the key carries the running total: a retried
    # delivery of the same total is silent, a further delivery is announced.
    total = sum(line.delivered_quantity for line in req.lines)
    return await _notify(
        session,
        req,
        event_key=DELIVERED if complete else PARTIALLY_DELIVERED,
        reference=reference,
        recipients=(req.requester_user_id,),
        link_path=REQUISITIONS_LINK,
        actor_id=actor_id,
        dedupe_suffix=f":{total}",
    )
