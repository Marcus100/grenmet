"""Billing customers: one per platform organisation."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth.models import User
from src.exceptions import AppException
from src.organisations.models import PlatformOrganisation

from .exceptions import CustomerNotFoundError
from .models import Customer
from .schemas import CustomerCreate, CustomerPublic, CustomerUpdate


def _view(customer: Customer, organisation_name: str) -> CustomerPublic:
    return CustomerPublic(
        id=customer.id,
        organisation_id=customer.organisation_id,
        organisation_name=organisation_name,
        billing_email=customer.billing_email,
        address=customer.address,
        created_at=customer.created_at,
    )


async def get(session: AsyncSession, customer_id: uuid.UUID) -> CustomerPublic:
    row = (
        await session.execute(
            select(Customer, PlatformOrganisation.name)
            .join(
                PlatformOrganisation,
                PlatformOrganisation.id == Customer.organisation_id,
            )
            .where(Customer.id == customer_id)
        )
    ).first()
    if row is None:
        raise CustomerNotFoundError
    return _view(row[0], row[1])


async def list_customers(
    session: AsyncSession, *, skip: int, limit: int, query: str | None = None
) -> tuple[list[CustomerPublic], int]:
    base = select(Customer, PlatformOrganisation.name).join(
        PlatformOrganisation, PlatformOrganisation.id == Customer.organisation_id
    )
    if query and query.strip():
        base = base.where(PlatformOrganisation.name.ilike(f"%{query.strip()}%"))
    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    rows = (
        await session.execute(
            base.order_by(PlatformOrganisation.name, Customer.id)
            .offset(skip)
            .limit(limit)
        )
    ).all()
    return [_view(customer, name) for customer, name in rows], total or 0


async def create(
    session: AsyncSession, actor: User, payload: CustomerCreate
) -> CustomerPublic:
    organisation = await session.get(PlatformOrganisation, payload.organisation_id)
    if organisation is None:
        raise AppException("Organisation not found", 404)
    audit_service.set_actor(session, actor.id)
    customer = Customer(
        organisation_id=organisation.id,
        billing_email=str(payload.billing_email).lower(),
        address=payload.address,
    )
    session.add(customer)
    try:
        async with session.begin_nested():
            await session.flush()
    except IntegrityError as exc:
        raise AppException("This organisation is already a customer", 409) from exc
    return _view(customer, organisation.name)


async def update(
    session: AsyncSession, actor: User, customer_id: uuid.UUID, payload: CustomerUpdate
) -> CustomerPublic:
    customer = await session.get(Customer, customer_id)
    if customer is None:
        raise CustomerNotFoundError
    audit_service.set_actor(session, actor.id)
    fields = payload.model_fields_set
    if "billing_email" in fields and payload.billing_email is not None:
        customer.billing_email = str(payload.billing_email).lower()
    if "address" in fields:
        customer.address = payload.address
    await session.flush()
    return await get(session, customer_id)
