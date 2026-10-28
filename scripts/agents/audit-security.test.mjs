import assert from "node:assert/strict";
import test from "node:test";
import {
  atLeast,
  dependencyObservations,
  groupKey,
  resolvedVersions,
  trivyObservation,
} from "./audit-security.mjs";
import { consolidateLegacy, updateTrackers } from "./audit-security-report.mjs";

const alert = (
  number,
  name = "pillow",
  manifest = "uv.lock",
  fixed = "13.0.0"
) => ({
  number,
  state: "open",
  dependency: { package: { name }, manifest_path: manifest },
  security_advisory: { severity: "high" },
  security_vulnerability: {
    first_patched_version: fixed ? { identifier: fixed } : null,
  },
});
const lock = (name, version) =>
  `[[package]]\nname = "${name}"\nversion = "${version}"\n`;
test("groups all advisories by normalized package and exact manifest, retaining every alert", async () => {
  const observations = await dependencyObservations([
    alert(2),
    alert(1, "Pillow"),
    alert(3, "pillow", "surface/api/requirements.txt"),
  ]);
  assert.equal(observations.length, 2);
  assert.equal(observations[0].key, groupKey("pillow", "uv.lock"));
  assert.deepEqual(observations[0].openAlertNumbers, [1, 2]);
  assert.equal(observations[1].trackingIssue, 722);
  assert.equal(observations[0].trackingIssue, undefined);
});
test("fixed dev versions suppress new issues, while mixed versions and missing fixes remain actionable", async () => {
  const fixed = await dependencyObservations(
    [alert(1), alert(2, "filelock", "uv.lock", "4.2.1")],
    () => lock("pillow", "13.0.0") + lock("filelock", "4.2.4")
  );
  assert.deepEqual(
    fixed.map((i) => [i.status, i.trackingIssue]),
    [
      ["pass", 721],
      ["pass", 733],
    ]
  );
  const mixed = await dependencyObservations(
    [alert(1), alert(2, "pillow", "uv.lock", null)],
    () => lock("pillow", "13.0.0") + lock("pillow", "12.0.0")
  );
  assert.equal(mixed[0].status, "fail");
  assert.equal(mixed[0].trackingIssue, undefined);
  assert.equal(atLeast("26.10.0rc1", "26.10.0"), false);
  assert.equal(atLeast("4.2.4", "4.2.1"), true);
  assert.equal(atLeast("1.2.1.0", "1.2.1"), true);
  assert.deepEqual(
    resolvedVersions(
      "pillow==13.0.0\n",
      "surface/api/requirements.txt",
      "Pillow"
    ),
    ["13.0.0"]
  );
  assert.deepEqual(
    resolvedVersions(
      "packages:\n  '@scope/pkg@2.0.0':\n  '@scope/pkg@1.0.0':\n",
      "pnpm-lock.yaml",
      "@scope/pkg"
    ),
    ["2.0.0", "1.0.0"]
  );
});
test("tracker comments are change-only, once per UTC day, and survive publisher restart", async () => {
  const comments = [];
  const calls = [];
  const runGh = (args) => {
    calls.push(args);
    if (args[0] === "issue") {
      comments.push({
        user: { login: "bot" },
        created_at: "2026-10-26T12:00:00Z",
        body: args.at(-1),
      });
      return "";
    }
    if (args.at(-1).includes("comments")) return [comments];
    return { state: "open" };
  };
  const options = {
    observations: await dependencyObservations([
      alert(1, "pillow", "surface/api/requirements.txt"),
    ]),
    runGh,
    repo: "Marcus100/grenmet",
    login: "bot",
    observedAt: "2026-10-26T12:00:00Z",
    safeText: (x) => x,
  };
  await updateTrackers(options);
  await updateTrackers(options);
  options.observations[0].openAlertNumbers.push(2);
  await updateTrackers(options);
  assert.equal(calls.filter((c) => c[0] === "issue").length, 1);
  options.observedAt = "2026-10-27T12:00:00Z";
  await updateTrackers(options);
  assert.equal(calls.filter((c) => c[0] === "issue").length, 2);
  await assert.rejects(() =>
    updateTrackers({ ...options, runGh: () => ({ state: "closed" }) })
  );
});
test("legacy closure requires own generated issue and a real replacement; capped groups stay open", async () => {
  const item = (await dependencyObservations([alert(1)]))[0];
  const issue = {
    number: 100,
    title: "Open dependabot alert 1",
    body: "## Advisory audit observation\n\n<!-- codex-audit:0123456789abcdef -->",
    user: { login: "bot" },
    state: "open",
  };
  const calls = [];
  const result = { closed: [] };
  const options = {
    observations: [item],
    issues: [issue, { ...issue, number: 101, user: { login: "human" } }],
    targets: new Map(),
    matchingIssues: () => [],
    runGh: (a) => calls.push(a),
    repo: "Marcus100/grenmet",
    login: "bot",
    result,
  };
  await consolidateLegacy(options);
  assert.equal(calls.length, 0);
  options.targets.set(item.key, 721);
  await consolidateLegacy(options);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].at(-1).includes("/issues/721"));
  assert.deepEqual(result.closed, [{ key: item.key, issueNumber: 100 }]);
});
test("Trivy summary combines CVEs by severity and package and identifies unavailable fixes", () => {
  const trivy = (number, pkg, fixed) => ({
    number,
    state: "open",
    rule: { id: "CVE-2026-12345" },
    most_recent_instance: {
      message: {
        text: `Package: ${pkg}\nSeverity: HIGH\nFixed Version: ${fixed}`,
      },
    },
  });
  const summary = trivyObservation([
    trivy(1, "curl", ""),
    trivy(2, "curl", ""),
    trivy(3, "libcurl4", "1.2"),
  ]);
  assert.ok(summary.summary.includes("3 open Trivy alerts, 1 distinct CVEs"));
  assert.ok(
    summary.details
      .join(" ")
      .includes("HIGH / curl: CVE-2026-12345 (no fixed version reported)")
  );
  assert.ok(
    summary.details
      .join(" ")
      .includes("HIGH / libcurl4: CVE-2026-12345 (fixed: 1.2)")
  );
});

