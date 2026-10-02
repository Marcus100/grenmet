import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MASTER_CSV = /\/master_[^/]+\.csv$/;
const defaultRoot = fileURLToPath(new URL("../../", import.meta.url));

function files(root, folder, accept) {
  return readdirSync(path.join(root, folder), {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path
        .relative(root, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join("/")
    )
    .filter(accept);
}

/** Checks recorded inputs as well as outputs, including newly added/deleted files. */
export function checkHistory(root = defaultRoot) {
  const manifest = JSON.parse(
    readFileSync(path.join(root, "src/data/derived/manifest.json"), "utf8")
  );
  const errors = [];
  const inputs = [
    ...files(
      root,
      "src/data/source",
      (file) => file.endsWith(".json") && !file.endsWith("/campaign.json")
    ),
    ...files(
      root,
      "scripts/history",
      (file) => file.endsWith(".py") && !file.includes("/__pycache__/")
    ),
  ];
  const outputs = [
    ...files(
      root,
      "src/data/derived",
      (file) => !file.endsWith("/manifest.json")
    ),
    ...files(root, "public/data", (file) => MASTER_CSV.test(file)),
  ];
  for (const [kind, actual] of [
    ["inputs", inputs],
    ["outputs", outputs],
  ]) {
    const expected = manifest[kind];
    for (const name of new Set([...actual, ...Object.keys(expected)])) {
      if (!(name in expected)) {
        errors.push(`Unrecorded ${kind}: ${name}`);
      } else if (actual.includes(name)) {
        const hash = createHash("sha256")
          .update(
            readFileSync(path.join(root, name), "utf8").replaceAll("\r\n", "\n")
          )
          .digest("hex");
        if (hash !== expected[name]) errors.push(`Changed ${kind}: ${name}`);
      } else {
        errors.push(`Missing ${kind}: ${name}`);
      }
    }
  }
  return errors;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const errors = checkHistory();
  if (errors.length) {
    process.stderr.write(
      `${errors.join("\n")}\nRun pnpm data:build from apps/web/elections, review the outputs, then retry.\n`
    );
    process.exitCode = 1;
  } else {
    process.stdout.write(
      "Historical JSON records and generated outputs are in sync.\n"
    );
  }
}
