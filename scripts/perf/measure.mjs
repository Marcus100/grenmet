import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const targets = [
  ["api", "/api/v1/utils/health-check/"],
  ["api", "/api/cap/latest-active"],
  ["api", "/api/cap/alerts"],
  ["api", "/api/cap/active-map"],
  ["gms", "/"],
  ["gms", "/news"],
  ["admin", "/"],
  ["admin", "/hr"],
];

const help = `Usage: node scripts/perf/measure.mjs [options]
  --api URL          FastAPI origin (default host:8000)
  --gms URL          GMS origin (default host:3003)
  --admin URL        gaa-admin origin (default host:3001)
  --cookie-file PATH Netscape cookie file, sent only to admin targets
  --samples N        Repeated requests after the first (default 5)
  --timeout N        Per-request timeout in seconds (default 30)
  --save PATH        Save JSON baseline/results
  --compare PATH     Print deltas against compatible saved results
  --help             Show this help

Host defaults to host.docker.internal in a devcontainer, localhost otherwise.
Each request starts a new curl process negotiating compression; redirects are
reported, never followed. First means first observed, NOT a proven cold cache.
Repeated rows show medians; raw samples are saved for further analysis.
TTFB/total measure HTTP only, not browser paint, navigation, or action latency.
Without --cookie-file admin targets are skipped. Use a host-matching cookie
file for a test account; cookies and response bodies are never saved.

Example:
  node scripts/perf/measure.mjs --save /tmp/perf-before.json
  node scripts/perf/measure.mjs --compare /tmp/perf-before.json --save /tmp/perf-after.json
`;

function positiveNumber(value, integer = false) {
  const number = Number(value);
  if (
    !Number.isFinite(number) ||
    number <= 0 ||
    (integer && !Number.isInteger(number))
  ) {
    throw new Error(
      "Samples and timeout must be positive numbers (samples an integer)"
    );
  }
  return number;
}

function origin(value) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error(
      "Service URLs must be HTTP(S) origins without credentials, paths, or query strings"
    );
  }
  return url.origin;
}

