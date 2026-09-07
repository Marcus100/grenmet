import { execFileSync } from "node:child_process";
import test from "node:test";

test("freshness rejects missing stores, duplicate databases and stale recovery points", () => {
  execFileSync("python3", [
    "-c",
    `
import datetime
import importlib.util
spec = importlib.util.spec_from_file_location("age", "scripts/production/check-backup-age.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
now = datetime.datetime.now(datetime.timezone.utc)
good = {"environment": "staging", "completed_at": now.isoformat(), "databases": [{"database": name} for name in ["app", "wxwatch", "wxproducts", "transport", "janitorial", "cms"]]}
module.check_marker(good, "staging", "core", now)
for bad in [good | {"databases": good["databases"][:-1]}, good | {"databases": [good["databases"][0]] * 6}, good | {"completed_at": (now - datetime.timedelta(hours=25)).isoformat()}, good | {"environment": "production"}]:
    try:
        module.check_marker(bad, "staging", "core", now)
    except ValueError:
        pass
    else:
        raise AssertionError("Invalid backup marker accepted")
objects = {"environment": "staging", "kind": "objects", "completed_at": now.isoformat(), "snapshot_at": now.isoformat(), "artifacts": [], "objects": {}}
module.check_marker(objects, "staging", "objects", now)
`,
  ]);
});
