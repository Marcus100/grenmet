import json
import unittest

from src.telemetry import scrub_sentry_event, sentry_options


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
            "logger": "ddtrace.internal.writer.writer",
            "logentry": {"formatted": "secret payload"},
        }
        result = scrub_sentry_event(event, {})
        self.assertEqual(result["message"], "Log event (details redacted)")
        self.assertNotIn("secret payload", json.dumps(result))
        self.assertEqual(result["logger"], "ddtrace.internal.writer.writer")
