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
}

# Mailing list that receives published CAP alerts (email and web push).
CAP_ALERTS_LIST_KEY = "gms-alerts"

CONFIRM_PURPOSE = "subscription-confirm"
UNSUBSCRIBE_PURPOSE = "subscription-unsubscribe"
CONFIRMATION_TEMPLATE = "subscription-confirm"
