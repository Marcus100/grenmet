from fastapi import status

from src.exceptions import AppException


class FeatureFlagNotFoundError(AppException):
    def __init__(self) -> None:
        super().__init__("Feature flag not found", status.HTTP_404_NOT_FOUND)


class FeatureFlagKeyTakenError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "A feature flag with this key exists", status.HTTP_409_CONFLICT
        )


class SuccessMetricRequiredError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "A success metric is required to enable a flag outside local",
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        )


class FeatureOffError(AppException):
    """Raised by ``require_flag``; indistinguishable from a missing route."""

    def __init__(self) -> None:
        super().__init__("Not found", status.HTTP_404_NOT_FOUND)
