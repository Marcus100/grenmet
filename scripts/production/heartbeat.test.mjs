import { execFileSync } from "node:child_process";
import test from "node:test";

test("heartbeat rejects unreviewed hosts and never needs a token when disabled", () => {
  execFileSync("python3", [
    "-c",
    `
import importlib.util, os
spec = importlib.util.spec_from_file_location("heartbeat", "scripts/production/heartbeat.py")
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
os.environ.pop("TEST_HEARTBEAT_URL", None)
assert module.notify("TEST_HEARTBEAT_URL")
for url in ["http://uptime.betterstack.com/api/v1/heartbeat/private", "https://attacker.test/private", "https://uptime.betterstack.com/api/v1/heartbeat/private?secret=x"]:
 os.environ["TEST_HEARTBEAT_URL"] = url
 assert not module.notify("TEST_HEARTBEAT_URL")
`,
  ]);
});
