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
# a scheduled row (see service.display_status). "dead" is a failure for good; its
# error column says why.
STATUS_PENDING: Final = "pending"
STATUS_SCHEDULED: Final = "scheduled"
STATUS_DRY_RUN_SENT: Final = "dry_run_sent"
STATUS_POSTED: Final = "posted"
STATUS_SKIPPED: Final = "skipped"
STATUS_FAILED: Final = "failed"
STATUS_DEAD: Final = "dead"
STORED_STATUSES: Final = (
    STATUS_PENDING,
    STATUS_SCHEDULED,
    STATUS_DRY_RUN_SENT,
    STATUS_POSTED,
    STATUS_SKIPPED,
    STATUS_DEAD,
)

# The one switch for live posting: a feature flag (src/feature_flags), off unless
# a row with this key exists, is enabled and its audience includes the environment.
SOCIAL_LIVE_FLAG: Final = "social-live-posting"

# Staff-facing reasons, stored in the reason column.
REASON_FLAG_OFF: Final = "Live posting is switched off (feature flag social-live-posting). Recorded as a dry run."
REASON_NOT_CONFIGURED: Final = (
    "Live posting is switched on but the Meta page settings or token are missing. "
    "Recorded as a dry run."
)
REASON_TOKEN_MALFORMED: Final = (
    "Live posting is switched on but the Meta page access token does not look like a "
    "token (it must be one unbroken value). The token is not shown here. Recorded as "
    "a dry run."
)
REASON_NO_IMAGE: Final = (
    "Instagram posts need an image. This post has none, so it was skipped."
)
# Shown for a publish call that may have reached Meta without an answer (including a
# server error on the publish call itself).
ERROR_OUTCOME_UNKNOWN: Final = (
    "Outcome unknown: the request to Meta may have published the post. It was not "
    "sent again. Check the Facebook page or Instagram account before posting by hand."
)

# Official warnings never go out through social media (the site, CAP and approved
# channels stay primary). A post from one of these collections, or whose link is a
# warning page, is refused with 422.
WARNING_COLLECTIONS: Final = frozenset({"cap", "cap-warnings", "warnings", "alerts"})
WARNING_PATH_PREFIXES: Final = ("/alerts", "/warnings", "/cap")

TOPIC_PREFIX: Final = "social.post."
