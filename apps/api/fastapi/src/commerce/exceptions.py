"""Typed errors for the commerce domain (ADR-0063)."""

from fastapi import status

from src.exceptions import AppException


class ProductNotFoundError(AppException):
    """Also raised for another organisation's product, so ids are not leaked."""

    def __init__(self) -> None:
        super().__init__("Product not found", status.HTTP_404_NOT_FOUND)


class ProductNameTakenError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "This organisation already has a product with that name",
            status.HTTP_409_CONFLICT,
        )


class PriceEffectiveFromTakenError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "This product already has a price starting at that time",
            status.HTTP_409_CONFLICT,
        )
