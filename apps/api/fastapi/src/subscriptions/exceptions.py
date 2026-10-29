from fastapi import status

from src.exceptions import AppException


class NewsletterRecipientNotConfirmedError(AppException):
    """A test send needs an address that has confirmed the newsletter."""

    def __init__(self) -> None:
        super().__init__(
            "That address has not confirmed the newsletter. Ask the reader to sign up "
            "and confirm first.",
            status.HTTP_409_CONFLICT,
        )
