import { execFileSync } from "node:child_process";
import test from "node:test";

// Runs a Python snippet against the drill module's pure functions.
function python(body) {
  execFileSync("python3", [
    "-c",
    `
import datetime
import importlib.util
spec = importlib.util.spec_from_file_location("drill", "scripts/production/restore-drill.py")
drill = importlib.util.module_from_spec(spec)
spec.loader.exec_module(drill)
now = datetime.datetime.now(datetime.timezone.utc)
def raises(call):
    try:
        call()
    except ValueError:
        return True
    return False
${body}
`,
  ]);
}

test("manifest accepts a fresh complete marker and rejects unsafe ones", () => {
  python(`
good = {"environment": "production", "completed_at": now.isoformat(), "databases": [
    {"database": "app_prod", "key": "production/core/b1/app_prod.dump"},
    {"database": "wxwatch", "key": "production/core/b1/wxwatch.dump"}]}
assert drill.read_manifest(good, "production", now) == [
    ("app_prod", "production/core/b1/app_prod.dump"),
    ("wxwatch", "production/core/b1/wxwatch.dump")]
old = (now - datetime.timedelta(hours=25)).isoformat()
future = (now + datetime.timedelta(hours=1)).isoformat()
def with_db(rows): return good | {"databases": rows}
bad = [
    good | {"environment": "staging"},
    good | {"completed_at": old},
    good | {"completed_at": future},
    good | {"completed_at": now.replace(tzinfo=None).isoformat()},
    with_db([]),
    with_db([good["databases"][0]] * 2),
    with_db([{"database": "app_prod", "key": "production/core/../../etc/passwd"}]),
    with_db([{"database": "app_prod", "key": "staging/core/b1/app_prod.dump"}]),
    with_db([{"database": "app_prod", "key": "/production/core/b1/app_prod.dump"}]),
    with_db([{"database": "app prod; drop", "key": "production/core/b1/x.dump"}]),
]
for marker in bad:
    assert raises(lambda: drill.read_manifest(marker, "production", now)), marker
`);
});

test("version table detection finds one table, none, or refuses several", () => {
  python(`
assert drill.version_table_of(["alembic_version"]) == "alembic_version"
assert drill.version_table_of(["events_alembic_version"]) == "events_alembic_version"
assert drill.version_table_of([]) is None
assert drill.version_table_of(["payload_migrations"]) is None
assert raises(lambda: drill.version_table_of(["alembic_version", "x_alembic_version"]))
`);
});

test("database checks report drift, empty restores, missing heads and floors", () => {
  python(`
heads = {"alembic_version": "h1"}
ok = lambda **k: drill.check_database(**({"name": "app_prod", "version_table": "alembic_version",
    "revision": "h1", "counts": {"public.staff": 5}, "heads": heads, "floors": {},
    "non_alembic": ["cms"]} | k))
assert ok() == []
assert "drift" in ok(revision="h0")[0]
assert "no tables" in ok(counts={})[0]
assert "empty" in ok(counts={"public.staff": 0})[0]
assert "no code head" in ok(version_table="other_alembic_version")[0]
assert "no Alembic version table" in ok(version_table=None)[0]
assert ok(name="gms_cms", version_table=None) == []
below = ok(floors={"app_prod": {"public.staff": 10}})
assert len(below) == 1 and "below the floor of 10" in below[0]
assert ok(floors={"app_prod": {"public.staff": 5}}) == []
assert ok(floors={"other_db": {"public.staff": 99}}) == []
`);
});

test("summary fails on problems or slow recovery and never lists row contents", () => {
  python(`
results = {"app_prod": {"tables": 2, "rows": 9, "revision": "h1", "counts": {"public.staff": 9}}}
text, passed = drill.render_summary("production", results, {"restore": 10.0}, 7200, [])
assert passed and "PASSED" in text and "app_prod" in text
text, passed = drill.render_summary("production", results, {"restore": 10.0}, 7200, ["x: broke"])
assert not passed and "FAILED" in text and "x: broke" in text
text, passed = drill.render_summary("production", results, {"restore": 8000.0}, 7200, [])
assert not passed and "exceeded 7200s" in text
assert "Not yet verified: starting the API" in text
`);
});

test("error descriptions never include command arguments", () => {
  python(`
import subprocess
error = subprocess.CalledProcessError(1, ["docker", "run", "-e", "SECRET=hunter2"])
assert drill.describe(error) == "docker exited with 1"
assert "hunter2" not in drill.describe(error)
`);
});

test("daily layout picks the newest dump per database and rejects gaps and old dumps", () => {
  python(`
fmt = lambda t: t.strftime("%Y%m%d_%H%M%S")
day = lambda t: t.strftime("%Y/%m/%d")
def key(name, t): return f"production/{day(t)}/{name}_{fmt(t)}.dump"
older = now - datetime.timedelta(hours=20)
newer = now - datetime.timedelta(hours=2)
keys = [key("app_prod", older), key("app_prod", newer), key("wxwatch", newer), key("gms_cms", newer),
        "production/2026/01/01/notes.txt", "staging/2026/01/01/app_prod_20260101_000000.dump",
        "production/core/latest-success.json"]
picked = drill.discover_daily(keys, now, ("app_prod", "wxwatch"))
assert picked == [("app_prod", key("app_prod", newer)), ("gms_cms", key("gms_cms", newer)),
                  ("wxwatch", key("wxwatch", newer))], picked
assert raises(lambda: drill.discover_daily(keys, now, ("app_prod", "events")))
stale = [key("app_prod", now - datetime.timedelta(hours=30)), key("wxwatch", newer)]
assert raises(lambda: drill.discover_daily(stale, now, ("app_prod", "wxwatch")))
traversal = ["production/../x/2026/01/app_prod_20260101_000000.dump"]
assert raises(lambda: drill.discover_daily(traversal, now, ("app_prod",)))
`);
});
