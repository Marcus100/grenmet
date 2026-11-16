"""Printix errors. Every refusal is a typed ``AppException`` (ADR-0060)."""

from src.exceptions import AppException, AuthenticationError, AuthorizationError

from . import constants


class PrintixNotFound(AppException):
    def __init__(self, message: str = "Printix record not found") -> None:
        super().__init__(message, 404)


class PrintixConflict(AppException):
    def __init__(self, message: str) -> None:
        super().__init__(message, 409)


class PrintixOfflineUnavailable(AppException):
    """Offline mode is refused: this event's barcodes are its printed numbers."""

    def __init__(self) -> None:
        super().__init__(
            "Offline scanning is not available for this event, because some of its "
            "barcodes are its printed numbers or shorter than twelve characters. Use "
            "the live scanner.",
            409,
        )
        #: Clients match on this code, not on the wording of the message.
        self.extra["code"] = constants.OFFLINE_UNAVAILABLE_CODE


class PrintixImportTooLarge(AppException):
    def __init__(self) -> None:
        super().__init__(
            f"The ticket file is larger than {constants.MAX_IMPORT_BYTES} bytes", 413
        )


class PrintixPairingUnknown(AuthenticationError):
    """The secret matches no pairing. Says nothing about which field was wrong."""

    def __init__(self) -> None:
        super().__init__("This pairing is not recognised. Ask for a new pairing code.")


class PrintixPairingRevoked(AuthorizationError):
    def __init__(self) -> None:
        super().__init__("This pairing has been revoked. Ask for a new pairing code.")


class PrintixPairingExpired(AuthorizationError):
    def __init__(self) -> None:
        super().__init__("This pairing has expired. Ask for a new pairing code.")


class PrintixRateLimited(AppException):
    def __init__(self) -> None:
        super().__init__(
            "Too many scans from this pairing. Wait a minute and try again.",
            429,
            headers={"Retry-After": str(constants.SCAN_WINDOW_SECONDS)},
        )
