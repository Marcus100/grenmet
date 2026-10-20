"""Manual rail: cash, bank transfer and cheque recorded by staff.

Nothing is collected online. Staff record the payment (``service.record_manual_payment``),
which is what today's invoice and Events outlet records already are.
"""

import uuid
from collections.abc import Mapping

from src.payments.exceptions import InvalidCallbackError
from src.payments.models import Intent, IntentStatus, ProviderKey

from .base import PaymentStart, ProviderEvent, ProviderStatus, RefundResult


class ManualProvider:
    key = ProviderKey.MANUAL.value

    async def create_payment(self, intent: Intent) -> PaymentStart:  # noqa: ARG002
        return PaymentStart()

    def verify_callback(
        self,
        headers: Mapping[str, str],  # noqa: ARG002
        body: bytes,  # noqa: ARG002
    ) -> ProviderEvent:
        # There is no callback for a staff-recorded rail.
        raise InvalidCallbackError()

    async def refund(
        self,
        intent: Intent,  # noqa: ARG002
        amount_minor: int,  # noqa: ARG002
        refund_id: uuid.UUID,  # noqa: ARG002
    ) -> RefundResult:
        # Staff hand the money back themselves; the refund is the record of it.
        return RefundResult(provider_ref=None, status="succeeded")

    async def fetch_status(self, intent: Intent) -> ProviderStatus:
        return ProviderStatus(status=IntentStatus(intent.status).value)
