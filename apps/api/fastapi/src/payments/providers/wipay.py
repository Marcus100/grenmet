"""WiPay adapter for Grenada (ADR-0027 amendment, 21 Nov 2026), over httpx.

Sources (public docs, read 21 Nov 2026): Payment Request, Transaction Response,
Hosted Checkout Flows, Platforms and Environments, Webhooks, Payments API events.

- A checkout is created with ``POST {host}/plugins/payments/request``. The
  business's own account number is sent; the API key never leaves the server.
- The customer returns by a browser GET to our ``response_url``. A success is
  accepted only when WiPay's ``hash`` matches ``md5(transaction_id + total + api_key)``
  computed with the total WE sent (two decimal places). A changed query total cannot
  change what is credited.
- Webhooks carry ``X-WiPay-Webhook-Signature: sha256=<hex>`` over
  ``timestamp + "." + raw body`` with the endpoint's own secret, and a timestamp.
- WiPay's Payments API has no refund call: a WiPay refund is made in the dashboard
  and is refused here (``ManualRefundRequiredError``).
- Credentials are per business (``MerchantAccount``), encrypted with the organisation
  keys. Live mode needs the owner's approval (see ``merchant_accounts``).
"""

import hashlib
import hmac
import json
import logging
import time
import uuid
from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.organisations.config import organisations_settings
from src.utils import secret_box
from src.utils.datetime import utc_now

from ..config import PaymentsConfig, payments_settings
from ..connect.models import ConnectedAccount
from ..exceptions import (
    InvalidCallbackError,
    ManualRefundRequiredError,
    ProviderRequestError,
    ProviderUnavailableError,
)
from ..models import Intent, MerchantAccount, MerchantEnvironment, ProviderKey
from .base import (
    EventKind,
    PaymentStart,
    ProviderEvent,
    ProviderStatus,
    RefundListing,
    RefundResult,
)

logger = logging.getLogger(__name__)

KEY = ProviderKey.WIPAY.value
PAYMENTS_PATH = "/plugins/payments/request"
#: Pages of the WiPay Grenada platform (live and sandbox), by country code.
HOSTS: dict[str, dict[str, str]] = {
    "BB": {
        "live": "https://bb.wipayfinancial.com",
        "sandbox": "https://bbsb.wipayfinancial.com",
    },
    "GD": {
        "live": "https://gd.wipayfinancial.com",
        "sandbox": "https://gdsb.wipayfinancial.com",
    },
    "GY": {
        "live": "https://gy.wipayfinancial.com",
        "sandbox": "https://gysb.wipayfinancial.com",
    },
    "JM": {
        "live": "https://jm.wipayfinancial.com",
        "sandbox": "https://jmsb.wipayfinancial.com",
    },
    "TT": {
        "live": "https://tt.wipayfinancial.com",
        "sandbox": "https://ttsb.wipayfinancial.com",
    },
}
#: Largest webhook body read (WiPay's envelopes are a few kilobytes).
MAX_WEBHOOK_BYTES = 64 * 1024
SIGNATURE_HEADER = "x-wipay-webhook-signature"
TIMESTAMP_HEADER = "x-wipay-webhook-timestamp"
#: Test seam: an httpx transport (MockTransport) used instead of the network.
_transport: httpx.AsyncBaseTransport | None = None


def base_url(environment: str, country: str = "GD") -> str:
    """The host for a platform country and an environment (``sandbox`` or ``live``)."""
    hosts = HOSTS.get(country)
    if hosts is None or environment not in hosts:
        raise ProviderUnavailableError(
            "WiPay does not serve this country or environment"
        )
    return hosts[environment]


# --- amounts and the response hash ----------------------------------------------------


def total_text(amount_minor: int) -> str:
    """WiPay's amount text: major units with exactly two decimal places (5000 -> 50.00)."""
    if amount_minor < 0:
        raise ValueError("amount_minor must not be negative")
    return f"{amount_minor // 100}.{amount_minor % 100:02d}"


