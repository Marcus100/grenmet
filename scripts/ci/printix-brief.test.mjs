import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../ops/printix-brief.mjs", import.meta.url)
);

function fixture(name) {
  return fileURLToPath(
    new URL(`../ops/fixtures/printix-${name}.json`, import.meta.url)
  );
}

function run(args, input) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    input,
  });
  assert.ifError(result.error);
  return result;
}

function runPacket(packet, flags = []) {
  return run(["-", ...flags], JSON.stringify(packet));
}

test("readiness puts blockers and unknown checks before confirmed checks", () => {
  const { status, stdout, stderr } = run([fixture("readiness")]);
  assert.equal(status, 0, stderr);
  assert.ok(stdout.startsWith("# Printix readiness brief\n"), stdout);
  assert.ok(stdout.includes("2 blocked. 2 unknown."), stdout);
  assert.ok(
    stdout.includes(
      "(ticket_import) | Blocked | Organiser | Before the day / Tickets"
    ),
    stdout
  );
  assert.ok(
    stdout.includes(
      "(gate_pairing) | Unknown | Gate lead | On the day / Pair the phones"
    ),
    stdout
  );
  const rows = stdout
    .split("\n")
    .filter((line) => line.startsWith("| "))
    .slice(2);
  assert.deepEqual(
    rows.map((line) => line.split("|")[2].trim()),
    ["Blocked", "Blocked", "Unknown", "Unknown", "Pass", "Pass"]
  );
  assert.ok(
    stdout.includes(
      "(event_setup) | Pass | Organiser | Before the day / The event"
    ),
    stdout
  );
  assert.ok(!stdout.includes("Aggregate counts"), stdout);
});

test("closeout keeps supplied counts, including zero, distinct from omitted counts", () => {
  const { status, stdout, stderr } = run([fixture("closeout")]);
  assert.equal(status, 0, stderr);
  assert.ok(stdout.startsWith("# Printix closeout brief\n"), stdout);
  assert.ok(
    stdout.includes("Admissions displayed in the event report — 128"),
    stdout
  );
  assert.ok(
    stdout.includes(
      "Admissions still waiting to sync across all gate phones — 0"
    ),
    stdout
  );
  assert.ok(
    stdout.includes("Offline conflicts reported by gate staff — Unknown"),
    stdout
  );
  assert.ok(stdout.includes("Operator review required"), stdout);
});

test("the model prompt contains exactly the same evidence as the baseline", () => {
  const file = fixture("closeout");
  const baseline = run([file]);
  const prompt = run([file, "--prompt"]);
  assert.equal(baseline.status, 0, baseline.stderr);
  assert.equal(prompt.status, 0, prompt.stderr);
  assert.ok(prompt.stdout.includes("Printix brief prompt v1"), prompt.stdout);
  assert.ok(
    prompt.stdout.includes(
      "Leave readiness and closeout decisions to the operator"
    ),
    prompt.stdout
  );
  assert.equal(prompt.stdout.split("## Evidence\n\n")[1], baseline.stdout);
});

test("empty closeout evidence does not imply successful checks or zero counts", () => {
  const { status, stdout, stderr } = runPacket({
    checkpoint: "closeout",
    checks: {},
  });
  assert.equal(status, 0, stderr);
  assert.ok(stdout.includes("0 blocked. 4 unknown."), stdout);
  assert.equal(stdout.split("— Unknown").length - 1, 3);
});

test("the CLI rejects records outside the evidence schema without echoing inputs", () => {
  const invalid = [
    { checkpoint: "rehearsal", checks: {} },
    { checkpoint: "readiness" },
    { checkpoint: "readiness", checks: [] },
    { checkpoint: "readiness", checks: {}, counts: {} },
    { checkpoint: "readiness", checks: { report_reviewed: "pass" } },
    {
      checkpoint: "readiness",
      checks: { staff_access: "SYNTHETIC-PRIVATE-VALUE" },
    },
    {
      checkpoint: "closeout",
      checks: {},
      rawScans: ["SYNTHETIC-PRIVATE-VALUE"],
    },
    { checkpoint: "closeout", checks: {}, counts: { pending: -1 } },
    { checkpoint: "closeout", checks: {}, counts: { pending: 0.5 } },
    { checkpoint: "closeout", checks: {}, counts: { pending: "0" } },
    { checkpoint: "closeout", checks: {}, counts: { pending: 2 ** 53 } },
    { checkpoint: "closeout", checks: {}, counts: null },
  ];
  for (const packet of invalid) {
    const { status, stdout, stderr } = runPacket(packet, ["--prompt"]);
    assert.equal(status, 1, JSON.stringify(packet));
    assert.equal(stdout, "");
    assert.notEqual(stderr, "");
    assert.ok(!stderr.includes("SYNTHETIC-PRIVATE-VALUE"), stderr);
  }
});

test("closeout rejects a confirmed sync with outstanding admissions", () => {
  const { status, stdout, stderr } = runPacket({
    checkpoint: "closeout",
    checks: { phones_synced: "pass" },
    counts: { pending: 5 },
  });
  assert.equal(status, 1);
  assert.equal(stdout, "");
  assert.ok(stderr.includes("Phones cannot be marked synced"), stderr);
});

test("raw JSON cannot erase a check or round a count into a verified value", () => {
  const invalidEvidence = [
    [
      '{"checkpoint":"readiness","checks":{"staff_access":"blocked","staff_access":"pass"}}',
      "repeated fields",
    ],
    [
      '{"checkpoint":"readiness","checks":{"staff_access":"blocked","staff_\\u0061ccess":"pass"}}',
      "repeated fields",
    ],
    [
      '{"checkpoint":"closeout","checks":{"phones_synced":"pass"},"counts":{"pending":1e-324}}',
      "written as decimal digits",
    ],
    [
      '{"checkpoint":"closeout","checks":{},"counts":{"admitted":0.99999999999999999}}',
      "written as decimal digits",
    ],
  ];
  for (const [input, message] of invalidEvidence) {
    const { status, stdout, stderr } = run(["-"], input);
    assert.equal(status, 1, input);
    assert.equal(stdout, "");
    assert.ok(stderr.includes(message), stderr);
  }
});

test("malformed JSON and invalid flags fail without producing a brief", () => {
  const malformed = run(
    ["-", "--prompt"],
    '{"secret":"SYNTHETIC-PRIVATE-VALUE",'
  );
  assert.equal(malformed.status, 1);
  assert.equal(malformed.stdout, "");
  assert.equal(malformed.stderr, "Evidence must be valid JSON.\n");

  const badFlag = run([fixture("readiness"), "--publish"]);
  assert.equal(badFlag.status, 1);
  assert.equal(badFlag.stdout, "");
  assert.ok(badFlag.stderr.startsWith("Usage:"), badFlag.stderr);
});
