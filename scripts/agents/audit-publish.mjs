#!/usr/bin/env node
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { command } from "./audit-process.mjs";
import { publishObservations } from "./audit-report.mjs";

export async function publishReport(path, publish) {
  const stat = statSync(path);
  if (!stat.isFile() || stat.size > 4_000_000 || stat.mode % 64)
    throw new Error("Expected a private aggregate report");
  const report = JSON.parse(readFileSync(path, "utf8"));
  return await publishObservations({
    ...report,
    repo: "Marcus100/grenmet",
    dryRun: !publish,
    runGh: async (args) => {
      const result = await command(["gh", ...args], {
        timeout: 120_000,
        captureLimit: 16_000_000,
      });
      if (result.code !== 0) throw new Error("Issue publication unavailable");
      return result.stdout.trim();
    },
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const { values } = parseArgs({
    options: { input: { type: "string" }, publish: { type: "boolean" } },
  });
  publishReport(values.input, values.publish)
    .then((result) => console.log(JSON.stringify(result)))
    .catch(() => {
      console.error(
        "Audit issue publication unavailable; private evidence retained."
      );
      process.exitCode = 1;
    });
}
