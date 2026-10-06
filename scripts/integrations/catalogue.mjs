import { readFileSync } from "node:fs";
export const cataloguePath = new URL(
  "../../packages/ui/src/lib/service-catalogue.json",
  import.meta.url
);
export function readCatalogue() {
  return JSON.parse(readFileSync(cataloguePath, "utf8"));
}
const SHARED_SENTRY_APPS = new Set([
  "elections",
  "auth",
  "gaa-admin",
  "docs",
  "gms",
  "signal",
  "mbia",
  "events",
  "cms",
  "api",
  "worker",
]);
const GA_ID = /^G-[A-Z0-9]+$/;
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: flat catalogue validation keeps all deployment invariants together.
export function validateCatalogue(catalogue) {
  const failures = [];
  const ids = new Set();
  const destinations = new Map();
  for (const service of catalogue.services) {
    if (ids.has(service.id)) failures.push(`Duplicate service: ${service.id}`);
    ids.add(service.id);
    for (const environment of ["development", "staging", "production"]) {
      const entry = service.environments[environment];
      if (!entry) {
        failures.push(`Missing environment: ${service.id}/${environment}`);
        continue;
      }
      if (
        entry.sentry.secretRef &&
        (!(
          SHARED_SENTRY_APPS.has(service.id) &&
          ["staging", "production"].includes(environment)
        ) ||
          entry.sentry.secretRef !==
            `SENTRY_DSN_${environment.toUpperCase()}` ||
          entry.sentry.project !== `grenmet-${environment}` ||
          entry.sentry.dsn)
      )
        failures.push(
          `Invalid shared Sentry routing: ${service.id}/${environment}`
        );
      const analytics = entry.analytics;
      const label = `${service.id}/${environment}`;
      if (environment !== "production" && (analytics.ga4 || analytics.posthog))
        failures.push(`Non-production analytics: ${label}`);
      if (!service.publicAnalytics && (analytics.ga4 || analytics.posthog))
        failures.push(`Non-public analytics: ${label}`);
      if (
        (analytics.ga4 || analytics.posthog) &&
        !(analytics.retentionVerified && analytics.accessVerified)
      )
        failures.push(`Unverified governance: ${label}`);
      if (
        environment === "staging" &&
        entry.origin &&
        !new URL(entry.origin).hostname.includes("staging")
      )
        failures.push(`Staging origin: ${label}`);
      if (analytics.ga4 && !GA_ID.test(analytics.ga4))
        failures.push(`Invalid GA4 ID: ${label}`);
      if (
        analytics.posthog &&
        !["https://us.i.posthog.com", "https://eu.i.posthog.com"].includes(
          analytics.posthog.host
        )
      )
        failures.push(`Invalid PostHog host: ${label}`);
      for (const [provider, destination] of [
        ["ga4", analytics.ga4],
        ["posthog", analytics.posthog?.key],
        ["sentry", entry.sentry.dsn],
      ]) {
        if (!destination) continue;
        const key = `${provider}/${destination}`;
        if (destinations.has(key))
          failures.push(
            `Shared provider destination: ${destinations.get(key)} and ${label}`
          );
        destinations.set(key, label);
      }
      for (const coverage of [analytics, entry.sentry, entry.availability]) {
        if (
          coverage.status === "delivery-verified" &&
          !coverage.deliveryEvidence?.length
        )
          failures.push(`Missing delivery evidence: ${label}`);
      }
    }
  }
  return failures;
}
