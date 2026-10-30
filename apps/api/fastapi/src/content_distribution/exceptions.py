from fastapi import status

from src.exceptions import AppException


class ContentDistributionNotConfigured(AppException):
    def __init__(self) -> None:
        super().__init__(
            "Content distribution is not configured",
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )


class CmsSecretInvalid(AppException):
    def __init__(self) -> None:
        super().__init__("Invalid CMS credentials", status.HTTP_401_UNAUTHORIZED)


class SocialWarningNotAllowed(AppException):
    def __init__(self) -> None:
        super().__init__(
            "Official warnings are never sent through social media. Remove the "
            "warning collection or warning link; warnings stay on the site and "
            "in CAP.",
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        )


class SocialImageRequired(AppException):
    def __init__(self, platform: str) -> None:
        super().__init__(
            f"{platform} posts need an image URL (imageUrl)",
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        )


class SocialCaptionMissing(AppException):
    def __init__(self, platform: str) -> None:
        super().__init__(
            f"Add a caption for {platform}",
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        )
