import { execFileSync } from "node:child_process";
import test from "node:test";

test("monitoring reconciliation, backup and reporting regression suite", () => {
  execFileSync(
    "python3",
    [
      "-m",
      "unittest",
      "discover",
      "-s",
      "scripts/monitoring",
      "-p",
      "test_*.py",
    ],
    { stdio: "pipe" }
  );
});

test("monitoring installer has valid shell syntax", () => {
  execFileSync("bash", ["-n", "scripts/monitoring/install.sh"]);
});
