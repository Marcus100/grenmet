#!/usr/bin/env node
// Refreshes user-guide screenshots from a list. Each screen in the manifest
// names an app, a path, a width and theme, and optional steps (click, press,
// wait for text). One command captures them all, so guides stay current.
//
// Idea taken from wmo-raf/adl docs/screenshots/capture/capture.py (MIT). This
// is our own implementation; no code is copied. The manifest is JSON rather
// than YAML so no new dependency is needed.
//
// Dev servers run on the host (`pnpm dev:web:<app>`). Sign-in is not stored in
// the manifest: point GUIDE_STORAGE_STATE at a Playwright storage-state file
// made from a seeded test account, and keep that file out of git.
//
// Usage:
//   pnpm guide:screenshots --manifest scripts/agents/guide-screens.json \
//     --out apps/web/docs/src/images/guides [--only roster-week]

import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { developmentOrigin } from "./ui-screenshots.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const CATALOGUE = join(repoRoot, "packages/ui/src/lib/service-catalogue.json");
const VIEWPORT_HEIGHT = 900;
const NAVIGATION_TIMEOUT_MS = 60_000;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;
const THEMES = new Set(["light", "dark"]);
const STEP_KINDS = ["click", "press", "waitForText"];

/** Checks a manifest and returns its screens, or throws naming the first problem. */
export function parseManifest(manifest) {
  if (!manifest || !Array.isArray(manifest.screens)) {
    throw new Error("Manifest needs a 'screens' array.");
  }
  const seen = new Set();
  return manifest.screens.map((screen, index) => {
    const where = `screen ${index + 1}`;
    if (!screen || typeof screen !== "object") {
      throw new Error(`${where}: must be an object.`);
    }
    if (typeof screen.id !== "string" || !ID_PATTERN.test(screen.id)) {
      throw new Error(`${where}: 'id' must be lowercase letters, digits and dashes.`);
    }
    if (seen.has(screen.id)) throw new Error(`Duplicate id '${screen.id}'.`);
    seen.add(screen.id);
    if (typeof screen.app !== "string") throw new Error(`${screen.id}: 'app' is required.`);
    if (typeof screen.path !== "string" || !screen.path.startsWith("/")) {
      throw new Error(`${screen.id}: 'path' must start with '/'.`);
    }
    const width = screen.width ?? 1280;
    if (!Number.isInteger(width) || width < 200) {
      throw new Error(`${screen.id}: 'width' must be a whole number of 200 or more.`);
    }
    const theme = screen.theme ?? "light";
    if (!THEMES.has(theme)) throw new Error(`${screen.id}: theme must be light or dark.`);
    const steps = screen.steps ?? [];
    if (!Array.isArray(steps)) throw new Error(`${screen.id}: 'steps' must be a list.`);
    for (const step of steps) {
      if (!step || typeof step !== "object") {
        throw new Error(`${screen.id}: each step must be an object.`);
      }
      const kinds = STEP_KINDS.filter(
        (kind) => typeof step[kind] === "string" && step[kind].trim() !== ""
      );
      if (kinds.length !== 1) {
        throw new Error(`${screen.id}: each step needs exactly one of ${STEP_KINDS.join(", ")}.`);
      }
    }
    return { id: screen.id, app: screen.app, path: screen.path, width, theme, steps };
  });
}

/** Runs the steps in order against a Playwright page. */
export async function runSteps(page, steps) {
  for (const step of steps) {
    if (step.click) {
      await page.getByText(step.click, { exact: true }).first().click();
    } else if (step.press) {
      await page.keyboard.press(step.press);
    } else if (step.waitForText) {
      await page.getByText(step.waitForText).first().waitFor();
    }
    await page.waitForLoadState("networkidle");
  }
}

async function capture(browser, screen, origin, outDir, storageState) {
  const context = await browser.newContext({
    colorScheme: screen.theme,
    viewport: { width: screen.width, height: VIEWPORT_HEIGHT },
    ...(storageState ? { storageState } : {}),
  });
  const page = await context.newPage();
  try {
    await page.goto(new URL(screen.path, origin).href, {
      waitUntil: "networkidle",
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    await runSteps(page, screen.steps);
    const file = `${screen.id}.png`;
    await page.screenshot({ path: join(outDir, file), fullPage: true });
    return { id: screen.id, file, error: null };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message.split("\n")[0] : String(caught);
    return { id: screen.id, file: null, error: message };
  } finally {
    await context.close();
  }
}

function parseArgs(argv) {
  const options = { manifest: null, out: null, only: null };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${flag} needs a value.`);
    }
    if (flag === "--manifest") options.manifest = value;
    else if (flag === "--out") options.out = value;
    else if (flag === "--only") options.only = value;
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (!options.manifest || !options.out) {
    throw new Error("Pass --manifest <file> and --out <dir>.");
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const catalogue = JSON.parse(readFileSync(CATALOGUE, "utf8"));
  let screens = parseManifest(JSON.parse(readFileSync(options.manifest, "utf8")));
  if (options.only) screens = screens.filter((screen) => screen.id === options.only);
  if (screens.length === 0) throw new Error("No screens to capture.");
  const outDir = options.out;
  mkdirSync(outDir, { recursive: true });
  const storageState = process.env.GUIDE_STORAGE_STATE || undefined;
  // Resolve every app before launching a browser, so a typo fails at once.
  const targets = screens.map((screen) => ({
    screen,
    origin: developmentOrigin(catalogue, screen.app),
  }));

  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  try {
    const results = [];
    for (const { screen, origin } of targets) {
      results.push(await capture(browser, screen, origin, outDir, storageState));
    }
    for (const result of results) {
      console.log(result.error ? `FAILED ${result.id}: ${result.error}` : `ok ${result.file}`);
    }
    if (results.some((result) => result.error)) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  });
}
