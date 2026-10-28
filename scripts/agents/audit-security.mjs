import { createHash } from "node:crypto";

const NORMALIZE_PACKAGE = /[-_.]+/g;
const VERSION_CLAUSE = /^(>=|<=|>|<|==|=|!=)\s*(\d+(?:\.\d+)*)$/;
const UV_NAME = /^name = "([^"]+)"$/m;
const UV_VERSION = /^version = "([^"]+)"$/m;
const REQUIREMENTS_FILE = /requirements[^/]*\.txt$/;
const REQUIREMENT_PIN = /^\s*([\w.-]+)(?:\[[^\]]+\])?==([^\s;\\]+)/;
const PNPM_KEY = /^ {2}'?(.+)@([^:'()]+)(?:\([^']*\))?'?:\s*$/;
const TRIVY_PACKAGE = /^Package: ([\w.+-]+)$/m;
const TRIVY_SEVERITY = /^Severity: (CRITICAL|HIGH|MEDIUM|LOW|UNKNOWN)$/m;
const TRIVY_FIXED = /^Fixed Version:([^\r\n]*)/m;
const CVE_ID = /^CVE-\d{4}-\d+$/;
const FIXED_VERSION = /^[\w.+:~,-]+$/;

const normalize = (name) => name.toLowerCase().replace(NORMALIZE_PACKAGE, "-");
const numericVersion = /^\d+(?:\.\d+)*$/;
const packageName = /^[a-zA-Z0-9@/_.+-]+$/;
const manifestPath = /^[a-zA-Z0-9/_.-]+$/;
const rank = { low: 0, moderate: 1, medium: 1, high: 2, critical: 3 };
export const groupKey = (name, manifest) =>
  `security:dependabot:group:${createHash("sha256")
    .update(JSON.stringify([normalize(name), manifest]))
    .digest("hex")
    .slice(0, 24)}`;

// Fail open for reporting: unfamiliar syntax, ranges and prereleases are never
// evidence of a fix. Every resolved version must be at least the patched release.
export function atLeast(version, fixed) {
  if (!(numericVersion.test(version) && numericVersion.test(fixed)))
    return false;
  const a = version.split(".").map(Number);
  const b = fixed.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
}
// GitHub pip ranges are comma-separated intersections. Unknown constraints do
// not prove safety. Check this as well as the first patched release because a
// later release line may be vulnerable again.
export function outsideVulnerableRange(version, range) {
  if (!range) return true;
  const clauses = range
    .split(",")
    .map((part) => part.trim().match(VERSION_CLAUSE));
  if (clauses.some((clause) => !clause)) return false;
  const affected = clauses.every(([, operator, boundary]) => {
    const ge = atLeast(version, boundary);
    const le = atLeast(boundary, version);
    if (operator === ">=") return ge;
    if (operator === "<=") return le;
    if (operator === ">") return ge && !le;
    if (operator === "<") return le && !ge;
    if (operator === "!=") return !(ge && le);
    return ge && le;
  });
  return !affected;
}
export function resolvedVersions(text, manifest, name) {
  const versions = [];
  if (manifest.endsWith("uv.lock")) {
    for (const block of text.split("[[package]]").slice(1)) {
      const pkg = block.match(UV_NAME)?.[1];
      const version = block.match(UV_VERSION)?.[1];
      if (pkg && normalize(pkg) === normalize(name) && version)
        versions.push(version);
    }
  } else if (REQUIREMENTS_FILE.test(manifest)) {
    for (const line of text.split("\n")) {
      const match = line.match(REQUIREMENT_PIN);
      if (match && normalize(match[1]) === normalize(name))
        versions.push(match[2]);
    }
  } else if (manifest.endsWith("pnpm-lock.yaml")) {
    // Package keys under packages/snapshots; includes every installed version.
    for (const line of text.split("\n")) {
      const match = line.match(PNPM_KEY);
      if (match && match[1] === name) versions.push(match[2]);
    }
  } else if (manifest.endsWith("package.json")) {
    const pkg = JSON.parse(text);
    for (const field of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
    ])
      if (pkg[field]?.[name]) versions.push(pkg[field][name]);
  }
  return [...new Set(versions)];
}

export async function dependencyObservations(alerts, readDevFile = () => "") {
  const groups = new Map();
  const files = new Map();
  for (const alert of alerts) {
    if (!Number.isSafeInteger(alert.number)) continue;
    const name = alert.dependency?.package?.name;
    const manifest = alert.dependency?.manifest_path;
    if (
      !(
        name &&
        manifest &&
        packageName.test(name) &&
        manifestPath.test(manifest)
      ) ||
      manifest.split("/").includes("..")
    )
      throw new Error("Unrecognized dependency identity");
    const key = groupKey(name, manifest);
    if (!groups.has(key)) groups.set(key, { key, name, manifest, alerts: [] });
    groups.get(key).alerts.push(alert);
  }
  const result = [];
  for (const group of groups.values()) {
    const { key, name, manifest } = group;
    if (!files.has(manifest)) files.set(manifest, await readDevFile(manifest));
    const versions = resolvedVersions(files.get(manifest), manifest, name);
    const open = group.alerts.filter((a) => a.state === "open");
    const fixed = open.filter((a) => {
      const patched =
        a.security_vulnerability?.first_patched_version?.identifier;
      return (
        patched &&
        versions.length &&
        versions.every(
          (v) =>
            atLeast(v, patched) &&
            outsideVulnerableRange(
              v,
              a.security_vulnerability?.vulnerable_version_range
            )
        )
      );
    });
    const outstanding = open.filter((a) => !fixed.includes(a));
    let trackingIssue;
    if (manifest === "surface/api/requirements.txt") trackingIssue = 722;
    else if (
      (manifest === "uv.lock" &&
        ["brotlicffi", "filelock", "twisted", "gdal"].includes(
          normalize(name)
        )) ||
      (manifest === "geonetcast/pyproject.toml" && normalize(name) === "gdal")
    )
      trackingIssue = 733;
    else if (open.length && !outstanding.length) trackingIssue = 721;
    const numbers = open.map((a) => a.number).sort((a, b) => a - b);
    const severity = outstanding.reduce(
      (best, a) =>
        (rank[a.security_advisory?.severity] ?? 1) > rank[best]
          ? a.security_advisory.severity
          : best,
      "low"
    );
    result.push({
      key,
      title: `Dependency advisories: ${name} in ${manifest}`,
      status: outstanding.length ? "fail" : "pass",
      severity: rank[severity] >= 2 ? "high" : "normal",
      owner: "Claude",
      command: `gh api repos/Marcus100/grenmet/dependabot/alerts --paginate; git show origin/dev:${manifest}`,
      summary: `${name} in ${manifest}. Open alert numbers: ${numbers.join(", ") || "none"}. Needs action: ${
        outstanding
          .map((a) => a.number)
          .sort((a, b) => a - b)
          .join(", ") || "none"
      }. Fixed on origin/dev: ${
        fixed
          .map((a) => a.number)
          .sort((a, b) => a - b)
          .join(", ") || "none"
      }; resolved versions: ${versions.join(", ") || "not confirmed"}. Dependabot scans main; fixes on dev await release.`,
      alertNumbers: group.alerts.map((a) => a.number),
      openAlertNumbers: numbers,
      trackingIssue,
    });
  }
  return result;
}

export function trivyObservation(alerts) {
  const open = alerts.filter((a) => a.state === "open");
  const groups = new Map();
  const cves = new Set();
  const otherFindings = new Set();
  for (const alert of open) {
    const message = alert.most_recent_instance?.message?.text ?? "";
    const name = message.match(TRIVY_PACKAGE)?.[1] ?? "unknown";
    const severity = message.match(TRIVY_SEVERITY)?.[1] ?? "UNKNOWN";
    const fixed = message.match(TRIVY_FIXED)?.[1]?.trim();
    const cve = CVE_ID.test(alert.rule?.id)
      ? alert.rule.id
      : `alert ${alert.number}`;
    if (CVE_ID.test(alert.rule?.id)) cves.add(cve);
    else otherFindings.add(alert.rule?.id ?? cve);
    const key = `${severity} / ${name}`;
    if (!groups.has(key)) groups.set(key, []);
    groups
      .get(key)
      .push(
        `${cve} (${fixed && FIXED_VERSION.test(fixed) ? `fixed: ${fixed}` : "no fixed version reported"})`
      );
  }
  return {
    key: "security:code-scanning:trivy-main-docker",
    alertNumbers: alerts.map((a) => a.number),
    alertSource: "code-scanning",
    title: "Trivy main Docker image vulnerabilities (Debian 12)",
    status: open.length ? "fail" : "pass",
    severity: "high",
    owner: "Claude",
    command: "gh api repos/Marcus100/grenmet/code-scanning/alerts --paginate",
    summary: `${open.length} open Trivy alerts, ${cves.size} distinct CVEs, ${otherFindings.size} non-CVE findings in main's ci-api.yml docker scan (Debian 12 base). This is main scan evidence, not proof of dev exposure; rescan dev before remediation. `,
    details: [...groups]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([key, entries]) =>
          `${key}: ${[...new Set(entries)].sort().join(", ")}.`
      ),
  };
}
