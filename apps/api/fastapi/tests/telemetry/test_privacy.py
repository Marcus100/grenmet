import json
import unittest

from src.telemetry import safe_error_text, scrub_sentry_event, sentry_options


class PrivacyTests(unittest.TestCase):
    def test_removes_sensitive_content_and_frame_locals(self):
        event = {
            "request": {"data": "private"},
            "user": {"email": "private"},
            "breadcrumbs": [{"message": "private"}],
            "extra": {"draft": "private"},
            "exception": {
                "values": [
                    {
                        "type": "ValueError",
                        "value": "private",
                        "stacktrace": {
                            "frames": [{"lineno": 42, "vars": {"token": "private"}}]
                        },
                    }
                ]
            },
        }
        result = scrub_sentry_event(event, {})
        self.assertNotIn("private", json.dumps(result))
        self.assertEqual(result["exception"]["values"][0]["type"], "ValueError")
        self.assertEqual(
            result["exception"]["values"][0]["stacktrace"]["frames"][0]["lineno"], 42
        )

    def test_api_and_worker_policy_disables_payload_and_local_capture(self):
        options = sentry_options()
        self.assertFalse(options["send_default_pii"])
        self.assertFalse(options["include_local_variables"])
        self.assertEqual(options["max_request_body_size"], "never")
        self.assertEqual(options["traces_sample_rate"], 0)

    def test_log_only_events_keep_a_safe_title(self):
        event = {
            "logger": "httpx",
            "logentry": {"formatted": "secret payload"},
        }
        result = scrub_sentry_event(event, {})
        self.assertEqual(result["message"], "Log event (details redacted)")
        self.assertNotIn("secret payload", json.dumps(result))
        self.assertEqual(result["logger"], "httpx")

    def test_keeps_only_safe_tags(self):
        result = scrub_sentry_event(
            {"tags": {"area": "cap", "digest": "d1", "email": "private"}}, {}
        )
        self.assertEqual(result["tags"], {"area": "cap", "digest": "d1"})
        self.assertNotIn("tags", scrub_sentry_event({"tags": {"email": "x"}}, {}))

    def test_keeps_internal_user_and_org_ids_but_drops_personal_fields(self):
        result = scrub_sentry_event(
            {
                "user": {"id": "u1", "email": "private", "username": "private"},
                "tags": {"user_id": "u1", "org_id": "o1", "email": "private"},
            },
            {},
        )
        self.assertEqual(result["tags"], {"user_id": "u1", "org_id": "o1"})
        self.assertNotIn("user", result)
        self.assertNotIn("private", json.dumps(result))

    def test_rejects_non_opaque_user_id_tag(self):
        for bad in ("a@example.test", "Private Person", "x" * 65, ""):
            result = scrub_sentry_event({"tags": {"user_id": bad, "org_id": "o1"}}, {})
            self.assertEqual(result["tags"], {"org_id": "o1"})
        uuid_like = "11111111-2222-3333-4444-555555555555"
        result = scrub_sentry_event({"tags": {"user_id": uuid_like}}, {})
        self.assertEqual(result["tags"], {"user_id": uuid_like})

    def test_error_events_are_never_dropped_by_scrubber(self):
        """before_send is the only API drop point and must always return the event."""
        for event in (
            {"exception": {"values": [{"type": "RuntimeError", "value": "x"}]}},
            {"message": "x"},
            {"logentry": {"message": "x"}},
            {},
        ):
            self.assertIsNotNone(scrub_sentry_event(event, {}))

    def test_transactions_are_intentionally_dropped(self):
        before_send_transaction = sentry_options()["before_send_transaction"]
        self.assertIsNone(before_send_transaction({"type": "transaction"}, {}))


class SafeErrorTextTests(unittest.TestCase):
    def _event(self, value: str) -> dict:
        return {"exception": {"values": [{"type": "X", "value": value}]}}

    def test_keeps_a_masked_message_for_fixed_message_errors(self):
        from src.exceptions import AppException

        class FixedError(AppException):
            def __init__(self) -> None:
                super().__init__(
                    "Feed at https://x.test/a?t=1 for jane@example.test +1 473 555 0100 "
                    "token a1b2c3d4e5f6a7b8c9d0e1f2 is not 'ready' ('Jane Doe')",
                    503,
                )

        error = FixedError()
        result = scrub_sentry_event(
            self._event(error.message), {"exc_info": (FixedError, error, None)}
        )
        self.assertEqual(
            result["exception"]["values"][0]["value"],
            "Feed at <url> for <email> <number> token <id> is not 'ready' ('<text>')",
        )

    def test_formatted_app_errors_stay_redacted(self):
        from src.bookings.exceptions import BookingValidationError
        from src.exceptions import AppException

        for error in (
            AppException("Jane Doe is unavailable", 503),
            BookingValidationError("Jane Doe does not offer Lashes"),
        ):
            result = scrub_sentry_event(
                self._event(error.message), {"exc_info": (type(error), error, None)}
            )
            self.assertEqual(result["exception"]["values"][0]["value"], "[redacted]")

    def test_other_errors_stay_redacted(self):
        error = ValueError("Jane Doe")
        result = scrub_sentry_event(
            self._event("Jane Doe"), {"exc_info": (ValueError, error, None)}
        )
        self.assertEqual(result["exception"]["values"][0]["value"], "[redacted]")

    def test_without_a_hint_everything_stays_redacted(self):
        result = scrub_sentry_event(self._event("Jane Doe"), {})
        self.assertEqual(result["exception"]["values"][0]["value"], "[redacted]")

    def test_long_messages_are_cut(self):
        self.assertEqual(len(safe_error_text("word " * 100)), 200)
