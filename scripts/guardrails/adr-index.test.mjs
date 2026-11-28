// ADR numbers are an index the whole repo cites by number: release notes, AGENTS.md
// files, migrations and route descriptions all say "ADR-NNNN" and expect the reader
// to find the record. Nothing checked that the number resolved, so the published
// v1.11.0 release notes cited ADR-0066 to ADR-0069 months before those files existed,
// and two unrelated decisions both called themselves 0065 (#1967). Both mistakes are
// invisible in review — a number looks like a number — so they are checked here.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (relativePath) =>
  readFileSync(join(repoRoot, relativePath), "utf8");

const ADR_DIR = "docs/adr";
const ADR_INDEX = `${ADR_DIR}/README.md`;
/** `0065-barrels-app-subscriptions.md` — the only shape an ADR filename may take. */
const ADR_FILENAME = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/u;
/** How every citation in the repo is written: `ADR-0066`, `ADR 0066`, `adr-0066`. */
const CITATION = /\badr[-\s](\d{4})\b/giu;
/** An index row that links to a record: `| [0065](0065-….md) | … |`. */
const INDEX_LINK_ROW = /^\|\s*\[(\d{4})\]\(([^)]+)\)/gmu;
/** An index row for a number with no record: `| 0049 | Not used: reserved … |`. */
const RESERVED_ROW = /^\|\s*(\d{4})\s*\|/gmu;

function trackedFiles(...patterns) {
  const result = spawnSync("git", ["ls-files", ...patterns], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return result.stdout.trim().split("\n").filter(Boolean);
}

/** Number → the filenames claiming it. More than one is the bug this catches. */
function adrFilesByNumber() {
  const byNumber = new Map();
  for (const name of readdirSync(join(repoRoot, ADR_DIR))) {
    if (name === "README.md") {
      continue;
    }
    const number = ADR_FILENAME.exec(name)?.[1];
    assert.ok(
      number,
      `${ADR_DIR}/${name} is not named NNNN-kebab-case-title.md, so no check can ` +
        "match it to the citations that point at its number."
    );
    byNumber.set(number, [...(byNumber.get(number) ?? []), name]);
  }
  return byNumber;
}

/**
 * Numbers the index deliberately leaves without a record (`0049`, reserved for a
 * later marketplace). Taken from the index itself so a reservation is written down
 * once, where a reader looking for the missing record will find it.
 */
function reservedNumbers(index) {
  const linked = new Set(
    [...index.matchAll(INDEX_LINK_ROW)].map(([, number]) => number)
  );
  return new Set(
    [...index.matchAll(RESERVED_ROW)]
      .map(([, number]) => number)
      .filter((number) => !linked.has(number))
  );
}

/** Every tracked file that can carry prose, so a citation cannot hide from this. */
const citingFiles = () => [
  ...new Set([...trackedFiles("docs"), ...trackedFiles("*.md", "**/*.md")]),
];

test("each ADR number belongs to exactly one record", () => {
  const duplicates = [...adrFilesByNumber()]
    .filter(([, names]) => names.length > 1)
    .map(([number, names]) => `${number}: ${names.sort().join(", ")}`);
  assert.deepEqual(
    duplicates,
    [],
    "Two ADRs claim the same number, so every citation of it is ambiguous. " +
      "Renumber the later or less-cited one to the next free number and update " +
      `every reference, including ${ADR_INDEX}:\n  ${duplicates.join("\n  ")}`
  );
});

test("every ADR number cited in the docs has a record", () => {
  const known = adrFilesByNumber();
  const reserved = reservedNumbers(read(ADR_INDEX));
  const dangling = new Map();
  for (const file of citingFiles()) {
    let contents;
    try {
      contents = read(file);
    } catch {
      continue;
    }
    for (const [, number] of contents.matchAll(CITATION)) {
      if (known.has(number) || reserved.has(number)) {
        continue;
      }
      dangling.set(number, [...new Set([...(dangling.get(number) ?? []), file])]);
    }
  }
  const report = [...dangling]
    .sort()
    .map(([number, files]) => `ADR-${number}: cited by ${files.sort().join(", ")}`);
  assert.deepEqual(
    report,
    [],
    `A citation points at an ADR number with no file in ${ADR_DIR}. Write the ` +
      "record, correct the number, or add a reserved row for it in " +
      `${ADR_INDEX}:\n  ${report.join("\n  ")}`
  );
});

test(`${ADR_INDEX} indexes every ADR record`, () => {
  const index = read(ADR_INDEX);
  const known = adrFilesByNumber();
  const rows = new Map(
    [...index.matchAll(INDEX_LINK_ROW)].map(([, number, href]) => [number, href])
  );

  const unindexed = [...known.keys()]
    .filter((number) => !rows.has(number))
    .sort()
    .map((number) => `${number}: ${known.get(number).join(", ")}`);
  assert.deepEqual(
    unindexed,
    [],
    `These ADRs are not in the ${ADR_INDEX} index, so nobody browsing the ` +
      `decisions will find them:\n  ${unindexed.join("\n  ")}`
  );

  const broken = [...rows]
    .filter(([number, href]) => !known.get(number)?.includes(href))
    .sort()
    .map(([number, href]) => `${number} links to ${href}`);
  assert.deepEqual(
    broken,
    [],
    `These ${ADR_INDEX} links do not point at the file that holds that ` +
      `number — usually a renumber that missed the index:\n  ${broken.join("\n  ")}`
  );
});
