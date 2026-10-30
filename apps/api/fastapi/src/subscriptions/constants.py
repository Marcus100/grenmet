from dataclasses import dataclass


@dataclass(frozen=True)
class MailingList:
    key: str
    name: str


# A product reuses this domain by adding its list here and its origin to
# SUBSCRIPTIONS_SITE_URLS.
MAILING_LISTS: dict[str, MailingList] = {
    "signal": MailingList(key="signal", name="Grenada Signal"),
    "barrels": MailingList(key="barrels", name="Barrels Grenada"),
    # Fan-out target for published CAP alerts (src/worker/cap_email.py).
    "gms-alerts": MailingList(key="gms-alerts", name="GMS weather alerts"),
    # Daily climate digest (src/worker/newsletter_digest.py, 07:30 Grenada time).
    "gms-newsletter": MailingList(key="gms-newsletter", name="GMS climate newsletter"),
}

# Mailing list that receives published CAP alerts (email and web push).
CAP_ALERTS_LIST_KEY = "gms-alerts"

CONFIRM_PURPOSE = "subscription-confirm"
UNSUBSCRIBE_PURPOSE = "subscription-unsubscribe"
CONFIRMATION_TEMPLATE = "subscription-confirm"

# The daily digest (src/subscriptions/newsletter.py) and its list.
NEWSLETTER_LIST_KEY = "gms-newsletter"
NEWSLETTER_TEMPLATE = "newsletter"
# Feature flag (src/feature_flags): alert-first, shorter digests during hurricane season.
HURRICANE_MODE_FLAG = "newsletter-hurricane-mode"
# Preferences page of the newsletter's site, linked from every digest (ADR-0052).
NEWSLETTER_PREFERENCES_PATH = "/climate/newsletter/preferences"
# Staff permission for the test send (src/auth/permissions.py).
NEWSLETTER_TEST_PERMISSION = "newsletter.send_test"