def response_hash(transaction_id: str, amount_minor: int, signing_value: str) -> str:
    """WiPay's documented return hash: ``md5(transaction_id + original_total + <the
    business's WiPay API key>)``. MD5 is mandated by WiPay's protocol, so it cannot be
    changed here. It is not the only check on a live payment: live crediting also needs
    the signed webhook (HMAC-SHA256, the business's endpoint secret), and this hash is
    compared in constant time."""
    signed_text = f"{transaction_id}{total_text(amount_minor)}{signing_value}"
    return hashlib.md5(signed_text.encode(), usedforsecurity=False).hexdigest()


def hash_matches(
    received: str | None, transaction_id: str, amount_minor: int, api_key: str
) -> bool:
    """True only when WiPay's hash equals ours (constant-time). Missing is a mismatch."""
    if not received:
        return False
    expected = response_hash(transaction_id, amount_minor, api_key)
    return hmac.compare_digest(expected.encode(), received.strip().lower().encode())


# --- webhook signatures ---------------------------------------------------------------


def _header(headers: Mapping[str, str], name: str) -> str | None:
    for key, value in headers.items():
        if key.lower() == name:
            return value
    return None


def verify_webhook_signature(
    headers: Mapping[str, str],
    body: bytes,
    secret: str,
    *,
    tolerance_seconds: int,
    now: float,
) -> None:
    """Raise ``InvalidCallbackError`` unless the signature and timestamp are valid."""
    signature = _header(headers, SIGNATURE_HEADER)
    stamp = _header(headers, TIMESTAMP_HEADER)
    if not signature or not stamp or not stamp.isdigit():
        raise InvalidCallbackError()
    scheme, _, received = signature.partition("=")
    if scheme != "sha256" or len(received) != 64:
        raise InvalidCallbackError()
    if abs(now - int(stamp)) > tolerance_seconds:
        raise InvalidCallbackError()
    expected = hmac.new(
        secret.encode(), f"{stamp}.".encode() + body, hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected.encode(), received.lower().encode()):
        raise InvalidCallbackError()


# --- events -----------------------------------------------------------------------------


def _refuse_unless_ours(
    intent: Intent,
    *,
    order_id: object,
    transaction_id: str,
    currency: object,
) -> None:
    """The reference must name this intent and this WiPay transaction (the one the
    checkout was created with), and the currency must be the intent's."""
    if order_id != intent.id.hex:
        raise InvalidCallbackError()
    if not transaction_id or intent.provider_ref != transaction_id:
        raise InvalidCallbackError()
    if isinstance(currency, str) and currency and currency.upper() != intent.currency:
        raise InvalidCallbackError()


def return_event(
    intent: Intent, params: Mapping[str, str], *, api_key: str
) -> ProviderEvent:
    """The verified result of the customer's return to ``response_url``.

    A result other than ``success`` changes nothing (``IGNORED``). A success must
    name this intent and transaction and carry the matching hash, else it is refused
    (``InvalidCallbackError``). The credited amount is always the intent's own."""
    transaction_id = params.get("transaction_id") or ""
    if params.get("status") != "success":
        return ProviderEvent(
            provider=KEY, event_id=transaction_id, kind=EventKind.IGNORED
        )
    _refuse_unless_ours(
        intent,
        order_id=params.get("order_id"),
        transaction_id=transaction_id,
        currency=params.get("currency"),
    )
    if not hash_matches(
        params.get("hash"), transaction_id, intent.amount_minor, api_key
    ):
        raise InvalidCallbackError()
    return ProviderEvent(
        provider=KEY,
        event_id=transaction_id,
        kind=EventKind.PAYMENT_SUCCEEDED,
        intent_id=intent.id,
        provider_ref=transaction_id,
        amount_minor=intent.amount_minor,
        currency=intent.currency,
    )


