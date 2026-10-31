import { readFileSync, statSync } from "node:fs";
import { connect } from "node:tls";
import { observation } from "./audit-checks.mjs";

export const DAILY_SOURCES = [
  "sentry",
  "eregister-sends",
  "wis2-sends",
  "worker-jobs",
  "notification-sweeps",
  "secrets",
  "backups",
];
// Several sources share one issue: both send targets and both worker counters.
export const DAILY_ROOT_CAUSES = {
  "coverage:daily:eregister-sends": "coverage:daily:delivery-monitoring",
  "coverage:daily:wis2-sends": "coverage:daily:delivery-monitoring",
  "coverage:daily:worker-jobs": "coverage:daily:worker-telemetry",
  "coverage:daily:notification-sweeps": "coverage:daily:worker-telemetry",
};
// Accepted provenance for Sentry receipts: the Sentry MCP adapter on the WSL
// host, or the read-only API collector on the droplet runners.
const SENTRY_PROVENANCE = new Set(["sentry-mcp", "sentry-api"]);
// With `dailySources: "runner"` the droplet runners own these sources and this
// host must not publish them, or the two paths would reopen each other's issues.
export function runnerOwnsDailySources(config) {
  return config?.dailySources === "runner";
}
function gap(source) {
  return observation(
    `coverage:daily:${source}`,
    `Daily ${source} monitoring needs configuration`,
    "fail",
    `read-only ${source} collector`,
    "No fresh, complete aggregate observation is available. Configure a read-only collector; never export event payloads, credentials, email addresses or personal data.",
    "normal",
    "owner"
  );
}
// Aggregate receipts are produced by trusted read-only adapters, including the Sentry MCP.
// A receipt is scoped to both environments, timestamped, and contains counts only.
export function aggregateReceipt(source, receipt, now = Date.now()) {
  if (
    receipt?.source !== source ||
    receipt.complete !== true ||
    !Number.isFinite(Date.parse(receipt.observedAt)) ||
    now - Date.parse(receipt.observedAt) > 26 * 3_600_000 ||
    Date.parse(receipt.observedAt) > now ||
    (source === "sentry" && !SENTRY_PROVENANCE.has(receipt.via))
  )
    return [gap(source)];
  const results = [];
  for (const environment of ["staging", "production"]) {
    const data = receipt.environments?.[environment];
    if (!(data && Number.isSafeInteger(data.failures)) || data.failures < 0)
      return [gap(source)];
    results.push(
      observation(
        `daily:${source}:${environment}`,
        `${environment} ${source} needs attention`,
        data.failures ? "fail" : "pass",
        `read-only aggregate collector: ${source}`,
        "Reported failures: " +
          data.failures +
          ". Source data remains private.",
        source === "secrets" ? "high" : "normal",
        source === "secrets" || source === "backups" ? "owner" : "Claude"
      )
    );
  }
  results.push(
    observation(
      `coverage:daily:${source}`,
      `Daily ${source} monitoring needs configuration`,
      "pass",
      `read-only aggregate collector: ${source}`,
      "Complete fresh counts are available for staging and production.",
      "normal",
      "owner"
    )
  );
  return results;
}
export function readAggregate(source, path, now) {
  try {
    const stat = statSync(path);
    if (!stat.isFile() || stat.size > 65_536 || stat.mode % 64)
      return [gap(source)];
    return aggregateReceipt(
      source,
      JSON.parse(readFileSync(path, "utf8")),
      now
    );
  } catch {
    return [gap(source)];
  }
}
function operationalReceipts(config, now) {
  if (runnerOwnsDailySources(config)) return [];
  return DAILY_SOURCES.flatMap((source) =>
    readAggregate(source, config.receipts?.[source], now)
  );
}
export function certificateDays(host, now = Date.now()) {
  return new Promise((resolve) => {
    const socket = connect(
      { host, port: 443, servername: host, rejectUnauthorized: true },
      () => {
        const until = Date.parse(socket.getPeerCertificate().valid_to);
        socket.end();
        resolve(Number.isFinite(until) ? (until - now) / 86_400_000 : null);
      }
    );
    socket.setTimeout(15_000, () => socket.destroy(new Error("timeout")));
    socket.on("error", () => resolve(null));
  });
}
export async function daily({
  config,
  now = Date.now(),
  fetchHttp = fetch,
  daysRemaining = certificateDays,
}) {
  const results = [];
  for (const environment of ["staging", "production"]) {
    const endpoints = config.endpoints?.[environment] ?? [];
    if (!endpoints.length) results.push(gap(`${environment}-health`));
    for (let index = 0; index < endpoints.length; index++) {
      let url;
      try {
        url = new URL(endpoints[index]);
        if (
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          url.search ||
          url.hash
        )
          throw new Error("Only credential-free HTTPS endpoints are allowed");
      } catch {
        results.push(gap(`${environment}-endpoint-${index}`));
        continue;
      }
      let healthy = false;
      try {
        const response = await fetchHttp(url, {
          method: "GET",
          redirect: "error",
          signal: AbortSignal.timeout(15_000),
        });
        healthy = response.ok;
        await response.body?.cancel();
      } catch {
        /* The failed probe or exited process is handled by its result. */
      }
      results.push(
        observation(
          `health:${environment}:${index}`,
          `${environment} health probe ${index} failed`,
          healthy ? "pass" : "fail",
          `HTTPS GET configured health/readiness endpoint ${index}`,
          healthy
            ? "HTTP response successful."
            : "No successful HTTP response; response payload deliberately excluded.",
          environment === "production" ? "high" : "normal",
          "owner"
        )
      );
      const days = await daysRemaining(url.hostname, now);
      results.push(
        observation(
          `certificate:${environment}:${index}`,
          `${environment} certificate needs attention`,
          days === null || days <= 21 ? "fail" : "pass",
          `TLS certificate verification for configured endpoint ${index}`,
          days === null
            ? "Certificate verification unavailable."
            : `Certificate valid for ${Math.floor(days)} more days.`,
          "high",
          "owner"
        )
      );
    }
  }
  results.push(...operationalReceipts(config, now));
  return results;
}
