"""Health probes must check the heartbeat without loading task dependencies."""

import os
import subprocess
import sys
from pathlib import Path

import pytest


@pytest.mark.parametrize("startup_failure", [False, True])
@pytest.mark.parametrize("heartbeat,expected", [("alive", 0), ("", 1)])
def test_health_cli_uses_only_heartbeat_dependencies(
    tmp_path: Path, heartbeat: str, expected: int, startup_failure: bool
) -> None:
    script = r"""
import sys
from arq.cli import cli
from arq import worker
from click.testing import CliRunner
from src.worker.main import WorkerSettings
assert "src.cap.service" not in sys.modules
assert "src.database" not in sys.modules
assert "src.worker.dispatch" not in sys.modules
class Redis:
    async def get(self, key):
        assert key == WorkerSettings.health_check_key
        return sys.argv[1].encode()
    async def close(self, **kwargs):
        pass
async def pool(settings):
    assert settings == WorkerSettings.redis_settings
    return Redis()
worker.create_pool = pool
result = CliRunner().invoke(cli, ["--check", "src.worker.main.WorkerSettings"])
assert result.exit_code == int(sys.argv[2]), result.output

import asyncio
from src.worker import main
if sys.argv[3] == "True":
    def broken_import(name):
        raise ImportError("missing task dependency")
    main.import_module = broken_import
    try:
        asyncio.run(WorkerSettings.on_startup({}))
    except ImportError as exc:
        assert str(exc) == "missing task dependency"
    else:
        raise AssertionError("worker startup must reject missing task dependencies")
else:
    asyncio.run(WorkerSettings.on_startup({}))
    for name in ("src.cap.service", "src.database", "src.worker.dispatch"):
        assert name in sys.modules

"""
    env = {
        **os.environ,
        "PYTHONPATH": str(Path(__file__).resolve().parents[2]),
        "PROJECT_NAME": "ci",
        "SECRET_KEY": "ci-secret-key-min-32-characters-long",
        "POSTGRES_SERVER": "unused",
        "POSTGRES_USER": "ci",
        "POSTGRES_PASSWORD": "ci",
        "POSTGRES_DB": "ci_test",
        "FIRST_SUPERUSER": "ci@example.com",
        "FIRST_SUPERUSER_PASSWORD": "ci-password-long-enough",
    }
    result = subprocess.run(  # noqa: S603 - fixed script and parametrized test inputs
        [sys.executable, "-c", script, heartbeat, str(expected), str(startup_failure)],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stderr
