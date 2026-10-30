from fastapi import status

from src.exceptions import AppException


class SubscriptionLinkInvalidError(AppException):
    """A preferences token is missing, forged, of another purpose or unknown.

    One message for all of them, so the reply never shows whether an address exists."""

    def __init__(self) -> None:
        super().__init__(
            "This link is not valid. It may have expired or already been used.",
            status.HTTP_400_BAD_REQUEST,
        )


class NewsletterRecipientNotConfirmedError(AppException):
    """A test send needs an address that has confirmed the newsletter."""

    def __init__(self) -> None:
        super().__init__(
            "That address has not confirmed the newsletter. Ask the reader to sign up "
            "and confirm first.",
            status.HTTP_409_CONFLICT,
        )
