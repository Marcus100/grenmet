from datetime import datetime, timezone, timedelta
import json
import unittest
from probe import CATALOGUE, check, transition
from report import build_reports
from journal import compact
from incidents import reconcile
from alert_test import exercise
from unittest.mock import Mock


class MonitoringTests(unittest.TestCase):
    def test_repeated_failures_and_single_recovery(self):
        state, event = transition(None, "down")
        self.assertIsNone(event)
        state, event = transition(state, "down")
        self.assertEqual(event, "opened")
        state, event = transition(state, "down")
        self.assertIsNone(event)
        state, event = transition(state, "up")
        self.assertEqual(event, "recovered")
        _, event = transition(state, "up")
        self.assertIsNone(event)

    def test_pending_never_becomes_healthy(self):
        service = json.loads(CATALOGUE.read_text())["services"][-2]
        self.assertEqual(check(service, "production")["status"], "pending")

    def test_synthetic_alert_stays_open_until_manual_recovery(self):
        api = Mock(return_value={"data": {"id": "123"}})
        report = exercise("staging", api)
        self.assertEqual(report["status"], "opened-awaiting-email-confirmation")
        self.assertTrue(report["emailReceipt"].startswith("unknown"))
        self.assertEqual(api.call_count, 1)
        self.assertEqual(api.call_args.args[:2], ("POST", "incidents"))

    def test_synthetic_recovery_checks_identity_and_environment(self):
        for name in [
            "Real outage",
            "TEST ONLY · production · CI monitoring acceptance",
        ]:
            api = Mock(
                return_value={"data": {"id": "123", "attributes": {"name": name}}}
            )
            with self.assertRaises(ValueError):
                exercise("staging", api, "resolve", "123")
            self.assertEqual(api.call_count, 1)
        api = Mock(
            return_value={
                "data": {
                    "id": "123",
                    "attributes": {
                        "name": "TEST ONLY · staging · CI monitoring acceptance"
                    },
                }
            }
        )
        report = exercise("staging", api, "resolve", "123")
        self.assertEqual(api.call_args.args[1], "incidents/123/resolve")
        self.assertTrue(report["recoveryReceipt"].startswith("unknown"))
        for identity in ["", "../1", "１２３"]:
            api.reset_mock()
            with self.assertRaises(ValueError):
                exercise("staging", api, "resolve", identity)
            api.assert_not_called()

    def test_monthly_compaction_is_idempotent_and_expires(self):
        now = datetime.now(timezone.utc)
        sample = {
            "app": "api",
            "owner": "gaa",
            "environment": "staging",
            "status": "up",
            "timestamp": (now - timedelta(days=20)).isoformat(),
        }
        records = [{"results": [sample]}]
        first = compact(records, now)
        self.assertEqual(first[0]["monthly"][0]["samples"], 1)
        self.assertEqual(compact(first, now), first)
        self.assertEqual(compact(first, now + timedelta(days=800)), [{"monthly": []}])

    def test_incident_delivery_and_recovery_are_deduplicated(self):
        state = {"incident": True, "episode": "test", "delivery": "pending"}
        api = Mock(return_value={"data": {"id": "123"}})
        persist = Mock()
        self.assertTrue(reconcile(state, "staging", "api", persist, api))
        self.assertTrue(reconcile(state, "staging", "api", persist, api))
        self.assertEqual(api.call_count, 1)
        state["incident"] = False
        self.assertTrue(reconcile(state, "staging", "api", persist, api))
        self.assertTrue(reconcile(state, "staging", "api", persist, api))
        self.assertEqual(api.call_count, 2)

    def test_uncertain_creation_never_blindly_retries(self):
        state = {"incident": True, "episode": "test", "delivery": "creating"}
        api = Mock(return_value={"data": []})
        self.assertFalse(reconcile(state, "staging", "api", Mock(), api))
        self.assertEqual(api.call_args.args[0], "GET")

    def test_owner_separation_missing_stale_and_real_zero(self):
        catalogue = json.loads(CATALOGUE.read_text())
        now = datetime.now(timezone.utc)
        samples = [
            {
                "app": "elections",
                "environment": "development",
                "timestamp": now.isoformat(),
                "status": "up",
                "private": "secret",
            }
        ]
        reports = build_reports(catalogue, samples, now)
        self.assertNotIn("secret", json.dumps(reports))
        self.assertNotIn("elections", json.dumps(reports["gaa"]))
        rows = next(
            s for s in reports["barrels"]["services"] if s["app"] == "elections"
        )["windows"]
        self.assertEqual(rows[0]["availability"]["failures"], 0)
        self.assertIsNone(rows[2]["availability"]["failures"])
        stale = build_reports(catalogue, samples, now + timedelta(hours=1))
        row = next(s for s in stale["barrels"]["services"] if s["app"] == "elections")[
            "windows"
        ][0]
        self.assertIsNone(row["availability"]["sampledAvailability"])


if __name__ == "__main__":
    unittest.main()
