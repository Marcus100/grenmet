import { execFileSync } from "node:child_process";
import test from "node:test";

test("object snapshots honor cutoff and deletions; SQLite backups include WAL records", () => {
  execFileSync("python3", [
    "-c",
    `
import datetime
import importlib.util
import sqlite3
import tempfile
from pathlib import Path
spec = importlib.util.spec_from_file_location("files", "scripts/production/backup-files.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
cutoff = datetime.datetime.fromisoformat("2026-09-07T12:00:00+00:00")
listing = {"Versions": [
    {"Key": "image", "VersionId": "new", "LastModified": "2026-09-07T13:00:00Z"},
    {"Key": "image", "VersionId": "old", "LastModified": "2026-09-07T11:00:00Z"},
    {"Key": "deleted", "VersionId": "old", "LastModified": "2026-09-07T09:00:00Z"}],
    "DeleteMarkers": [{"Key": "deleted", "VersionId": "delete", "LastModified": "2026-09-07T10:00:00Z"}]}
assert module.versions_at(listing, cutoff) == {"deleted": {"version": "delete", "deleted": True}, "image": {"version": "old", "deleted": False}}
assert module.versions_at({}, cutoff) == {}
with tempfile.TemporaryDirectory() as directory:
    source, target = Path(directory) / "live.sqlite", Path(directory) / "copy.sqlite"
    with sqlite3.connect(source) as connection:
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("CREATE TABLE observations(value integer)")
        connection.execute("INSERT INTO observations VALUES(42)")
        connection.commit()
        assert module.sqlite_copy(source, target) == ["observations"]
        with sqlite3.connect(target) as restored:
            assert restored.execute("SELECT value FROM observations").fetchone() == (42,)
`,
  ]);
});

test("restore refuses existing destinations before any external operation", () => {
  execFileSync("python3", [
    "-c",
    `
import importlib.util
import tempfile
from pathlib import Path
spec = importlib.util.spec_from_file_location("restore", "scripts/production/restore-files.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with tempfile.TemporaryDirectory() as directory:
    sentinel = Path(directory) / "existing"
    sentinel.write_text("preserve")
    try:
        module.restore({"environment": "production", "artifacts": []}, directory)
    except FileExistsError:
        pass
    else:
        raise AssertionError("Existing destination accepted")
    assert sentinel.read_text() == "preserve"
`,
  ]);
});