test("successful empty dependency scan clears prior tracker snapshot, failed coverage does not", async () => {
  const calls = [];
  const options = {
    observations: [{ key: "coverage:dependabot", status: "fail" }],
    repo: "Marcus100/grenmet",
    login: "bot",
    observedAt: "2026-10-27T12:00:00Z",
    safeText: (x) => x,
    runGh: (args) => {
      calls.push(args);
      if (args[0] === "issue") return "";
      if (args.at(-1).includes("comments"))
        return [
          [
            {
              user: { login: "bot" },
              created_at: "2026-10-26T12:00:00Z",
              body: "<!-- codex-audit-tracker:721:old -->",
            },
          ],
        ];
      return { state: "open" };
    },
  };
  await updateTrackers(options);
  assert.equal(calls.length, 0);
  options.observations[0].status = "pass";
  await updateTrackers(options);
  assert.equal(calls.filter((a) => a[0] === "issue").length, 1);
  assert.ok(
    calls
      .find((a) => a[0] === "issue")
      .at(-1)
      .includes("No open dependency alerts")
  );
});
test("Trivy consolidation does not close another scanner's alert or Dependabot with the same number", async () => {
  const item = trivyObservation([
    { number: 9, state: "open", rule: { id: "CVE-2026-12345" } },
  ]);
  const base = {
    body: "## Advisory audit observation\n\n<!-- codex-audit:0123456789abcdef -->",
    user: { login: "bot" },
    state: "open",
  };
  const calls = [];
  await consolidateLegacy({
    observations: [item],
    issues: [
      { ...base, number: 40, title: "Open code-scanning alert 9" },
      { ...base, number: 41, title: "Open dependabot alert 9" },
      { ...base, number: 42, title: "Open code-scanning alert 10" },
    ],
    targets: new Map(),
    matchingIssues: () => [{ number: 50, state: "open" }],
    runGh: (a) => calls.push(a),
    repo: "Marcus100/grenmet",
    login: "bot",
    result: { closed: [] },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2], "40");
});

test("existing GDAL tracker also covers the geonetcast manifest", async () => {
  const observations = await dependencyObservations([
    alert(115, "gdal", "geonetcast/pyproject.toml", "3.13.0"),
  ]);
  assert.equal(observations[0].trackingIssue, 733);
  assert.equal(observations[0].status, "fail");
});

test("Trivy counts only CVE identifiers while preserving other vulnerability findings", () => {
  const observations = [
    { number: 1, state: "open", rule: { id: "CVE-2026-12345" } },
    { number: 2, state: "open", rule: { id: "CVE-2026-12345" } },
    { number: 3, state: "open", rule: { id: "TEMP-0841856-B18BAF" } },
    { number: 4, state: "fixed", rule: { id: "CVE-2025-99999" } },
  ];
  const report = trivyObservation(observations);
  assert.ok(
    report.summary.includes(
      "3 open Trivy alerts, 1 distinct CVEs, 1 non-CVE finding"
    )
  );
  assert.ok(report.details.join(" ").includes("alert 3"));
  assert.deepEqual(report.alertNumbers, [1, 2, 3, 4]);
});