def webhook_event(
    intent: Intent, envelope: Mapping[str, Any], *, api_key: str
) -> ProviderEvent:
    """Map a verified WiPay webhook envelope for ``intent``.

    ``payment.success`` credits only with a matching hash. ``payment.failed`` and
    ``payment.error`` mark the attempt failed. Everything else is acknowledged and
    ignored (refunds and chargebacks are not recorded here yet)."""
    envelope_id = str(envelope.get("id") or "")
    data = envelope.get("data")
    data = data if isinstance(data, dict) else {}
    transaction_id = str(data.get("transaction_id") or "")
    ignored = ProviderEvent(provider=KEY, event_id=envelope_id, kind=EventKind.IGNORED)
    name = envelope.get("event")

    if name == "payment.success":
        try:
            _refuse_unless_ours(
                intent,
                order_id=data.get("order_id"),
                transaction_id=transaction_id,
                currency=data.get("currency"),
            )
        except InvalidCallbackError:
            logger.warning(
                "WiPay success webhook names another payment",
                extra={"intent_id": str(intent.id)},
            )
            return ignored
        if not hash_matches(
            data.get("hash"), transaction_id, intent.amount_minor, api_key
        ):
            logger.error(
                "WiPay success webhook without a matching hash; not credited",
                extra={"intent_id": str(intent.id)},
            )
            return ignored
        return ProviderEvent(
            provider=KEY,
            event_id=transaction_id,
            kind=EventKind.PAYMENT_SUCCEEDED,
            intent_id=intent.id,
            provider_ref=transaction_id,
            amount_minor=intent.amount_minor,
            currency=intent.currency,
        )
    if name in {"payment.failed", "payment.error"}:
        try:
            _refuse_unless_ours(
                intent,
                order_id=data.get("order_id"),
                transaction_id=transaction_id,
                currency=None,
            )
        except InvalidCallbackError:
            return ignored
        return ProviderEvent(
            provider=KEY,
            event_id=envelope_id,
            kind=EventKind.PAYMENT_FAILED,
            intent_id=intent.id,
            provider_ref=transaction_id,
            failure_code=str(name),
        )
    return ignored


# --- the adapter --------------------------------------------------------------------------


@dataclass(frozen=True)
class Credentials:
    account_number: str
    api_key: str
    webhook_secret: str | None


class WiPayProvider:
    """One business's WiPay account in one environment. Built by ``load_provider``."""

    key = KEY

    def __init__(
        self,
        *,
        environment: str,
        account_number: str,
        api_key: str,
        webhook_secret: str | None,
        config: PaymentsConfig | None = None,
    ) -> None:
        self.environment = environment
        self._config = config or payments_settings
        self._credentials = Credentials(account_number, api_key, webhook_secret)

    def _new_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=base_url(self.environment, self._config.WIPAY_COUNTRY_CODE),
            timeout=self._config.REQUEST_TIMEOUT_SECONDS,
            transport=_transport,
        )

    async def create_payment(
        self,
        intent: Intent,
        /,
        *,
        title: str | None = None,  # noqa: ARG002  (WiPay has no line-item name)
    ) -> PaymentStart:
        response_url = self._config.WIPAY_RESPONSE_URL
        if not response_url:
            raise ProviderUnavailableError("WiPay return address is not configured")
        body = {
            "account_number": int(self._credentials.account_number),
            "country_code": self._config.WIPAY_COUNTRY_CODE,
            "currency": intent.currency,
            "environment": self.environment,
            "fee_structure": self._config.WIPAY_FEE_STRUCTURE,
            "method": self._config.WIPAY_METHOD,
            "order_id": intent.id.hex,
            "origin": self._config.WIPAY_ORIGIN,
            "response_url": response_url,
            "total": float(total_text(intent.amount_minor)),
        }
        answer = await self._post(body)
        transaction_id = answer.get("transaction_id")
        url = answer.get("url")
        if not isinstance(transaction_id, str) or not transaction_id:
            raise ProviderRequestError()
        if not isinstance(url, str) or not url:
            raise ProviderRequestError()
        return PaymentStart(provider_ref=transaction_id, checkout_url=url)

    async def _post(self, body: dict[str, Any]) -> dict[str, Any]:
        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        try:
            async with self._new_client() as client:
                response = await client.post(PAYMENTS_PATH, json=body, headers=headers)
        except httpx.HTTPError:
            logger.warning("WiPay request failed")
            raise ProviderRequestError() from None
        if response.status_code >= 400:
            logger.warning(
                "WiPay rejected a checkout request",
                extra={
                    "status_code": response.status_code,
                    "environment": self.environment,
                },
            )
            raise ProviderRequestError()
        try:
            answer = response.json()
        except ValueError:
            raise ProviderRequestError() from None
        if not isinstance(answer, dict):
            raise ProviderRequestError()
        return answer

    def verify_callback(
        self, _headers: Mapping[str, str], _body: bytes, /
    ) -> ProviderEvent:
        # WiPay callbacks need the business's secret: see ``verify_webhook``.
        raise InvalidCallbackError()

    async def refund(
        self, _intent: Intent, _amount_minor: int, _refund_id: uuid.UUID, /
    ) -> RefundResult:
        raise ManualRefundRequiredError()

    async def fetch_status(self, intent: Intent, /) -> ProviderStatus:
        # No status call is made: WiPay's Retrieve needs a WAPI credential (not built).
        return ProviderStatus(status=intent.status)

    async def list_refunds(
        self, _intent: Intent, /, *, stop: Any = None
    ) -> RefundListing:
        return RefundListing(refunds=(), complete=False)

    @asynccontextmanager
    async def batch(self) -> AsyncIterator[None]:
        yield


