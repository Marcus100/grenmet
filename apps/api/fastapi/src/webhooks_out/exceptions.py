from fastapi import status

from src.exceptions import AppException


class WebhookEndpointNotFoundError(AppException):
    """Also raised for another organisation's endpoint id."""

    def __init__(self) -> None:
        super().__init__("Webhook endpoint not found", status.HTTP_404_NOT_FOUND)


class WebhookUrlRejectedError(AppException):
    def __init__(self, reason: str) -> None:
        super().__init__(
            f"Webhook URL rejected: {reason}", status.HTTP_422_UNPROCESSABLE_CONTENT
        )


class WebhookEventTypeInvalidError(AppException):
    def __init__(self, reason: str) -> None:
        super().__init__(reason, status.HTTP_422_UNPROCESSABLE_CONTENT)


class WebhookEndpointLimitError(AppException):
    def __init__(self, limit: int) -> None:
        super().__init__(
            f"An organisation can have at most {limit} webhook endpoints",
            status.HTTP_409_CONFLICT,
        )


class WebhookSecretStorageUnavailableError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "Secret storage is not configured; contact the platform operator",
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )


class WebhookDeliveryError(Exception):
    """A delivery attempt failed; raised inside the outbox handler so the outbox
    backs off and retries. Carries no response body or payload."""
