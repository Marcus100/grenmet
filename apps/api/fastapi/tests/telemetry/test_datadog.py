import os
import subprocess
import sys
import unittest
from pathlib import Path


class DatadogDefaultsTests(unittest.TestCase):
    def test_production_image_disables_unconfigured_agent_exports(self):
        dockerfile = Path(__file__).resolve().parents[2] / "Dockerfile.prod"
        defaults = dict(
            line.removeprefix("ENV ").split("=", 1)
            for line in dockerfile.read_text().splitlines()
            if line.startswith("ENV DD_")
        )
        for key in (
            "DD_TRACE_ENABLED",
            "DD_INSTRUMENTATION_TELEMETRY_ENABLED",
            "DD_REMOTE_CONFIGURATION_ENABLED",
        ):
            self.assertEqual(defaults.get(key), "false", key)
        result = subprocess.run(
            [
                sys.executable,
                "-c",
                "import ddtrace.auto; from ddtrace.trace import tracer; assert not tracer.enabled; tracer.shutdown()",
            ],
            env={**os.environ, **defaults},
            capture_output=True,
            text=True,
            timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("failed to send", result.stderr)