# --- per-business loading --------------------------------------------------------------


async def _merchant(
    session: AsyncSession, organisation_id: str
) -> MerchantAccount | None:
    rows = await session.scalars(
        select(MerchantAccount).where(
            MerchantAccount.organisation_id == organisation_id,
            MerchantAccount.provider == KEY,
        )
    )
    return rows.first()


def _credentials(account: MerchantAccount) -> Credentials:
    try:
        plain = secret_box.decrypt(
            account.credentials_encrypted,
            organisations_settings.ORG_SECRET_ENCRYPTION_KEYS,
        )
        data = json.loads(plain)
    except secret_box.SecretBoxError, ValueError:
        logger.error(
            "WiPay credentials cannot be read",
            extra={"organisation_id": account.organisation_id},
        )
        raise ProviderUnavailableError(
            "WiPay credentials cannot be read; the platform operator must check secret storage"
        ) from None
    account_number = data.get("account_number")
    api_key = data.get("api_key")
    if not isinstance(account_number, str) or not isinstance(api_key, str):
        logger.error(
            "WiPay credentials are incomplete",
            extra={"organisation_id": account.organisation_id},
        )
        raise ProviderUnavailableError("WiPay credentials are incomplete")
    webhook_secret = data.get("webhook_secret")
    return Credentials(
        account_number=account_number,
        api_key=api_key,
        webhook_secret=webhook_secret if isinstance(webhook_secret, str) else None,
    )


async def _has_connected_account(session: AsyncSession, organisation_id: str) -> bool:
    """A business with a Stripe connected account (Connect, New Zealand) takes its card
    payments there, so WiPay is not used for it (ADR-0027 amendment, 21 Nov 2026)."""
    return (
        await session.scalar(
            select(ConnectedAccount.id).where(
                ConnectedAccount.organisation_id == organisation_id
            )
        )
        is not None
    )


async def is_ready(session: AsyncSession, organisation_id: str) -> bool:
    """Can this business take WiPay payments now? Enabled, and live only when the owner
    has approved it. Readiness never reads the secret, so it cannot fail on storage."""
    if await _has_connected_account(session, organisation_id):
        return False
    account = await _merchant(session, organisation_id)
    if account is None or not account.enabled:
        return False
    if account.environment == MerchantEnvironment.LIVE.value:
        return account.live_approved_at is not None
    # The sandbox never takes a real customer's deposit in production.
    return not production()


def production() -> bool:
    """True in the production environment: the sandbox is then for the business's own
    test checkout only (``allow_sandbox_test``), never for a customer's deposit."""
    return settings.ENVIRONMENT == "production"


