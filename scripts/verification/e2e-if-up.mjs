#!/usr/bin/env node
// Runs the Playwright smoke tests for each web app whose dev server is already
// listening, and skips the rest with a clear message, so verify:changed never
// hangs or fails just because a server is not running. Dev servers run on the
// host (pnpm dev:web:<app>); this script never starts one.
//
// Usage: node scripts/verification/e2e-if-up.mjs [--require]
//   --require  fail when a server is down instead of skipping it

import { spawnSync } from "node:child_process";
import { connect } from "node:net";
import { fileURLToPath } from "node:url";

const CONNECT_TIMEOUT_MS = 1500;
export const APPS = [
  {
    filter: "@barrelsgd/web-gms",
    name: "gms",
    port: 3003,
    start: "pnpm dev:web:gms",
  },
  {
    filter: "@barrelsgd/web-gaa-admin",
    name: "gaa-admin",
    port: 3001,
    start: "pnpm dev:web:gaa-admin",
  },
];

// Splits apps into those to run and those to skip, given which ports are up.
export function planE2e(apps, isUp) {
  const run = apps.filter((app) => isUp[app.port]);
  const skip = apps.filter((app) => !isUp[app.port]);
  return { run, skip };
}

export function portIsOpen(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(CONNECT_TIMEOUT_MS, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

async function main() {
  const require = process.argv.includes("--require");
  const isUp = {};
  for (const app of APPS) isUp[app.port] = await portIsOpen(app.port);
  const { run, skip } = planE2e(APPS, isUp);

  for (const app of skip)
    console.log(
      `SKIP ${app.name} e2e: nothing is listening on :${app.port}. Start it with \`${app.start}\` to run these tests.`
    );
  if (require && skip.length > 0) {
    console.error("e2e: --require was given but a dev server is down");
    process.exitCode = 1;
    return;
  }
  for (const app of run) {
    console.log(`RUN  ${app.name} e2e against :${app.port}`);
    const result = spawnSync(
      "pnpm",
      ["--filter", app.filter, "run", "test:e2e"],
      {
        stdio: "inherit",
      }
    );
    if (result.status !== 0) process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