export async function request(url, { timeout, cookieFile }) {
  const args = [
    "--disable",
    "--silent",
    "--compressed",
    "--max-time",
    String(timeout),
    "--output",
    "/dev/null",
    "--write-out",
    "%{json}",
  ];
  if (cookieFile) args.push("--cookie", cookieFile);
  args.push("--url", url);
  return await new Promise((resolve, reject) => {
    const child = spawn("curl", args, { stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", () =>
      reject(
        new Error(
          "Could not start curl; install curl with JSON write-out support"
        )
      )
    );
    child.on("close", (exitCode) => {
      let data;
      try {
        data = JSON.parse(output);
      } catch {
        reject(new Error("curl did not return JSON timing data"));
        return;
      }
      resolve({
        status: data.http_code,
        redirected: Boolean(data.redirect_url),
        ttfbMs: data.time_starttransfer * 1000,
        totalMs: data.time_total * 1000,
        bytes: data.size_download,
        exitCode,
      });
    });
  });
}

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function successful(sample) {
  return (
    sample.exitCode === 0 &&
    sample.status >= 200 &&
    sample.status < 300 &&
    !sample.redirected
  );
}

export function summarize(samples) {
  const valid = samples.length > 0 && samples.every(successful);
  return {
    status: [
      ...new Set(
        samples.map(
          (sample) =>
            `${sample.status}${sample.redirected ? " redirect" : ""}${sample.exitCode ? ` curl:${sample.exitCode}` : ""}`
        )
      ),
    ].join(", "),
    valid,
    ttfbMs: valid ? median(samples.map((sample) => sample.ttfbMs)) : null,
    totalMs: valid ? median(samples.map((sample) => sample.totalMs)) : null,
    bytes: valid ? median(samples.map((sample) => sample.bytes)) : null,
  };
}

function comparisonKey(report) {
  return JSON.stringify([
    report.version,
    report.origins,
    report.authenticated,
    report.samples,
    report.timeout,
    report.targets,
  ]);
}

function addDeltas(row, current, previous) {
  for (const [label, key] of [
    ["TTFB", "ttfbMs"],
    ["total", "totalMs"],
  ]) {
    row[`before ${label} ms`] = previous[key]?.toFixed(1) ?? "—";
    row[`Δ ${label} ms`] =
      current.valid && previous.valid
        ? (current[key] - previous[key]).toFixed(1)
        : "—";
  }
}

export function table(report, baseline) {
  if (baseline && comparisonKey(report) !== comparisonKey(baseline)) {
    throw new Error(
      "Baseline settings differ; use the same origins, auth mode, targets, sample count, and timeout"
    );
  }
  return report.results.flatMap((result, index) => {
    if (result.skipped)
      return [
        {
          target: result.target,
          phase: "skipped",
          status: "requires --cookie-file",
        },
      ];
    return ["first", "repeated"].map((phase) => {
      const select = (item) =>
        phase === "first" ? item.requests.slice(0, 1) : item.requests.slice(1);
      const current = summarize(select(result));
      const previous = baseline
        ? summarize(select(baseline.results[index]))
        : null;
      const row = {
        target: result.target,
        phase:
          phase === "first"
            ? "first observed"
            : `repeated (n=${report.samples})`,
        status: current.status,
        "TTFB ms": current.ttfbMs?.toFixed(1) ?? "—",
        "total ms": current.totalMs?.toFixed(1) ?? "—",
        "wire bytes": current.bytes ?? "—",
      };
      if (previous) addDeltas(row, current, previous);
      return row;
    });
  });
}

async function measureTargets(report, cookieFile) {
  for (const [service, path] of targets) {
    const result = { target: `${service}${path}`, requests: [] };
    if (service === "admin" && !cookieFile) result.skipped = true;
    else {
      console.error(
        `Measuring ${result.target} (${report.samples + 1} requests)…`
      );
      for (let index = 0; index <= report.samples; index++) {
        result.requests.push(
          await request(new URL(path, report.origins[service]).href, {
            timeout: report.timeout,
            cookieFile: service === "admin" ? cookieFile : undefined,
          })
        );
      }
    }
    report.results.push(result);
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      api: { type: "string" },
      gms: { type: "string" },
      admin: { type: "string" },
      "cookie-file": { type: "string" },
      samples: { type: "string", default: "5" },
      timeout: { type: "string", default: "30" },
      save: { type: "string" },
      compare: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(help);
    return;
  }
  const host = existsSync("/.dockerenv") ? "host.docker.internal" : "localhost";
  const origins = {
    api: origin(values.api ?? `http://${host}:8000`),
    gms: origin(values.gms ?? `http://${host}:3003`),
    admin: origin(values.admin ?? `http://${host}:3001`),
  };
  const samples = positiveNumber(values.samples, true);
  const timeout = positiveNumber(values.timeout);
  const cookieFile = values["cookie-file"];
  if (cookieFile) await readFile(cookieFile);
  const baseline = values.compare
    ? JSON.parse(await readFile(values.compare, "utf8"))
    : undefined;
  const report = {
    version: 1,
    capturedAt: new Date().toISOString(),
    origins,
    authenticated: Boolean(cookieFile),
    samples,
    timeout,
    targets,
    results: [],
  };
  if (baseline && comparisonKey(report) !== comparisonKey(baseline)) {
    throw new Error(
      "Baseline settings differ; use the same origins, auth mode, targets, sample count, and timeout"
    );
  }
  await measureTargets(report, cookieFile);
  console.log(
    "First observed is not necessarily cold. Repeated timings are medians. Negative deltas mean faster."
  );
  console.table(table(report, baseline));
  if (values.save)
    await writeFile(values.save, `${JSON.stringify(report, null, 2)}\n`, {
      mode: 0o600,
    });
  if (
    report.results.some((result) =>
      result.requests.some((sample) => !successful(sample))
    )
  )
    process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Measurement failed"
    );
    process.exitCode = 1;
  });
}