async def load_provider(
    session: AsyncSession, *, organisation_id: str, allow_sandbox_test: bool = False
) -> WiPayProvider:
    """The business's adapter for new checkouts. 503 when it is not ready. The sandbox
    is refused in production unless ``allow_sandbox_test`` (the test checkout)."""
    if await _has_connected_account(session, organisation_id):
        raise ProviderUnavailableError(
            "This business takes card payments through Stripe Connect"
        )
    account = await _merchant(session, organisation_id)
    if account is None or not account.enabled:
        raise ProviderUnavailableError("WiPay is not set up for this business")
    if (
        account.environment == MerchantEnvironment.LIVE.value
        and account.live_approved_at is None
    ):
        raise ProviderUnavailableError("Live WiPay payments are not approved yet")
    if production() and account.environment == MerchantEnvironment.SANDBOX.value:
        if not allow_sandbox_test:
            raise ProviderUnavailableError(
                "WiPay sandbox is not used for customer payments in production"
            )
    creds = _credentials(account)
    return WiPayProvider(
        environment=account.environment,
        account_number=creds.account_number,
        api_key=creds.api_key,
        webhook_secret=creds.webhook_secret,
    )


async def _intent_for_order(session: AsyncSession, order_id: object) -> Intent | None:
    if not isinstance(order_id, str):
        return None
    try:
        intent_id = uuid.UUID(hex=order_id)
    except ValueError:
        return None
    intent = await session.get(Intent, intent_id)
    return intent if intent is not None and intent.provider == KEY else None


async def verify_webhook(
    session: AsyncSession, *, headers: Mapping[str, str], body: bytes
) -> ProviderEvent:
    """Verify a WiPay webhook with the secret of the business that owns its order.

    The order is only used to choose the secret; the signature then decides. An
    order we do not know is acknowledged and ignored. A business with no webhook
    secret answers 503, so WiPay retries once it is configured.

    A body over ``MAX_WEBHOOK_BYTES`` is refused before anything is read. The signature
    needs the business's secret, which needs the order, so two cheap reads come first;
    nothing is written before the signature is checked."""
    if len(body) > MAX_WEBHOOK_BYTES:
        raise InvalidCallbackError()
    try:
        envelope = json.loads(body)
    except ValueError:
        raise InvalidCallbackError() from None
    if not isinstance(envelope, dict):
        raise InvalidCallbackError()
    data = envelope.get("data")
    data = data if isinstance(data, dict) else {}
    intent = await _intent_for_order(session, data.get("order_id"))
    if intent is None:
        logger.warning("WiPay webhook for an unknown order; acknowledged")
        return ProviderEvent(
            provider=KEY, event_id=str(envelope.get("id") or ""), kind=EventKind.IGNORED
        )
    account = await _merchant(session, intent.organisation_id)
    if account is None:
        raise ProviderUnavailableError("WiPay is not set up for this business")
    creds = _credentials(account)
    if not creds.webhook_secret:
        logger.error(
            "WiPay webhook secret is not configured",
            extra={"intent_id": str(intent.id)},
        )
        raise ProviderUnavailableError("WiPay webhooks are not configured")
    verify_webhook_signature(
        headers,
        body,
        creds.webhook_secret,
        tolerance_seconds=payments_settings.WEBHOOK_TOLERANCE_SECONDS,
        now=time.time(),
    )
    return webhook_event(intent, envelope, api_key=creds.api_key)


async def event_from_return(
    session: AsyncSession, *, intent: Intent, params: Mapping[str, str]
) -> ProviderEvent:
    """Verify the customer's return for ``intent`` with its business's API key. The
    return is still verified for a business that was disabled after the checkout."""
    account = await _merchant(session, intent.organisation_id)
    if account is None:
        raise ProviderUnavailableError("WiPay is not set up for this business")
    return return_event(intent, params, api_key=_credentials(account).api_key)


async def note_capture(session: AsyncSession, intent: Intent) -> None:
    """A verified sandbox payment is the business's test: record it once, so the owner
    can approve live mode. Live payments need no such record."""
    if (
        intent.provider != KEY
        or intent.provider_environment != MerchantEnvironment.SANDBOX.value
    ):
        return
    account = await _merchant(session, intent.organisation_id)
    # Only the sandbox account's own payments count as the test: a payment taken in the
    # sandbox while the account is now live proves nothing about the live account.
    if (
        account is not None
        and account.environment == MerchantEnvironment.SANDBOX.value
        and account.sandbox_verified_at is None
    ):
        account.sandbox_verified_at = utc_now()
        await session.flush()
