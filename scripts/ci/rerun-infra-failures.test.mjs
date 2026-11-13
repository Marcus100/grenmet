import assert from "node:assert/strict";
import test from "node:test";
import {
  decide,
  isTransientFailure,
  MAX_ATTEMPTS,
} from "./rerun-infra-failures.mjs";

const run = (extra = {}) => ({
  conclusion: "failure",
  run_attempt: 1,
  ...extra,
});

test("recognises registry rate limits and network errors", () => {
  for (const log of [
    "Error response from daemon: toomanyrequests: You have reached your unauthenticated pull rate limit.",
    "unexpected status from HEAD request to https://registry-1.docker.io/v2/library/node/manifests/sha256:abc: 429 Too Many Requests",
    "Docker pull failed with exit code 1",
    "dial tcp 1.2.3.4:443: i/o timeout",
    "The runner has received a shutdown signal.",
    "npm ERR! code ECONNRESET",
  ]) {
    assert.equal(isTransientFailure(log), true, log);
  }
});

test("a real test or build failure is not infrastructure", () => {
  for (const log of [
    "FAILED tests/auth/test_login.py::test_login - AssertionError",
    "error TS2322: Type 'string' is not assignable to type 'number'.",
    "Process completed with exit code 1.",
    "npm ERR! missing script: build",
    "",
  ]) {
    assert.equal(isTransientFailure(log), false, log);
  }
});

test("re-runs when any failed job hit an infrastructure error", () => {
  const transient = { name: "a", log: "toomanyrequests: rate limit" };
  const gate = {
    name: "CI Success",
    log: "Process completed with exit code 1.",
  };
  const real = { name: "b", log: "AssertionError: expected 1 got 2" };
  assert.equal(decide({ run: run(), jobs: [transient, gate] }).rerun, true);
  assert.equal(decide({ run: run(), jobs: [transient, real] }).rerun, true);
  const allReal = decide({ run: run(), jobs: [real, gate] });
  assert.equal(allReal.rerun, false);
});

test("never re-runs twice, a pass, a cancel or an empty list", () => {
  const job = { name: "a", log: "toomanyrequests" };
  assert.equal(
    decide({ run: run({ run_attempt: MAX_ATTEMPTS }), jobs: [job] }).rerun,
    false
  );
  assert.equal(
    decide({ run: run({ conclusion: "cancelled" }), jobs: [job] }).rerun,
    false
  );
  assert.equal(decide({ run: run(), jobs: [] }).rerun, false);
});
