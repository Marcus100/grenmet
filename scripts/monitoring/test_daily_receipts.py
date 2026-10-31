import json
import stat
import subprocess
import tempfile
import unittest
import unittest.mock
from datetime import UTC, datetime, timedelta
from pathlib import Path

import daily_receipts

NOW = datetime(2026, 10, 31, 4, 50, tzinfo=UTC)
DB_ID = "a" * 64
REDIS_ID = "b" * 64
SECRET_TOKEN = "sntrys_fake_read_only_token_value"
SPACES_SECRET = "fake-spaces-secret-value"
ENV = {
    "PATH": "/usr/bin:/bin",
    "HOME": "/home/runner",
    "MONITORING_SENTRY_ORG": "grenmet",
    "MONITORING_SENTRY_PROJECT": "grenmet-staging",
    "MONITORING_SENTRY_TOKEN": SECRET_TOKEN,
    "MONITORING_SECRET_EXPIRY_DATES": "2026-11-10T00:00:00Z, 2027-06-01T00:00:00+00:00",
    "MONITORING_BACKUP_KINDS": "core",
    "MONITORING_SPACES_BUCKET": "grenmet-backups",
    "MONITORING_SPACES_ENDPOINT": "https://nyc3.digitaloceanspaces.com",
    "MONITORING_SPACES_KEY_ID": "fake-key-id",
    "MONITORING_SPACES_SECRET_KEY": SPACES_SECRET,
}
JOBS = (
    "process_cap_jobs|completed\n8000\nprocess_cap_jobs|failed\n2\n"
    "ingest_cap_feeds|completed\n288\nsend_notification_emails|completed\n2880\n"
    "run_notification_sweeps|completed\n1\n"
)


def core_marker(environment="staging", age=timedelta(hours=3)):
    names = [
        value
        for key, value in daily_receipts.deploy_config(environment).items()
        if key
        in {
            "POSTGRES_DB",
            "WXWATCH_DB_NAME",
            "WXPRODUCTS_DB_NAME",
            "JANITORIAL_DB_NAME",
            "TRANSPORT_DB_NAME",
            "EREGISTER_DB_NAME",
            "CMS_DB_NAME",
        }
    ]
    return {
        "environment": environment,
        "completed_at": (NOW - age).isoformat(),
        "databases": [{"database": name} for name in names],
    }


class FakeRunner:
    def __init__(self, marker=None, redis=JOBS, psql="1,2\n", fail=()):
        self.calls = []
        self.marker = core_marker() if marker is None else marker
        self.redis = redis
        self.psql = psql
        self.fail = set(fail)

    def __call__(self, args, *, input_text=None, env=None, **_kwargs):
        self.calls.append({"args": args, "input": input_text, "env": env or {}})

        def done(stdout, code=0):
            return subprocess.CompletedProcess(args, code, stdout, "private stderr")

        if args[:2] == ["docker", "ps"]:
            service = args[-1].rsplit("=", 1)[1]
            if service in self.fail:
                return done("", 1)
            return done((DB_ID if service == "db" else REDIS_ID) + "\n")
        if args[:2] == ["docker", "exec"] and "psql" in args:
            return done(self.psql, 1 if "psql" in self.fail else 0)
        if args[:2] == ["docker", "exec"] and "redis-cli" in args:
            return done(self.redis)
        if args[0] == "aws":
            return done(json.dumps(self.marker), 1 if "aws" in self.fail else 0)
        raise AssertionError(f"unexpected command {args[0]}")


def fake_sentry(pages):
    calls = []

    def fetch(url, token):
        calls.append((url, token))
        if url.endswith("/projects/grenmet/grenmet-staging/"):
            return {"id": "42", "name": "must not be copied"}
        return pages.pop(0)

    fetch.calls = calls
    return fetch


