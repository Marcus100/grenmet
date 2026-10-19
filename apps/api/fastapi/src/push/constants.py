# Lists that can receive browser push. Keys match subscriptions MAILING_LISTS.
PUSH_LIST_KEYS = frozenset({"gms-alerts"})

# Hosts of the browser push services. The worker POSTs to a subscriber-supplied
# endpoint, so only these are accepted (prevents server-side request forgery).
# A host matches when it equals a suffix or ends with ".<suffix>".
ALLOWED_ENDPOINT_SUFFIXES = (
    "fcm.googleapis.com",
    "android.googleapis.com",
    "push.services.mozilla.com",
    "push.apple.com",
    "notify.windows.com",
)
