#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(rootDir, "packages/ui/src/styles/globals.css");
const minimumNormalTextContrast = 4.5;
const warningLevels = ["green", "yellow", "amber", "red", "grey"];
const hexColorPattern = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const variableRefPattern = /^var\((--gm-[a-z0-9-]+)\)$/i;

function parseVariables(source) {
  const variables = new Map();
  const variablePattern = /^\s*(--gm-[a-z0-9-]+)\s*:\s*([^;]+);/gim;

  for (const match of source.matchAll(variablePattern)) {
    variables.set(match[1], match[2].trim());
  }

  return variables;
}

function resolveVariable(variables, tokenName, seen = new Set()) {
  if (seen.has(tokenName)) {
    throw new Error(`Circular token reference detected for ${tokenName}`);
  }

  const value = variables.get(tokenName);
  if (!value) {
    throw new Error(`Missing token ${tokenName}`);
  }

  const variableRef = value.match(variableRefPattern);
  if (variableRef?.[1]) {
    return resolveVariable(
      variables,
      variableRef[1],
      new Set(seen).add(tokenName)
    );
  }

  return value;
}

function parseHexColor(value) {
  const hex = value.trim().match(hexColorPattern)?.[1];
  if (!hex) {
    throw new Error(`Expected a hex color, received ${value}`);
  }

  const channels =
    hex.length === 3
      ? hex
          .split("")
          .map((character) => Number.parseInt(character + character, 16))
      : [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map((channel) =>
          Number.parseInt(channel, 16)
        );

  return channels.map((channel) => channel / 255);
}

function linearize(channel) {
  return channel <= 0.039_28
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hexColor) {
  const [red, green, blue] = parseHexColor(hexColor).map(linearize);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const light = Math.max(foregroundLuminance, backgroundLuminance);
  const dark = Math.min(foregroundLuminance, backgroundLuminance);
  return (light + 0.05) / (dark + 0.05);
}

async function run() {
  const source = await readFile(sourcePath, "utf8");
  const variables = parseVariables(source);
  const results = [];

  for (const level of warningLevels) {
    const foregroundToken = `--gm-warning-${level}-fg`;
    const backgroundToken = `--gm-warning-${level}-bg`;
    const foreground = resolveVariable(variables, foregroundToken);
    const background = resolveVariable(variables, backgroundToken);
    const ratio = contrastRatio(foreground, background);

    results.push({
      background,
      backgroundToken,
      foreground,
      foregroundToken,
      level,
      ratio,
    });
  }

  console.log("GrenMet warning contrast check");
  console.log(`Minimum normal text contrast: ${minimumNormalTextContrast}:1`);
  console.log("");

  let failed = false;
  for (const result of results) {
    const passed = result.ratio >= minimumNormalTextContrast;
    failed ||= !passed;
    console.log(
      `${passed ? "PASS" : "FAIL"} ${result.level}: ${result.foregroundToken} ${result.foreground} on ${result.backgroundToken} ${result.background} = ${result.ratio.toFixed(2)}:1`
    );
  }

  if (failed) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
