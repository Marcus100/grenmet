from dataclasses import dataclass


@dataclass(frozen=True)
class MailingList:
    key: str
    name: str


# A product reuses this domain by adding its list here and its origin to
# SUBSCRIPTIONS_SITE_URLS.
MAILING_LISTS: dict[str, MailingList] = {
    "signal": MailingList(key="signal", name="Grenada Signal"),
}

CONFIRM_PURPOSE = "subscription-confirm"
UNSUBSCRIBE_PURPOSE = "subscription-unsubscribe"
CONFIRMATION_TEMPLATE = "subscription-confirm"
