from fastapi import status

from src.exceptions import AppException


class IntentNotFoundError(AppException):
    def __init__(self) -> None:
        super().__init__("Payment not found", status.HTTP_404_NOT_FOUND)


class PaymentsConflictError(AppException):
    def __init__(self, message: str) -> None:
        super().__init__(message, status.HTTP_409_CONFLICT)


class RefundFailedAtProvider(PaymentsConflictError):
    """The refund under this id failed at the provider. A retry under the same id
    cannot succeed: the provider replays its answer for the idempotency key."""


class ManualRefundRequiredError(PaymentsConflictError):
    """The provider has no refund API (WiPay): the refund is made in the provider's
    dashboard and is not recorded here. Nothing is written (409)."""

    def __init__(self) -> None:
        super().__init__(
            "WiPay has no refund API. Refund this payment in the WiPay dashboard; "
            "the refund is not recorded here."
        )


class PaymentsValidationError(AppException):
    def __init__(self, message: str) -> None:
        super().__init__(message, status.HTTP_422_UNPROCESSABLE_CONTENT)


class ProviderUnavailableError(AppException):
    """The provider is not configured, or is configured unsafely (503)."""

    def __init__(self, message: str = "Payment provider is unavailable") -> None:
        super().__init__(message, status.HTTP_503_SERVICE_UNAVAILABLE)


class ProviderRequestError(AppException):
    """The provider refused or failed a request (502). Never carries card data."""

    def __init__(self, message: str = "Payment provider request failed") -> None:
        super().__init__(message, status.HTTP_502_BAD_GATEWAY)


class UnknownProviderError(AppException):
    def __init__(self) -> None:
        super().__init__("Unknown payment provider", status.HTTP_404_NOT_FOUND)


class InvalidCallbackError(AppException):
    """Signature missing, wrong or stale, or an unreadable body (400)."""

    def __init__(self) -> None:
        super().__init__("Invalid callback", status.HTTP_400_BAD_REQUEST)


class ConnectAccountNotFoundError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "This organisation has no Stripe account yet", status.HTTP_404_NOT_FOUND
        )
