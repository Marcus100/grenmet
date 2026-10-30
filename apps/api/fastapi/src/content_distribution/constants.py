"""Vocabulary for content distribution: platforms, statuses and the warning rules."""

from typing import Final

PLATFORM_FACEBOOK: Final = "facebook"
PLATFORM_INSTAGRAM: Final = "instagram"
PLATFORM_WHATSAPP: Final = "whatsapp"
PLATFORMS: Final = (PLATFORM_FACEBOOK, PLATFORM_INSTAGRAM, PLATFORM_WHATSAPP)
# Platforms the worker posts to. WhatsApp Channels are not automated: the editor
# copies the stored caption by hand (see AGENTS.md).
AUTOMATED_PLATFORMS: Final = (PLATFORM_FACEBOOK, PLATFORM_INSTAGRAM)
# Instagram only accepts posts with an image.
IMAGE_REQUIRED_PLATFORMS: Final = (PLATFORM_INSTAGRAM,)

# Stored statuses. "failed" is never stored: it is shown while the outbox retries
# a scheduled row (see service.display_status).
STATUS_PENDING: Final = "pending"
STATUS_SCHEDULED: Final = "scheduled"
STATUS_DRY_RUN_SENT: Final = "dry_run_sent"
STATUS_FAILED: Final = "failed"
STATUS_DEAD: Final = "dead"
STORED_STATUSES: Final = (
    STATUS_PENDING,
    STATUS_SCHEDULED,
    STATUS_DRY_RUN_SENT,
    STATUS_DEAD,
)

# Official warnings never go out through social media (the site, CAP and approved
# channels stay primary). A post from one of these collections, or whose link is a
# warning page, is refused with 422.
WARNING_COLLECTIONS: Final = frozenset({"cap", "cap-warnings", "warnings", "alerts"})
WARNING_PATH_PREFIXES: Final = ("/alerts", "/warnings", "/cap")

TOPIC_PREFIX: Final = "social.post."
