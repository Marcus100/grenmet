from fastapi import status

from src.exceptions import AppException


class BillingNotConfiguredError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "Billing is not configured",
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )


class BillingProviderError(AppException):
    def __init__(self, message: str = "Billing provider request failed") -> None:
        super().__init__(message, status.HTTP_502_BAD_GATEWAY)


class InvalidStripeWebhookError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "Invalid Stripe webhook signature",
            status.HTTP_400_BAD_REQUEST,
        )


class CustomerNotFoundError(AppException):
    def __init__(self) -> None:
        super().__init__("Customer not found", status.HTTP_404_NOT_FOUND)


class InvoiceNotFoundError(AppException):
    def __init__(self) -> None:
        super().__init__("Invoice not found", status.HTTP_404_NOT_FOUND)


class InvoiceStateError(AppException):
    """The invoice is not in a status that allows the requested action."""

    def __init__(self, message: str) -> None:
        super().__init__(message, status.HTTP_409_CONFLICT)


class PaymentExceedsBalanceError(AppException):
    def __init__(self, outstanding_minor: int) -> None:
        super().__init__(
            f"Payment exceeds the outstanding balance of {outstanding_minor} minor units",
            status.HTTP_422_UNPROCESSABLE_CONTENT,
        )


class BillingLiveModeRefusedError(AppException):
    """A live Stripe key is configured; app subscriptions run in test mode only (ADR-0027)."""

    def __init__(self, message: str = "Only Stripe test mode is permitted") -> None:
        super().__init__(message, status.HTTP_503_SERVICE_UNAVAILABLE)


class AppSubscriptionPlanNotFoundError(AppException):
    def __init__(self) -> None:
        super().__init__("Plan not found", status.HTTP_404_NOT_FOUND)


class AppSubscriptionPriceNotFoundError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "This plan has no price in that currency",
            status.HTTP_422_UNPROCESSABLE_CONTENT,
        )


class AppSubscriptionPriceNotConfiguredError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "The Stripe price for this plan is not configured",
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )


class AppSubscriptionAlreadyExistsError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "This organisation already has a live subscription to this app",
            status.HTTP_409_CONFLICT,
        )


class AppSubscriptionStateError(AppException):
    """A subscription status move the transition table does not allow."""

    def __init__(self, message: str) -> None:
        super().__init__(message, status.HTTP_409_CONFLICT)


class AppSubscriptionNotYetWrittenError(AppException):
    """A Stripe event names a subscription row this database does not have yet. The
    event id is not recorded, and a non-2xx answer makes Stripe send it again (issue
    #1723)."""

    def __init__(self) -> None:
        super().__init__(
            "The subscription for this Stripe event is not available yet",
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )
