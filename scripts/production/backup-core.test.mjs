import { execFileSync } from "node:child_process";
import test from "node:test";

test("only a first-rollout CMS absence is allowed before provisioning", () => {
  execFileSync("python3", [
    "-c",
    `
import importlib.util
spec = importlib.util.spec_from_file_location("backup", "scripts/production/backup-core.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
names = ["app_staging", "wxwatch_staging", "wxproducts_staging", "transport_staging", "janitorial_staging", "gms_cms_staging"]
assert module.select_databases(names, names, names[-1]) == (names, [])
assert module.select_databases(names, names[:-1], names[-1], True, True) == (names[:-1], [names[-1]])
for actual, before, bootstrap, completed in [(names[:-1], False, True, False), (names[:-1], True, False, False), (names[:-1], True, True, True), (names[1:], True, True, False), (names[1:-1], True, True, False), ([], True, True, False)]:
    try:
        module.select_databases(names, actual, names[-1], before, bootstrap, completed)
    except ValueError:
        pass
    else:
        raise AssertionError("missing authoritative data must block backup")
`,
  ]);
});
