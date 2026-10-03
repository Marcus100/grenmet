from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch

import betterstack
import maintenance

spec = importlib.util.spec_from_file_location(
    "backup_core", maintenance.ROOT / "scripts/production/backup-core.py"
)
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class MaintenanceTests(unittest.TestCase):
    def manifest(self):
        return {
            "environment": "staging",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "absent_before_provisioning": [],
            "databases": [
                {
                    "database": name,
                    "key": f"staging/core/20261002T020000Z-1234abcd/{name}.dump",
                    "bytes": 123,
                }
                for name in maintenance.inventory("staging")
            ],
        }

    def test_restore_requires_complete_environment_inventory(self):
        manifest = self.manifest()
        self.assertEqual(
            len(
                maintenance.validate_manifest(
                    manifest, "staging", datetime.now(timezone.utc)
                )
            ),
            6,
        )
        for field, value in [
            ("environment", "production"),
            ("completed_at", "2020-01-01T00:00:00+00:00"),
            ("absent_before_provisioning", ["cms"]),
            ("databases", manifest["databases"][:-1]),
        ]:
            with self.assertRaises(ValueError):
                maintenance.validate_manifest(
                    dict(manifest, **{field: value}),
                    "staging",
                    datetime.now(timezone.utc),
                )
        manifest["databases"][0]["key"] = "production/core/secret.dump"
        with self.assertRaises(ValueError):
            maintenance.validate_manifest(
                manifest, "staging", datetime.now(timezone.utc)
            )

    def test_restore_is_isolated_and_cleans_up_on_failure(self):
        manifest = self.manifest()
        for row in manifest["databases"]:
            row["bytes"] = 4
        calls = []

        def command(args, **kwargs):
            calls.append(args)
            if args[:3] == ["aws", "s3", "cp"]:
                Path(args[4]).write_text(
                    json.dumps(manifest) if args[3].endswith(".json") else "dump"
                )
            if args[:2] == ["docker", "ps"]:
                return SimpleNamespace(stdout="source")
            if args[:2] == ["docker", "inspect"]:
                return SimpleNamespace(
                    stdout="healthy" if "Health" in args[3] else "sha256:" + "a" * 64
                )
            if "pg_restore" in args:
                import subprocess

                raise subprocess.CalledProcessError(1, args)
            return SimpleNamespace(stdout="")

        original = Path.read_text

        def read(path, *args, **kwargs):
            return (
                "MemAvailable: 4194304 kB"
                if str(path) == "/proc/meminfo"
                else original(path, *args, **kwargs)
            )

        with (
            patch.dict(
                "os.environ",
                {
                    "DO_SPACES_BUCKET": "bucket",
                    "DO_SPACES_ENDPOINT": "https://storage.example",
                },
            ),
            patch.object(maintenance, "run", side_effect=command),
            patch.object(Path, "read_text", read),
            patch.object(
                maintenance.shutil,
                "disk_usage",
                return_value=SimpleNamespace(free=100 * 1024**3),
            ),
        ):
            import subprocess

            with self.assertRaises(subprocess.CalledProcessError):
                maintenance.restore("staging", "grenmet-staging")
        start = next(args for args in calls if args[:2] == ["docker", "run"])
        self.assertEqual(start[start.index("--network") + 1], "none")
        self.assertEqual(start[start.index("--memory") + 1], "1g")
        self.assertTrue(calls[-1][3].startswith("grenmet-restore-staging-"))
        self.assertEqual(calls[-1][:3], ["docker", "rm", "-fv"])

    def test_every_object_including_markers_is_verified(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "success.json"
            path.write_text("{}")
            with patch.object(
                backup,
                "run",
                side_effect=[
                    SimpleNamespace(),
                    SimpleNamespace(stdout='{"ContentLength":1}'),
                ],
            ) as command:
                with self.assertRaises(ValueError):
                    backup.upload_verified(
                        path,
                        "bucket",
                        "staging/core/latest-success.json",
                        "https://storage.example",
                    )
                self.assertIn("head-object", command.call_args.args[0])

    def test_failed_marker_never_sends_heartbeat(self):
        names = maintenance.inventory("staging")

        def command(args, **kwargs):
            if "get-bucket-lifecycle-configuration" in args:
                return SimpleNamespace(
                    stdout=json.dumps(
                        {
                            "Rules": [
                                {
                                    "Status": "Enabled",
                                    "Expiration": {"Days": 30},
                                    "Filter": {"Prefix": "staging/core/"},
                                }
                            ]
                        }
                    )
                )
            if args[:2] == ["docker", "ps"]:
                return SimpleNamespace(stdout="container")
            if "list-objects-v2" in args:
                return SimpleNamespace(stdout="{}")
            if "stdout" in kwargs and hasattr(kwargs["stdout"], "write"):
                kwargs["stdout"].write(b"dump")
                return SimpleNamespace()
            return SimpleNamespace(stdout="\n".join(names))

        with (
            tempfile.TemporaryDirectory() as directory,
            patch.dict(
                "os.environ",
                {
                    "DO_SPACES_BUCKET": "bucket",
                    "DO_SPACES_ENDPOINT": "https://storage.example",
                    "AWS_ACCESS_KEY_ID": "test",
                    "AWS_SECRET_ACCESS_KEY": "test",
                    "AWS_DEFAULT_REGION": "test",
                    "BACKUP_DIR": directory,
                },
            ),
            patch.object(backup, "run", side_effect=command),
            patch.object(backup.subprocess, "run") as heartbeat,
        ):

            def upload(path, bucket, key, endpoint):
                if key.endswith("latest-success.json"):
                    raise ValueError("Marker verification failed")

            with (
                patch.object(backup, "upload_verified", side_effect=upload),
                self.assertRaises(ValueError),
            ):
                backup.backup(
                    "staging",
                    "grenmet-staging",
                    maintenance.ROOT / "infra/docker/staging.env",
                )
            heartbeat.assert_not_called()


class ProviderTests(unittest.TestCase):
    def config(self):
        return {
            "teamId": 1,
            "limitsVerified": True,
            "limits": {"monitors": 1, "heartbeats": 1},
            "resources": [
                {
                    "environment": "staging",
                    "kind": "heartbeats",
                    "id": "1",
                    "settings": {
                        "name": "Staging · test",
                        "period": 300,
                        "paused": False,
                    },
                }
            ],
        }

    def test_no_changes_and_unrelated_resources_preserved(self):
        live = {
            "heartbeats": [
                {
                    "id": "1",
                    "attributes": {
                        "name": "Staging · test",
                        "period": 300,
                        "paused_at": None,
                    },
                },
                {"id": "99", "attributes": {"name": "Unrelated"}},
            ],
            "monitors": [],
        }
        self.assertEqual(betterstack.plan(self.config(), "staging", live), [])
        self.assertEqual(betterstack.plan(self.config(), "production", live), [])
        live["heartbeats"][0]["attributes"]["period"] = 60
        self.assertEqual(
            betterstack.plan(self.config(), "staging", live)[0]["settings"],
            {"period": 300},
        )

    def test_unknown_id_and_quota_fail_closed(self):
        config = self.config()
        with self.assertRaises(ValueError):
            betterstack.plan(config, "staging", {"heartbeats": [], "monitors": []})
        config["resources"][0].pop("id")
        config["resources"][0]["settings"]["paused"] = True
        config["limitsVerified"] = False
        with self.assertRaises(ValueError):
            betterstack.plan(config, "staging", {"heartbeats": [], "monitors": []})
        config["limitsVerified"] = True
        with self.assertRaises(ValueError):
            betterstack.plan(
                config,
                "staging",
                {
                    "heartbeats": [{"id": "2", "attributes": {"name": "Unrelated"}}],
                    "monitors": [],
                },
            )


if __name__ == "__main__":
    unittest.main()
