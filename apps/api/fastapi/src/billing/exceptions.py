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
