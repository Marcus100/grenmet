"""Content-minimising Sentry policy shared by HTTP and CAP workers."""

import logging
import os
import re
from typing import Any

from sentry_sdk.integrations.logging import LoggingIntegration

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


# Sentry Logs (warnings and errors from Python logging). The log line on stdout is
# lost when its container is replaced, so a warning such as a failed readiness
# check is otherwise invisible after a deploy (#1241). Only the call's template
# is sent: values formatted into it can be personal data (ADR-0037), so text
# values become a placeholder and only numbers stay.
LOG_BODY_LIMIT = 500
_TEXT_PLACEHOLDER = "<text>"
_LOG_FORMAT_FIELD = re.compile(r"%(?:\([^)]*\))?[-#0 +]*\d*(?:\.\d+)?[sdifrxXeEgGc%]")
_EMAIL = re.compile(r"[^\s@<>\"']+@[^\s@<>\"']+\.[A-Za-z]{2,}")
# Seven or more digits, optionally grouped: phone numbers, account numbers.
_LONG_NUMBER = re.compile(r"\+?\d(?:[\s().-]*\d){6,}")
# Technical attributes the SDK adds about the code, host and runtime.
_SAFE_LOG_PREFIXES = (
    "code.",
    "logger.",
    "thread.",
    "process.",
    "server.",
    "os.",
    "sentry.environment",
    "sentry.release",
    "sentry.sdk.",
    "sentry.origin",
)
# Structured `extra=` fields that are technical or internal IDs (ADR-0037).
_SAFE_LOG_FIELDS = SAFE_TAGS | frozenset(
    {"organisation_id", "actor_id", "subject_id", "target_id", "error_type"}
)


def _redacted(text: str) -> str:
    text = _EMAIL.sub("<email>", text)
    return _LONG_NUMBER.sub("<number>", text)


def _log_field_allowed(key: str, value: object) -> bool:
    if key not in _SAFE_LOG_FIELDS or not isinstance(value, str):
        return False
    return key in {"area", "error_type"} or _OPAQUE_ID.fullmatch(value) is not None


def _rendered_template(template: str, attributes: dict[str, Any]) -> str:
    """The template with numbers filled in and every text value as a placeholder."""
    index = 0

    def value(match: re.Match[str]) -> str:
        nonlocal index
        field = match.group(0)
        if field == "%%":
            return "%"
        if field.startswith("%("):
            name = field[2 : field.index(")")]
        else:
            name = str(index)
            index += 1
        parameter = attributes.get(f"sentry.message.parameter.{name}")
        if isinstance(parameter, bool) or not isinstance(parameter, int | float):
            return _TEXT_PLACEHOLDER
        return str(parameter)

    return _LOG_FORMAT_FIELD.sub(value, template)


def scrub_sentry_log(log: dict[str, Any], _hint: dict[str, Any]) -> dict[str, Any]:
    """Keep where and how severe; never the values a log call formatted in."""
    attributes = log.get("attributes")
    attributes = attributes if isinstance(attributes, dict) else {}
    template = attributes.get("sentry.message.template")
    body = (
        _rendered_template(template, attributes)
        if isinstance(template, str)
        else str(log.get("body") or "")
    )
    log["body"] = _redacted(body)[:LOG_BODY_LIMIT]
    log["attributes"] = {
        key: value
        for key, value in attributes.items()
        if (
            key.startswith(_SAFE_LOG_PREFIXES) and not key.startswith("sentry.message.")
        )
        or _log_field_allowed(key, value)
    }
    return log


def _logs_enabled() -> bool:
    return os.environ.get("SENTRY_LOGS_ENABLED", "true").lower() not in {
        "0",
        "false",
        "no",
    }


def sentry_options() -> dict[str, Any]:
    return {
        "send_default_pii": False,
        "include_local_variables": False,
        "max_request_body_size": "never",
        "traces_sample_rate": 0.0,
        "before_send": scrub_sentry_event,
        "before_send_transaction": lambda _event, _hint: None,
        "release": os.environ.get("SENTRY_RELEASE"),
        "enable_logs": _logs_enabled(),
        "before_send_log": scrub_sentry_log,
        # Warnings and errors become Sentry Logs; errors still become issues.
        "integrations": [LoggingIntegration(sentry_logs_level=logging.WARNING)],
    }
