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

    async def create_payment(self, _intent: Intent, /) -> PaymentStart:
        return PaymentStart()

    def verify_callback(
        self,
        _headers: Mapping[str, str],
        _body: bytes,
        /,
    ) -> ProviderEvent:
        # There is no callback for a staff-recorded rail.
        raise InvalidCallbackError()

    async def refund(
        self,
        _intent: Intent,
        _amount_minor: int,
        _refund_id: uuid.UUID,
        /,
    ) -> RefundResult:
        # Staff hand the money back themselves; the refund is the record of it.
        return RefundResult(provider_ref=None, status="succeeded")

    async def fetch_status(self, intent: Intent, /) -> ProviderStatus:
        return ProviderStatus(status=IntentStatus(intent.status).value)
