"""Provider lookup by key. ``manual`` is always on; ``stripe`` only when configured."""

from src.payments.exceptions import UnknownProviderError
from src.payments.models import ProviderKey

from .base import PaymentProvider
from .manual import ManualProvider
from .stripe import StripeProvider


def get_provider(key: str) -> PaymentProvider:
    """The adapter for ``key``.

    Raises ``UnknownProviderError`` (404) for an unknown key and
    ``ProviderUnavailableError`` (503) when Stripe is unset or not a test key.
    """
    if key == ProviderKey.MANUAL.value:
        return ManualProvider()
    if key == ProviderKey.STRIPE.value:
        return StripeProvider()
    raise UnknownProviderError()
