"""The API must start without loading heavy, rarely used libraries."""

import os
import subprocess
import sys
from pathlib import Path

# Loaded only when a request needs them; importing them at startup made the
# staging API miss its deploy healthcheck (16 October 2026).
LAZY = ("weasyprint",)


def test_app_import_skips_lazy_libraries(tmp_path: Path) -> None:
    script = (
        "import sys\n"
        "import src.main\n"
        f"loaded = [name for name in {LAZY!r} if name in sys.modules]\n"
        "assert not loaded, loaded\n"
    )
    env = {
        **os.environ,
        "PYTHONPATH": str(Path(__file__).resolve().parents[1]),
        "PROJECT_NAME": "ci",
        "SECRET_KEY": "ci-secret-key-min-32-characters-long",
        "POSTGRES_SERVER": "unused",
        "POSTGRES_USER": "ci",
        "POSTGRES_PASSWORD": "ci",
        "POSTGRES_DB": "ci_test",
        "FIRST_SUPERUSER": "ci@example.com",
        "FIRST_SUPERUSER_PASSWORD": "ci-password-long-enough",
    }
    result = subprocess.run(  # noqa: S603 - fixed script
        [sys.executable, "-c", script],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, result.stderr
