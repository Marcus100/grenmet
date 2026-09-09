#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const packagePath = "packages/api-client";
const generatedPath = `${packagePath}/src/gen`;
const inputs = [
  "apps/api/fastapi/openapi.json",
  "biome.jsonc",
  ".gitignore",
  `${packagePath}/package.json`,
  `${packagePath}/kubb.config.ts`,
];

function files(directory, prefix = "") {
  const result = new Map();
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = join(prefix, entry.name);
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [name, content] of files(absolute, relative))
        result.set(name, content);
    } else if (entry.isFile()) {
      result.set(relative, readFileSync(absolute));
    } else {
      throw new Error(`Unsupported generated entry: ${relative}`);
    }
  }
  return result;
}

function generate(directory) {
  const result = spawnSync("pnpm", ["run", "generate"], {
    cwd: join(directory, packagePath),
    stdio: "inherit",
    timeout: 600_000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `API client generation failed: ${result.error?.message ?? result.signal ?? result.status}`
    );
  }
}

export function checkDrift(root, generateClient = generate) {
  for (const input of inputs) {
    if (!lstatSync(join(root, input)).isFile())
      throw new Error(`Missing input file: ${input}`);
  }
  const committed = files(join(root, generatedPath));
  if (committed.size === 0) throw new Error("Generated client is empty");
  const temporary = mkdtempSync(join(tmpdir(), "grenmet-api-drift-"));
  try {
    for (const input of inputs) {
      const destination = join(temporary, input);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(join(root, input), destination);
    }
    // Reuse installed tools; source, output, and formatter paths stay isolated.
    for (const modules of ["node_modules", `${packagePath}/node_modules`]) {
      const source = join(root, modules);
      if (existsSync(source))
        symlinkSync(source, join(temporary, modules), "dir");
    }
    generateClient(temporary);
    const generated = files(join(temporary, generatedPath));
    if (generated.size === 0)
      throw new Error("Generator produced no client files");
    const differences = [];
    for (const name of [
      ...new Set([...committed.keys(), ...generated.keys()]),
    ].sort()) {
      if (!committed.has(name)) differences.push(`Missing: ${name}`);
      else if (!generated.has(name)) differences.push(`Extra: ${name}`);
      else if (!committed.get(name).equals(generated.get(name)))
        differences.push(`Changed: ${name}`);
    }
    return differences;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const differences = checkDrift(resolve(import.meta.dirname, "../.."));
    if (differences.length) {
      console.error(
        `API client drift detected:\n${differences.join("\n")}\nRun pnpm generate:api-client and commit the complete generated file set.`
      );
      process.exitCode = 1;
    } else console.log("✓ Generated API client content matches openapi.json.");
  } catch (error) {
    console.error(`API client drift check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
