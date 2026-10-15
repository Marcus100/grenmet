#!/usr/bin/env node
// Moves old SESSION_LOG.md entries into SESSION_LOG.archive/<YYYY-MM>.md so the
// handoff log stays short. Dry run unless --write is passed.
// Usage: node scripts/agents/archive-session-log.mjs [--days 7] [--write] [--log <path>]

import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DAY_MS = 86_400_000;
const DEFAULT_DAYS = 7;
const MAX_ATTEMPTS = 3;
// An entry starts on a line that begins with a date, with or without a "- ".
const MD_SUFFIX = /\.md$/;
const TRAILING_NEWLINES = /\n*$/;
const ENTRY_START = /^(?:- )?(\d{4})-(\d{2})-(\d{2})[T ]/;

// Splits the log into a preamble (text before the first entry, kept as is) and
// entries. Continuation lines belong to the entry above them.
export function parseEntries(text) {
  const preamble = [];
  const entries = [];
  for (const line of text.split("\n")) {
    const match = ENTRY_START.exec(line);
    if (match) {
      const [, year, month, day] = match;
      entries.push({
        lines: [line],
        month: `${year}-${month}`,
        time: Date.UTC(Number(year), Number(month) - 1, Number(day)),
      });
    } else if (entries.length > 0) entries.at(-1).lines.push(line);
    else preamble.push(line);
  }
  return { entries, preamble };
}

// Entries older than `days` (by calendar day) move to the archive. Never drops
// text: kept + archived lines always reassemble the original log.
export function splitLog(text, { now, days = DEFAULT_DAYS }) {
  const { entries, preamble } = parseEntries(text);
  const cutoff = now - days * DAY_MS;
  const keep = [];
  const archive = new Map();
  for (const entry of entries) {
    if (entry.time >= cutoff) {
      keep.push(entry);
      continue;
    }
    const group = archive.get(entry.month) ?? [];
    group.push(entry);
    archive.set(entry.month, group);
  }
  const render = (list) => list.flatMap((entry) => entry.lines);
  const archived = [...archive.values()].reduce((n, g) => n + g.length, 0);
  return {
    archived,
    archive: new Map(
      [...archive].map(([month, group]) => [month, render(group).join("\n")])
    ),
    kept: [...preamble, ...render(keep)].join("\n"),
    keptCount: keep.length,
  };
}

function mainCheckoutRoot() {
  const result = spawnSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { encoding: "utf8" }
  );
  if (result.status !== 0) throw new Error(result.stderr.trim());
  return dirname(result.stdout.trim());
}

function parseArgs(argv) {
  const options = { days: DEFAULT_DAYS, write: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--days") options.days = Number(argv[++i]);
    else if (argv[i] === "--write") options.write = true;
    else if (argv[i] === "--log") options.log = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!(Number.isFinite(options.days) && options.days >= 1))
    throw new Error("--days must be a number of at least 1");
  return options;
}

// Archive files first, then replace the log atomically. Another agent may
// append while this runs, so re-read before the swap and retry if it changed.
function archiveLog(logPath, { days, write }, now) {
  const archiveDir = `${logPath.replace(MD_SUFFIX, "")}.archive`;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const text = readFileSync(logPath, "utf8");
    const result = splitLog(text, { days, now });
    if (result.archived === 0 || !write) return { ...result, archiveDir };
    mkdirSync(archiveDir, { recursive: true });
    for (const [month, body] of result.archive) {
      const target = join(archiveDir, `${month}.md`);
      const existing = existsSync(target) ? readFileSync(target, "utf8") : "";
      // A rerun after a crash must not duplicate entries already archived.
      if (!existing.includes(body))
        appendFileSync(target, `${body.replace(TRAILING_NEWLINES, "")}\n`);
    }
    if (readFileSync(logPath, "utf8") === text) {
      const temporary = `${logPath}.tmp-${process.pid}`;
      writeFileSync(temporary, result.kept);
      renameSync(temporary, logPath);
      return { ...result, archiveDir };
    }
  }
  throw new Error("SESSION_LOG.md kept changing; try again in a moment.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const logPath = options.log ?? join(mainCheckoutRoot(), "SESSION_LOG.md");
    const before = statSync(logPath).size;
    const result = archiveLog(logPath, options, Date.now());
    const verb = options.write ? "archived" : "would archive";
    console.log(
      `${verb} ${result.archived} entr${result.archived === 1 ? "y" : "ies"} older than ${options.days} days; ${result.keptCount} kept (${before} bytes before).`
    );
    for (const [month, body] of result.archive)
      console.log(`  ${month}: ${body.split("\n").length} lines`);
    if (!options.write && result.archived > 0)
      console.log("Re-run with --write to move them.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
