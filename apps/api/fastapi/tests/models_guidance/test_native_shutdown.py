"""Native shutdown regression: in-process assertions miss allocator crashes.

ecCodes must not load before pyproj (see scripts/gms-ingest/src/gms_ingest):
otherwise the heap is corrupted at interpreter shutdown and the process aborts
even though every call succeeded. The API imports models_guidance at start-up
and the test process also imports gms_ingest, so exercise that order here.
"""

import subprocess
import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[2]


def test_api_then_gms_ingest_then_eccodes_exits_cleanly() -> None:
    env = {
        "PATH": "/usr/bin:/bin",
        "ENVIRONMENT": "local",
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
            "import importlib.util, src.main; "
            "from src.models_guidance import extract; "
            "importlib.util.find_spec('gms_ingest') and __import__('gms_ingest'); "
            "assert extract._eccodes().codes_get_api_version()",
        ],
        cwd=API_ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, result.stderr[-2000:]
