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


_URL_TEXT = re.compile(r"\b[a-z][a-z0-9+.-]*://\S+", re.IGNORECASE)
# Long tokens with at least one digit (IDs, keys); long code words have none.
_TOKEN_TEXT = re.compile(r"\b(?=[A-Za-z_-]*\d)[A-Za-z0-9_-]{20,}\b")
_QUOTED_TEXT = re.compile(r"([\"'`])([^\"'`]*)\1")
_IDENTIFIER = re.compile(r"[A-Za-z_][\w.]{0,40}")
SAFE_TEXT_LIMIT = 200


def safe_error_text(text: str) -> str:
    """Our own error message with anything that could be customer content masked.

    Links, emails, long numbers, tokens and quoted text other than a code name
    become placeholders. Mirrors ``safeErrorText`` in
    packages/ui/src/lib/sentry-privacy.ts.
    """
    text = _URL_TEXT.sub("<url>", text)
    text = _EMAIL.sub("<email>", text)
    text = _TOKEN_TEXT.sub("<id>", text)
    text = _LONG_NUMBER.sub("<number>", text)
    text = _QUOTED_TEXT.sub(
        lambda m: (
            m.group(0)
            if _IDENTIFIER.fullmatch(m.group(2))
            else f"{m.group(1)}<text>{m.group(1)}"
        ),
        text,
    )
    return text[:SAFE_TEXT_LIMIT]


def _own_error(hint: dict[str, Any]) -> bool:
    """True when the event's exception is one of ours (an ``AppException``).

    Our messages are fixed sentences written in this code base, so they are kept
    after masking; any other exception's text may carry request data.
    """
    from src.exceptions import AppException

    exc_info = hint.get("exc_info") if isinstance(hint, dict) else None
    if not isinstance(exc_info, tuple) or len(exc_info) < 2:
        return False
    return isinstance(exc_info[1], AppException)


def scrub_sentry_event(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any]:
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
    values = event.get("exception", {}).get("values", [])
    own = _own_error(hint)
    for index, exception in enumerate(values):
        if exception.get("value"):
            # Sentry lists chained exceptions oldest first; the raised one is last.
            keep = own and index == len(values) - 1
            exception["value"] = (
                safe_error_text(exception["value"]) if keep else "[redacted]"
            )
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


# `area` and `error_type` are code names (a module area, an exception class).
_CODE_NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_.]{0,63}")


def _log_field_allowed(key: str, value: object) -> bool:
    if key not in _SAFE_LOG_FIELDS or not isinstance(value, str):
        return False
    pattern = _CODE_NAME if key in {"area", "error_type"} else _OPAQUE_ID
    return pattern.fullmatch(value) is not None


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
