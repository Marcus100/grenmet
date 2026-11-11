"""Sentry Logs carry where and how severe, never the values a log call formatted in."""

import json
import logging

from sentry_sdk.integrations.logging import LoggingIntegration

from src.telemetry import LOG_BODY_LIMIT, scrub_sentry_log, sentry_options


def _log(body: str, **attributes: object) -> dict[str, object]:
    return {
        "severity_text": "warn",
        "severity_number": 13,
        "body": body,
        "attributes": {
            "logger.name": "src.utils.router",
            "code.file.path": "src/utils/router.py",
            "code.line.number": 104,
            "sentry.environment": "staging",
            "sentry.origin": "auto.log.stdlib",
            **attributes,
        },
        "time_unix_nano": 1,
        "trace_id": None,
    }


def test_template_replaces_the_formatted_body_and_text_values_are_dropped():
    log = _log(
        "Invite for pat@example.com failed after 3 tries",
        **{
            "sentry.message.template": "Invite for %s failed after %d tries",
            "sentry.message.parameter.0": "pat@example.com",
            "sentry.message.parameter.1": 3,
        },
    )
    result = scrub_sentry_log(log, {})
    assert result["body"] == "Invite for <text> failed after 3 tries"
    assert "pat@example.com" not in json.dumps(result)
    assert not any(key.startswith("sentry.message.") for key in result["attributes"])


def test_named_parameters_and_literal_percent_signs():
    log = _log(
        "x",
        **{
            "sentry.message.template": "%(name)s at %(pct)d%% load",
            "sentry.message.parameter.name": "Pat Observer",
            "sentry.message.parameter.pct": 93,
        },
    )
    assert scrub_sentry_log(log, {})["body"] == "<text> at 93% load"


def test_booleans_are_text_not_numbers():
    log = _log(
        "x",
        **{
            "sentry.message.template": "enabled=%s",
            "sentry.message.parameter.0": True,
        },
    )
    assert scrub_sentry_log(log, {})["body"] == "enabled=<text>"


def test_untemplated_bodies_lose_emails_and_long_numbers():
    result = scrub_sentry_log(
        _log("Call +1 (473) 444-4142 or mail duty@gms.gd about 2 alerts"), {}
    )
    assert result["body"] == "Call <number> or mail <email> about 2 alerts"


def test_long_bodies_are_capped():
    result = scrub_sentry_log(_log("a" * (LOG_BODY_LIMIT + 50)), {})
    assert len(result["body"]) == LOG_BODY_LIMIT


def test_only_technical_attributes_and_internal_ids_are_kept():
    result = scrub_sentry_log(
        _log(
            "User created",
            email="pat@example.com",
            user_id="0b9f0c1e-1d2f-4a5b-8c6d-7e8f9a0b1c2d",
            request_id="req_123",
            actor_id="not an id with spaces",
            error_type="OperationalError",
            number="INV-2026-0042",
        ),
        {},
    )
    attributes = result["attributes"]
    assert attributes["user_id"] == "0b9f0c1e-1d2f-4a5b-8c6d-7e8f9a0b1c2d"
    assert attributes["request_id"] == "req_123"
    assert attributes["error_type"] == "OperationalError"
    assert attributes["logger.name"] == "src.utils.router"
    assert attributes["code.line.number"] == 104
    for dropped in ("email", "actor_id", "number"):
        assert dropped not in attributes


def test_code_name_fields_must_look_like_code_names():
    result = scrub_sentry_log(
        _log("x", area="hr.leave", error_type="Booking for Jane Doe"), {}
    )
    assert result["attributes"]["area"] == "hr.leave"
    assert "error_type" not in result["attributes"]


def test_api_and_worker_send_warnings_and_errors_as_logs(monkeypatch):
    monkeypatch.delenv("SENTRY_LOGS_ENABLED", raising=False)
    options = sentry_options()
    assert options["enable_logs"] is True
    assert options["before_send_log"] is scrub_sentry_log
    [integration] = options["integrations"]
    assert isinstance(integration, LoggingIntegration)
    assert integration._sentry_logs_handler.level == logging.WARNING


def test_logs_can_be_switched_off(monkeypatch):
    monkeypatch.setenv("SENTRY_LOGS_ENABLED", "false")
    assert sentry_options()["enable_logs"] is False


def test_a_real_warning_reaches_the_transport_scrubbed_and_info_does_not():
    """End to end through the SDK: level threshold, hook and envelope."""
    import sentry_sdk
    from sentry_sdk.transport import Transport

    sent: list[dict[str, object]] = []

    class Capture(Transport):
        def capture_envelope(self, envelope):  # type: ignore[no-untyped-def]
            for item in envelope.items:
                if item.type == "log":
                    sent.extend(item.payload.json["items"])

    sentry_sdk.init(
        dsn="https://key@o0.ingest.sentry.io/0",
        transport=Capture,
        **sentry_options(),
    )
    try:
        logger = logging.getLogger("tests.sentry_logs")
        logger.setLevel(logging.INFO)
        logger.info("Routine note for %s", "pat@example.com")
        logger.warning("Invite for %s failed after %d tries", "pat@example.com", 3)
        sentry_sdk.flush()
    finally:
        sentry_sdk.init()  # back to a client without a DSN
    bodies = [item["body"] for item in sent]
    assert bodies == ["Invite for <text> failed after 3 tries"]
    assert "pat@example.com" not in json.dumps(sent)