class DailyReceiptTests(unittest.TestCase):
    def collect(self, runner=None, fetch=None, env=None):
        runner = runner or FakeRunner()
        fetch = fetch or fake_sentry(
            [[{"id": "1", "title": "secret title"}], [{"id": "1"}, {"id": "2"}]]
        )
        return (
            daily_receipts.collect("staging", env or ENV, runner, fetch, NOW),
            runner,
            fetch,
        )

    def test_every_source_is_complete_with_aggregate_counts_only(self):
        receipt, _runner, fetch = self.collect()
        self.assertEqual(receipt["environment"], "staging")
        self.assertEqual(
            receipt["sources"],
            {
                "sentry": {"complete": True, "failures": 2},
                "eregister-sends": {"complete": True, "failures": 3},
                "wis2-sends": {"complete": True, "failures": 3},
                "worker-jobs": {"complete": True, "failures": 2},
                "notification-sweeps": {"complete": True, "failures": 0},
                "secrets": {"complete": True, "failures": 1},
                "backups": {"complete": True, "failures": 0},
            },
        )
        text = json.dumps(receipt)
        for private in (SECRET_TOKEN, SPACES_SECRET, "secret title", "must not be"):
            self.assertNotIn(private, text)
        self.assertTrue(all(token == SECRET_TOKEN for _url, token in fetch.calls))

    def test_database_reads_use_the_read_only_role_and_fixed_sql(self):
        _receipt, runner, _fetch = self.collect()
        psql = [c for c in runner.calls if "psql" in c["args"]]
        self.assertEqual(len(psql), 2)
        for call in psql:
            args = call["args"]
            self.assertEqual(args[args.index("--username") + 1], "grenmet_monitor")
            self.assertEqual(args[args.index("--dbname") + 1], "eregister_staging")
            self.assertTrue(call["input"].startswith("BEGIN READ ONLY;"))
            self.assertIn("statement_timeout = '3s'", call["input"])
        self.assertIn("WHERE target = 'email'", psql[0]["input"])
        self.assertIn("WHERE target = 'wis2'", psql[1]["input"])
        ps = next(c for c in runner.calls if c["args"][:2] == ["docker", "ps"])
        self.assertIn("label=com.docker.compose.project=grenmet-staging", ps["args"])

    def test_redis_reads_only_the_previous_day_job_hash(self):
        _receipt, runner, _fetch = self.collect()
        redis = [c["args"] for c in runner.calls if "redis-cli" in c["args"]]
        self.assertTrue(redis)
        for args in redis:
            self.assertEqual(
                args[-2:], ["HGETALL", "telemetry:v1:staging:jobs:2026-10-30"]
            )

    def test_docker_and_aws_never_receive_unrelated_secrets(self):
        _receipt, runner, _fetch = self.collect()
        for call in runner.calls:
            values = " ".join(call["env"].values()) + " ".join(call["args"])
            self.assertNotIn(SECRET_TOKEN, values)
            if call["args"][0] == "docker":
                self.assertNotIn(SPACES_SECRET, values)
        aws = next(c for c in runner.calls if c["args"][0] == "aws")
        self.assertEqual(aws["env"]["AWS_SECRET_ACCESS_KEY"], SPACES_SECRET)
        self.assertIn(
            "s3://grenmet-backups/staging/core/latest-success.json", aws["args"]
        )

    def test_stale_backup_marker_is_a_failure_not_a_gap(self):
        runner = FakeRunner(marker=core_marker(age=timedelta(hours=30)))
        receipt, _, _ = self.collect(runner=runner)
        self.assertEqual(
            receipt["sources"]["backups"], {"complete": True, "failures": 1}
        )

    def test_missing_sources_are_incomplete_with_fixed_reasons(self):
        runner = FakeRunner(redis="", fail={"psql", "aws"})
        env = {k: v for k, v in ENV.items() if k != "MONITORING_SENTRY_TOKEN"}
        env["MONITORING_SECRET_EXPIRY_DATES"] = "2026-11-10"
        receipt, _runner, _fetch = self.collect(runner=runner, env=env)
        sources = receipt["sources"]
        self.assertEqual(
            {name: item.get("reason") for name, item in sources.items()},
            {
                "sentry": "Sentry read token unavailable",
                "eregister-sends": "database aggregate unavailable",
                "wis2-sends": "database aggregate unavailable",
                "worker-jobs": "telemetry job coverage incomplete",
                "notification-sweeps": "telemetry job coverage incomplete",
                "secrets": "secret expiry timezone missing",
                "backups": "backup marker unavailable",
            },
        )
        self.assertFalse(any(item["complete"] for item in sources.values()))
        self.assertNotIn("private stderr", json.dumps(receipt))

    def test_partial_worker_coverage_and_bad_counter_output_are_incomplete(self):
        for redis in (
            "process_cap_jobs|completed\n1\n",
            "ERR wrong type\n",
            "a|failed\nx\n",
        ):
            receipt, _runner, _fetch = self.collect(runner=FakeRunner(redis=redis))
            self.assertFalse(receipt["sources"]["worker-jobs"]["complete"], redis)

    def test_sentry_address_and_slugs_are_validated(self):
        for override in (
            {"MONITORING_SENTRY_URL": "https://evil.example/"},
            {"MONITORING_SENTRY_URL": "http://sentry.io"},
            {"MONITORING_SENTRY_ORG": "../admin"},
        ):
            fetch = fake_sentry([])
            receipt, _runner, _ = self.collect(fetch=fetch, env={**ENV, **override})
            self.assertFalse(receipt["sources"]["sentry"]["complete"])
            self.assertEqual(fetch.calls, [])

    def test_sentry_host_must_match_the_strict_allow_list(self):
        for url in (
            "https://evil.com\\.sentry.io",
            "https://evil.com%5c.sentry.io",
            "https://sentry.io.evil.com",
            "https://evilsentry.io",
            "https://sentry.io:444",
            "https://sentry.io/api/0/",
            "https://de.sentry.io?x=1",
            "https://de.sentry.io#fragment",
            "https://user:pass@sentry.io",
            "https:// sentry.io",
        ):
            fetch = fake_sentry([])
            receipt, _, _ = self.collect(
                fetch=fetch, env={**ENV, "MONITORING_SENTRY_URL": url}
            )
            self.assertEqual(
                receipt["sources"]["sentry"],
                {"complete": False, "reason": "Sentry API address invalid"},
                url,
            )
            self.assertEqual(fetch.calls, [], url)
        for url, origin in (
            ("https://de.sentry.io", "https://de.sentry.io"),
            ("https://US.Sentry.IO/", "https://us.sentry.io"),
            ("https://sentry.io", "https://sentry.io"),
        ):
            fetch = fake_sentry([[], []])
            receipt, _, _ = self.collect(
                fetch=fetch, env={**ENV, "MONITORING_SENTRY_URL": url}
            )
            self.assertTrue(receipt["sources"]["sentry"]["complete"], url)
            self.assertTrue(
                all(call.startswith(f"{origin}/api/0/") for call, _ in fetch.calls)
            )

    def test_spaces_endpoint_must_be_a_digitalocean_spaces_region_host(self):
        for endpoint in (
            "https://evil.example",
            "https://nyc3.digitaloceanspaces.com.evil.com",
            "https://grenmet-backups.nyc3.digitaloceanspaces.com",
            "https://evil.com\\.digitaloceanspaces.com",
            "https://nyc3.digitaloceanspaces.com:8443",
            "https://nyc3.digitaloceanspaces.com/bucket",
            "https://key@nyc3.digitaloceanspaces.com",
            "http://nyc3.digitaloceanspaces.com",
            "",
        ):
            runner = FakeRunner()
            receipt, _, _ = self.collect(
                runner=runner, env={**ENV, "MONITORING_SPACES_ENDPOINT": endpoint}
            )
            self.assertEqual(
                receipt["sources"]["backups"],
                {"complete": False, "reason": "backup storage config unavailable"},
                endpoint,
            )
            self.assertFalse(any(c["args"][0] == "aws" for c in runner.calls))
        runner = FakeRunner()
        receipt, _, _ = self.collect(
            runner=runner,
            env={
                **ENV,
                "MONITORING_SPACES_ENDPOINT": "https://SFO3.digitaloceanspaces.com/",
            },
        )
        self.assertTrue(receipt["sources"]["backups"]["complete"])
        aws = next(c for c in runner.calls if c["args"][0] == "aws")
        self.assertEqual(
            aws["args"][aws["args"].index("--endpoint-url") + 1],
            "https://sfo3.digitaloceanspaces.com",
        )

    def test_unknown_role_or_backup_kind_is_refused(self):
        receipt, runner, _ = self.collect(
            env={
                **ENV,
                "MONITORING_DB_ROLE": "x; DROP",
                "MONITORING_BACKUP_KINDS": "core,core",
            }
        )
        self.assertFalse(receipt["sources"]["eregister-sends"]["complete"])
        self.assertFalse(receipt["sources"]["backups"]["complete"])
        self.assertFalse(any("psql" in c["args"] for c in runner.calls))

    def test_main_writes_a_private_receipt_and_summary(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "receipt.json"
            summary = Path(directory) / "summary.md"
            fetch = fake_sentry([[], []])
            with unittest.mock.patch.dict("os.environ", ENV, clear=True):
                status = daily_receipts.main(
                    [
                        "--environment",
                        "staging",
                        "--output",
                        str(output),
                        "--summary",
                        str(summary),
                    ],
                    runner=FakeRunner(),
                    fetch=fetch,
                )
            self.assertEqual(status, 0)
            self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o600)
            self.assertLess(output.stat().st_size, 65_536)
            receipt = json.loads(output.read_text())
            self.assertEqual(
                receipt["sources"]["sentry"], {"complete": True, "failures": 0}
            )
            self.assertIn("| sentry | yes | 0 |", summary.read_text())
            self.assertNotIn(SECRET_TOKEN, summary.read_text())


if __name__ == "__main__":
    unittest.main()
