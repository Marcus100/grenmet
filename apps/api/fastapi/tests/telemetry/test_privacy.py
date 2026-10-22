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
