"""Content-minimising Sentry policy shared by HTTP and CAP workers."""

import os
import re
from typing import Any

# Tags without customer content or identity; must match the web scrubber in
# packages/ui/src/lib/sentry-privacy.ts. `request_id` is a random per-request
# token (src/request_context.py) that links an event to its log lines.
# `user_id` and `org_id` are opaque internal database IDs, allowed by ADR-0037;
# never names, emails or phone numbers.
SAFE_TAGS = frozenset({"area", "digest", "org_id", "request_id", "user_id"})

# `user_id` must look like a UUID or short token, so an email put there is dropped.
_OPAQUE_ID = re.compile(r"[A-Za-z0-9_-]{1,64}")


def _tag_allowed(key: str, value: object) -> bool:
    if key not in SAFE_TAGS or not isinstance(value, str):
        return False
    return key != "user_id" or _OPAQUE_ID.fullmatch(value) is not None


def scrub_sentry_event(event: dict[str, Any], _hint: dict[str, Any]) -> dict[str, Any]:
    """Retain error types/stacks, never request payloads, locals or draft content."""
    had_logentry = bool(event.get("logentry"))
    tags = event.get("tags")
    safe_tags = (
        {k: v for k, v in tags.items() if _tag_allowed(k, v)}
        if isinstance(tags, dict)
        else {}
    )
    for key in (
        "user",
        "request",
        "extra",
        "breadcrumbs",
        "contexts",
        "tags",
        "logentry",
        "transaction",
    ):
        event.pop(key, None)
    if safe_tags:
        event["tags"] = safe_tags
    if event.get("message"):
        event["message"] = "[redacted]"
    elif had_logentry:
        event["message"] = "Log event (details redacted)"
    for exception in event.get("exception", {}).get("values", []):
        if exception.get("value"):
            exception["value"] = "[redacted]"
        for frame in exception.get("stacktrace", {}).get("frames", []):
            frame.pop("vars", None)
    return event


def sentry_options() -> dict[str, Any]:
    return {
        "send_default_pii": False,
        "include_local_variables": False,
        "max_request_body_size": "never",
        "traces_sample_rate": 0.0,
        "before_send": scrub_sentry_event,
        "before_send_transaction": lambda _event, _hint: None,
        "release": os.environ.get("SENTRY_RELEASE"),
    }
