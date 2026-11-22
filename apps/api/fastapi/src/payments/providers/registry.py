"""Provider lookup by key. ``manual`` is always on; ``stripe`` only when configured.

``wipay`` is per business: its adapter needs that business's own credentials, so it is
loaded from the database (``provider_for``, ``verify_callback``), never from here.
"""

from collections.abc import Mapping

from sqlalchemy.ext.asyncio import AsyncSession

from src.payments.exceptions import ProviderUnavailableError, UnknownProviderError
from src.payments.models import ProviderKey

from . import wipay
from .base import PaymentProvider, ProviderEvent
from .manual import ManualProvider
from .stripe import StripeProvider


def get_provider(key: str) -> PaymentProvider:
    """The adapter for ``key``.

    Raises ``UnknownProviderError`` (404) for an unknown key and
    ``ProviderUnavailableError`` (503) when Stripe is unset or not a test key. WiPay
    needs a business's credentials: use ``provider_for``.
    """
    if key == ProviderKey.MANUAL.value:
        return ManualProvider()
    if key == ProviderKey.STRIPE.value:
        return StripeProvider()
    if key == ProviderKey.WIPAY.value:
        raise ProviderUnavailableError("WiPay is set up per business")
    raise UnknownProviderError()


async def provider_for(
    session: AsyncSession, *, organisation_id: str, key: str
) -> PaymentProvider:
    """The adapter for ``key`` as the organisation's business uses it."""
    if key == ProviderKey.WIPAY.value:
        return await wipay.load_provider(session, organisation_id=organisation_id)
    return get_provider(key)


async def verify_callback(
    session: AsyncSession,
    *,
    provider_key: str,
    headers: Mapping[str, str],
    body: bytes,
) -> ProviderEvent:
    """Verify a provider's callback. WiPay's secret is the business's own, found from
    the order the callback names, so it is checked with a database read."""
    if provider_key == ProviderKey.WIPAY.value:
        return await wipay.verify_webhook(session, headers=headers, body=body)
    return get_provider(provider_key).verify_callback(headers, body)
