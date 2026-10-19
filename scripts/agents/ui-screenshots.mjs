#!/usr/bin/env node
// Renders pages of a running web app the way a reviewer sees them: full-page
// screenshots at phone and desktop widths, in light and dark mode, plus the
// mechanical defects a screenshot can hide (horizontal overflow, console
// errors, failed requests). The ui-check skill feeds the PNGs to a
// fresh-context design critic and repairs what it finds.
//
// Dev servers run on the host (`pnpm dev:web:<app>`); this script never
// starts one and exits 2 with the start command when nothing is listening.
//
// Usage:
//   pnpm ui:screenshots --app gms --path / --path /forecast
//   pnpm ui:screenshots --url http://localhost:3003 --path /warnings --widths 390
//   options: --widths 375,1280  --themes light,dark  --out <dir>

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const CATALOGUE = join(repoRoot, "packages/ui/src/lib/service-catalogue.json");
const DEFAULT_WIDTHS = [375, 1280];
const DEFAULT_THEMES = ["light", "dark"];
// A phone-sized first screen; full-page capture extends past it.
const VIEWPORT_HEIGHT = 812;
// Next.js dev builds a route on first request; 60 s covers a cold compile.
const NAVIGATION_TIMEOUT_MS = 60_000;
const THEMES = new Set(DEFAULT_THEMES);
const SLUG_UNSAFE = /[^a-z0-9]+/gi;
const EDGE_DASHES = /^-|-$/g;

export function parseArgs(argv) {
  const options = {
    app: null,
    url: null,
    paths: [],
    widths: DEFAULT_WIDTHS,
    themes: DEFAULT_THEMES,
    out: null,
  };
  const list = (value) => (value ?? "").split(",").filter(Boolean);
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--app") options.app = value;
    else if (flag === "--url") options.url = value;
    else if (flag === "--path") options.paths.push(value);
    else if (flag === "--widths") options.widths = list(value).map(Number);
    else if (flag === "--themes") options.themes = list(value);
    else if (flag === "--out") options.out = value;
    else throw new Error(`Unknown argument: ${flag}`);
    i++;
  }
  if (!(options.app || options.url))
    throw new Error("Pass --app <id> or --url <origin>.");
  if (options.widths.some((width) => !Number.isInteger(width) || width < 200)) {
    throw new Error(
      "--widths takes comma-separated pixel widths, each 200 or more."
    );
  }
  const badTheme = options.themes.find((theme) => !THEMES.has(theme));
  if (badTheme)
    throw new Error(`Unknown theme '${badTheme}'; use light and/or dark.`);
  if (options.paths.length === 0) options.paths = ["/"];
  return options;
}

/** The development origin for a catalogue service id (e.g. gms → :3003). */
export function developmentOrigin(catalogue, app) {
  const service = catalogue.services?.find((entry) => entry.id === app);
  const origin = service?.environments?.development?.origin;
  if (!origin) {
    const known = (catalogue.services ?? [])
      .filter((entry) => entry.environments?.development?.origin)
      .map((entry) => entry.id);
    throw new Error(
      `No development origin for '${app}'. Known apps: ${known.join(", ")}.`
    );
  }
  return origin;
}

/** Every page × width × theme combination, with a stable file name. */
export function planShots({ origin, paths, widths, themes }) {
  const shots = [];
  for (const path of paths) {
    const slug =
      path.replace(SLUG_UNSAFE, "-").replace(EDGE_DASHES, "") || "home";
    for (const width of widths) {
      for (const theme of themes) {
        shots.push({
          file: `${slug}-${width}-${theme}.png`,
          path,
          theme,
          url: new URL(path, origin).href,
          width,
        });
      }
    }
  }
  return shots;
}

async function capture(browser, shot, outDir) {
  const context = await browser.newContext({
    colorScheme: shot.theme,
    viewport: { width: shot.width, height: VIEWPORT_HEIGHT },
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => failedRequests.push(request.url()));
  page.on("response", (response) => {
    if (response.status() >= 400)
      failedRequests.push(`${response.status()} ${response.url()}`);
  });
  let error = null;
  try {
    await page.goto(shot.url, {
      waitUntil: "networkidle",
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    // The design system's dark mode is class-based; mirror next-themes.
    await page.evaluate((theme) => {
      document.documentElement.classList.toggle("dark", theme === "dark");
      document.documentElement.style.colorScheme = theme;
    }, shot.theme);
    await page.screenshot({ path: join(outDir, shot.file), fullPage: true });
  } catch (caught) {
    error =
      caught instanceof Error ? caught.message.split("\n")[0] : String(caught);
  }
  const overflowPx = error
    ? 0
    : await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth
      );
  await context.close();
  return { ...shot, consoleErrors, error, failedRequests, overflowPx };
}

function report(results, outDir) {
  const lines = [`UI screenshots in ${outDir}`];
  for (const result of results) {
    const problems = [
      result.error && `error: ${result.error}`,
      result.overflowPx > 0 && `horizontal overflow ${result.overflowPx}px`,
      result.consoleErrors.length > 0 &&
        `${result.consoleErrors.length} console error(s)`,
      result.failedRequests.length > 0 &&
        `${result.failedRequests.length} failed request(s)`,
    ].filter(Boolean);
    lines.push(
      `${problems.length ? "FLAG" : "OK  "} ${result.file}${problems.length ? ` — ${problems.join("; ")}` : ""}`
    );
  }
  return lines.join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const origin =
    options.url ??
    developmentOrigin(JSON.parse(readFileSync(CATALOGUE, "utf8")), options.app);
  const outDir =
    options.out ??
    join(
      repoRoot,
      ".ui-review",
      new Date().toISOString().replace(/[:.]/g, "-")
    );
  mkdirSync(outDir, { recursive: true });

  const probe = await fetch(origin).catch(() => null);
  if (!probe) {
    const start = options.app
      ? `pnpm dev:web:${options.app}`
      : "the app's dev server";
    console.error(
      `Nothing is answering at ${origin}. Start ${start} on the host, then rerun.`
    );
    process.exitCode = 2;
    return;
  }
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  try {
    const results = [];
    for (const shot of planShots({ ...options, origin })) {
      results.push(await capture(browser, shot, outDir));
    }
    writeFileSync(
      join(outDir, "results.json"),
      `${JSON.stringify(results, null, 2)}\n`
    );
    console.log(report(results, outDir));
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
