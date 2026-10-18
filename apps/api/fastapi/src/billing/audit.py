"""Change-history registrations for invoicing.

Invoices, their lines and payments group under the ``billing_invoice`` subject;
customers under ``billing_customer``. History is readable by holders of
``billing.manage`` (superusers are always allowed by the audit service).
"""

from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import registry
from src.auth.models import User
from src.auth.policy import has_permission

from .models import Customer, Invoice, InvoiceLine, Payment


async def _billing_manager(
    _session: AsyncSession, actor: User, _entity_id: str
) -> bool:
    return has_permission(current_user=actor, permission_key="billing.manage")


def register() -> None:
    registry.register_entity("billing_invoice", _billing_manager)
    registry.register_entity("billing_customer", _billing_manager)
    registry.track(
        Invoice,
        record_type="billing_invoice",
        label="Invoice",
    )
    registry.track(
        InvoiceLine,
        record_type="billing_invoice_line",
        entity_type="billing_invoice",
        entity_id_attr="invoice_id",
        label="Invoice line",
    )
    registry.track(
        Payment,
        record_type="billing_payment",
        entity_type="billing_invoice",
        entity_id_attr="invoice_id",
        label="Payment",
    )
    registry.track(
        Customer,
        record_type="billing_customer",
        label="Billing customer",
    )
