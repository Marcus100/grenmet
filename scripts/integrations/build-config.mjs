import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { readCatalogue, validateCatalogue } from "./catalogue.mjs";
export function buildConfig(
  app,
  environment,
  catalogue = readCatalogue(),
  secrets = {}
) {
  const failures = validateCatalogue(catalogue);
  if (failures.length) throw new Error(failures.join("; "));
  const entry = catalogue.services.find((s) => s.id === app)?.environments[
    environment
  ];
  if (!entry) throw new Error("Unknown app or environment");
  return {
    sentry_dsn: entry.sentry.secretRef
      ? (secrets[entry.sentry.secretRef] ?? "")
      : (entry.sentry.dsn ?? ""),
    sentry_project: entry.sentry.project ?? "",
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = buildConfig(
    process.argv[2],
    process.argv[3],
    readCatalogue(),
    process.env
  );
  if (!process.env.GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT is required");
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(result)
      .map(([k, v]) => `${k}=${v}\n`)
      .join("")
  );
}
