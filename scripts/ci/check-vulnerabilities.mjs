import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const utcTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const wildcard = /[?*]/;
const severities = new Set(["UNKNOWN", "LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const text = (value) => typeof value === "string" && value.trim().length > 0;
const key = (item) =>
  JSON.stringify([
    item.scope,
    item.vulnerability,
    item.package,
    item.installedVersion,
  ]);
function timestamp(value) {
  assert.ok(
    typeof value === "string" && utcTimestamp.test(value),
    "Exception timestamps must be UTC ISO timestamps"
  );
  const date = new Date(value);
  assert.ok(
    Number.isFinite(date.getTime()) &&
      date.toISOString() === value.replace("Z", ".000Z"),
    "Invalid exception timestamp"
  );
  return date.getTime();
}
function validateExceptions(policy, now) {
  assert.ok(
    policy?.schemaVersion === 1 && Array.isArray(policy.exceptions),
    "Invalid exception policy"
  );
  const exceptions = new Map();
  for (const item of policy.exceptions) {
    for (const field of [
      "scope",
      "vulnerability",
      "package",
      "installedVersion",
      "reason",
      "owner",
    ]) {
      assert.ok(text(item?.[field]), `Exception requires ${field}`);
    }
    for (const field of [
      "scope",
      "vulnerability",
      "package",
      "installedVersion",
    ])
      assert.ok(
        !wildcard.test(item[field]),
        "Wildcard exceptions are forbidden"
      );
    const start = timestamp(item.reviewedAt);
    const end = timestamp(item.expiresAt);
    assert.ok(
      start <= now.getTime() &&
        end > now.getTime() &&
        end > start &&
        end - start <= 14 * 86_400_000,
      "Exception expired, future-dated, or longer than 14 days"
    );
    assert.ok(!exceptions.has(key(item)), "Duplicate exception");
    exceptions.set(key(item), item);
  }
  return exceptions;
}
export function evaluate(report, policy, scope, now = new Date()) {
  assert.ok(text(scope) && Number.isFinite(now.getTime()));
  const exceptions = validateExceptions(policy, now);
  assert.ok(
    report?.SchemaVersion === 2 &&
      report.ArtifactType === "container_image" &&
      Array.isArray(report.Results) &&
      report.Results.length > 0,
    "Missing or unsupported image scan report"
  );
  const blocked = [];
  const excepted = [];
  let reported = 0;
  for (const result of report.Results) {
    assert.ok(
      text(result?.Target) && text(result.Type),
      "Malformed scan target"
    );
    assert.ok(
      result.Vulnerabilities === undefined ||
        Array.isArray(result.Vulnerabilities),
      "Malformed vulnerability list"
    );
    for (const finding of result.Vulnerabilities ?? []) {
      assert.ok(
        text(finding?.VulnerabilityID) &&
          text(finding.PkgName) &&
          text(finding.InstalledVersion) &&
          severities.has(finding.Severity),
        "Malformed vulnerability finding"
      );
      assert.ok(
        finding.FixedVersion === undefined ||
          typeof finding.FixedVersion === "string",
        "Malformed fixed version"
      );
      reported += 1;
      if (
        !(
          ["HIGH", "CRITICAL"].includes(finding.Severity) &&
          finding.FixedVersion?.trim()
        )
      )
        continue;
      const item = {
        scope,
        vulnerability: finding.VulnerabilityID,
        package: finding.PkgName,
        installedVersion: finding.InstalledVersion,
        fixedVersion: finding.FixedVersion,
        target: result.Target,
      };
      const exception = exceptions.get(key(item));
      if (exception)
        excepted.push({
          ...item,
          owner: exception.owner,
          reason: exception.reason,
          expiresAt: exception.expiresAt,
        });
      else blocked.push(item);
    }
  }
  return { reported, blocked, excepted };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [
      reportPath,
      scope,
      policyPath = ".github/security/vulnerability-exceptions.json",
    ] = process.argv.slice(2);
    const result = evaluate(
      JSON.parse(readFileSync(reportPath, "utf8")),
      JSON.parse(readFileSync(policyPath, "utf8")),
      scope
    );
    console.log(JSON.stringify(result, null, 2));
    if (result.blocked.length) process.exitCode = 1;
  } catch (error) {
    console.error(`Vulnerability gate failed: ${error.message}`);
    process.exitCode = 1;
  }
}
