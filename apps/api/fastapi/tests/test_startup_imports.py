"""The API must start without loading heavy, rarely used libraries."""

import os
import subprocess
import sys
from pathlib import Path


def test_app_import_skips_weasyprint(tmp_path: Path) -> None:
    # WeasyPrint is loaded only when a PDF is rendered; importing it at
    # startup made the staging API miss its deploy healthcheck (16 Oct 2026).
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
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "import sys, src.main; assert 'weasyprint' not in sys.modules",
        ],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, result.stderr
