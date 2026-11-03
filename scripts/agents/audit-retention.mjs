import {
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { join, sep } from "node:path";

const RUN_NAME = /^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d\.\d{3}Z-[a-f0-9-]{36}$/u;
const OUTPUT =
  /^(?:owned-run\.json|observations\.json|source-risks\.json|checkout-retained\.txt|[a-zA-Z0-9_.-]+\.log(?:\.\d+)?|(?:sentry|eregister-sends|wis2-sends|worker-jobs|notification-sweeps|secrets|backups)\.json)$/u;
export function pruneEvidence(directory, now = Date.now()) {
  const root = realpathSync(directory);
  const runs = [];
  for (const name of readdirSync(root)) {
    if (!RUN_NAME.test(name)) continue;
    const path = join(root, name);
    if (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink())
      continue;
    try {
      const marker = JSON.parse(
        readFileSync(join(path, "owned-run.json"), "utf8")
      );
      if (
        marker.owner !== "grenmet-advisory-audit" ||
        marker.version !== 1 ||
        !Number.isFinite(Date.parse(marker.createdAt))
      )
        continue;
      const files = readdirSync(path);
      if (
        files.some(
          (file) =>
            !(OUTPUT.test(file) && lstatSync(join(path, file)).isFile()) ||
            lstatSync(join(path, file)).isSymbolicLink()
        )
      )
        continue;
      runs.push({ path, time: Date.parse(marker.createdAt) });
    } catch {
      /* Preserve unrecognized or incomplete directories. */
    }
  }
  runs.sort((left, right) => right.time - left.time);
  const removed = [];
  for (const [index, run] of runs.entries()) {
    if (index < 100 && now - run.time <= 14 * 86_400_000) continue;
    if (!realpathSync(run.path).startsWith(root + sep))
      throw new Error("Evidence path escaped its private directory");
    rmSync(run.path, { recursive: true });
    removed.push(run.path);
  }
  return removed.length;
}
