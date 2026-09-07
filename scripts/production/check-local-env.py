#!/usr/bin/env python3
"""Report configuration presence and ignore coverage without printing values."""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REQUIRED = {
    "infra/docker": ["POSTGRES_USER", "POSTGRES_PASSWORD"],
    "apps/api/fastapi": ["SECRET_KEY", "POSTGRES_SERVER", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"],
    "apps/web/gaa-admin": ["RESEND_API_KEY", "WXWATCH_DATABASE_URL", "WXPRODUCTS_DATABASE_URL", "TRANSPORT_DATABASE_URL", "JANITORIAL_DATABASE_URL"],
    "apps/web/cms": ["DATABASE_URL", "PAYLOAD_SECRET"],
}
failures = 0
for relative, required in REQUIRED.items():
    path = ROOT / relative / ".env.local"
    values = {}
    if path.exists():
        for line in path.read_text().splitlines():
            match = re.match(r"(?:export\s+)?([A-Z][A-Z0-9_]*)=(.*)", line.strip())
            if match:
                values[match[1]] = match[2].strip().strip("\"'")
    missing = [key for key in required if not values.get(key)]
    ignored = subprocess.run(["git", "check-ignore", "-q", str(path)], cwd=ROOT).returncode == 0
    print(f"{relative}/.env.local: " + ("missing " + ", ".join(missing) if missing else "required keys present") + ("; gitignored" if ignored else "; NOT gitignored"))
    failures += bool(missing) or not ignored
    if relative == "apps/web/cms" and values.get("PAYLOAD_SECRET") and len(values["PAYLOAD_SECRET"]) < 32:
        print("CMS PAYLOAD_SECRET must have at least 32 characters")
        failures += 1
# Tracked secrets override ignore rules; list paths only, never contents.
tracked = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split("\0")
for name in tracked:
    basename = Path(name).name
    if basename in {".env", ".env.local", ".env.secrets", "acme.json"} or name.endswith((".dump", ".sqlite", ".sqlite3")):
        print(f"Tracked runtime/secret file requires review: {name}")
        failures += 1
sys.exit(1 if failures else 0)
