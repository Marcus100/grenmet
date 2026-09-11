"""Content-minimising Sentry policy shared by HTTP and CAP workers."""

from typing import Any


def scrub_sentry_event(event: dict[str, Any], _hint: dict[str, Any]) -> dict[str, Any]:
    """Retain error types/stacks, never request payloads, locals or draft content."""
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
    if event.get("message"):
        event["message"] = "[redacted]"
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
    }
