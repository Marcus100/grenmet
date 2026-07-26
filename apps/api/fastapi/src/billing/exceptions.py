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
