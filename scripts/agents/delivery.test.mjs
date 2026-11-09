import assert from "node:assert/strict";
import test from "node:test";
import {
  computeDelivery,
  formatDuration,
  parseMerges,
  percentile,
} from "./delivery.mjs";

const SEP = "\u001f";
const HOUR = 3_600_000;
const T0 = Date.parse("2026-11-01T00:00:00Z");

test("counts pull requests merged into dev, not promotion merges", () => {
  const log = [
    `a${SEP}2026-11-08T20:40:00Z${SEP}Merge pull request #1128 from Marcus100/fix/web-images`,
    `b${SEP}2026-11-08T20:58:00Z${SEP}Merge pull request #1132 from Marcus100/dev`,
    `c${SEP}2026-11-08T21:25:00Z${SEP}Merge pull request #1129 from Marcus100/staging`,
    `d${SEP}2026-11-08T21:00:00Z${SEP}Merge branch 'main' into dev`,
  ].join("\n");
  assert.deepEqual(parseMerges(log), [
    { sha: "a", mergedAt: Date.parse("2026-11-08T20:40:00Z"), pr: 1128 },
  ]);
});

test("percentile uses the nearest rank and handles empty lists", () => {
  assert.equal(percentile([], 0.5), null);
  assert.equal(percentile([5, 1, 3], 0.5), 3);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 9);
});

test("joins releases, deploys and changes into lead times", () => {
  const releases = [
    { tag: "v1.0.3", publishedAt: T0 },
    { tag: "v1.0.4", publishedAt: T0 + 100 * HOUR },
    { tag: "v1.0.5", publishedAt: T0 + 110 * HOUR },
  ];
  const deploys = {
    "v1.0.4": { conclusion: "success", finishedAt: T0 + 101 * HOUR },
    "v1.0.5": { conclusion: "failure", finishedAt: T0 + 111 * HOUR },
  };
  const changesFor = (_previous, tag) =>
    tag === "v1.0.4"
      ? [
          { mergedAt: T0 + 99 * HOUR },
          { mergedAt: T0 + 91 * HOUR },
          { mergedAt: T0 + 1 * HOUR },
        ]
      : [{ mergedAt: T0 + 105 * HOUR }];
  const result = computeDelivery({
    releases,
    deploys,
    changesFor,
    days: 30,
    now: T0 + 120 * HOUR,
  });
  assert.equal(result.releases.length, 2);
  const [first, second] = result.releases;
  assert.equal(first.changes, 3);
  assert.equal(first.medianLeadMs, 10 * HOUR);
  assert.equal(first.slowestLeadMs, 100 * HOUR);
  assert.equal(first.publishToLiveMs, HOUR);
  assert.equal(first.followUp, true);
  assert.equal(second.deploy, "failure");
  assert.equal(second.medianLeadMs, null);
  assert.equal(result.failedDeploys, 1);
  assert.equal(result.followUps, 1);
  assert.equal(result.medianLeadMs, 10 * HOUR);
});

test("leaves out releases older than the window", () => {
  const releases = [
    { tag: "v1.0.0", publishedAt: T0 },
    { tag: "v1.0.1", publishedAt: T0 + HOUR },
  ];
  const result = computeDelivery({
    releases,
    deploys: {},
    changesFor: () => [],
    days: 1,
    now: T0 + 40 * 24 * HOUR,
  });
  assert.equal(result.releases.length, 0);
});

test("formats hours, and days past two days", () => {
  assert.equal(formatDuration(null), "—");
  assert.equal(formatDuration(1.5 * HOUR), "1.5 h");
  assert.equal(formatDuration(72 * HOUR), "3.0 d");
});
