import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { request, summarize, table } from "./measure.mjs";

const run = promisify(execFile);
const SETTINGS_DIFFER = /Baseline settings differ/;
const script = new URL("./measure.mjs", import.meta.url).pathname;

async function fixture(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("captures wire bytes and waits for the full body after the first byte", async (t) => {
  const url = await fixture(t, (_req, res) => {
    res.write("hello");
    setTimeout(() => res.end(" world"), 80);
  });
  const result = await request(url, { timeout: 2 });
  assert.equal(result.status, 200);
  assert.equal(result.bytes, 11);
  assert.equal(result.exitCode, 0);
  assert.ok(result.totalMs - result.ttfbMs > 40);
});

test("does not follow login redirects or treat HTTP errors as improvements", async (t) => {
  const url = await fixture(t, (req, res) => {
    res.statusCode = req.url === "/redirect" ? 307 : 503;
    if (res.statusCode === 307)
      res.setHeader("Location", "/login?secret=hidden");
    res.end();
  });
  for (const path of ["/redirect", "/error"]) {
    const result = await request(`${url}${path}`, { timeout: 2 });
    assert.equal(summarize([result]).valid, false);
    assert.equal(summarize([result]).ttfbMs, null);
    assert.equal(JSON.stringify(result).includes("secret"), false);
  }
});

test("timeouts are reported as failures", async (t) => {
  const url = await fixture(t, (_req, res) => {
    setTimeout(() => res.end(), 150);
  });
  const result = await request(url, { timeout: 0.03 });
  assert.equal(result.exitCode, 28);
  assert.equal(summarize([result]).valid, false);
});

test("CLI saves and compares samples; sends cookies only to admin paths", async (t) => {
  const received = [];
  const url = await fixture(t, (req, res) => {
    received.push({ path: req.url, cookie: req.headers.cookie });
    res.end("fixture");
  });
  const directory = await mkdtemp(join(tmpdir(), "perf-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cookie = join(directory, "cookies.txt");
  await writeFile(
    cookie,
    "# Netscape HTTP Cookie File\n127.0.0.1\tFALSE\t/\tFALSE\t0\tsession\ttest-secret\n"
  );
  const baseline = join(directory, "baseline.json");
  const args = [
    script,
    "--api",
    url,
    "--gms",
    url,
    "--admin",
    url,
    "--samples",
    "1",
    "--cookie-file",
    cookie,
  ];
  await run(process.execPath, [...args, "--save", baseline]);
  const saved = await readFile(baseline, "utf8");
  assert.equal(saved.includes("test-secret"), false);
  const report = JSON.parse(saved);
  assert.equal(report.results.length, 8);
  assert.ok(report.results.every((result) => result.requests.length === 2));
  assert.ok(received.slice(0, 12).every((item) => !item.cookie));
  assert.ok(
    received.slice(12).every((item) => item.cookie === "session=test-secret")
  );
  const { stdout } = await run(process.execPath, [
    ...args,
    "--compare",
    baseline,
  ]);
  assert.ok(stdout.includes("before TTFB ms"));
  assert.ok(stdout.includes("Δ TTFB ms"));
  assert.throws(
    () => table({ ...report, samples: 2 }, report),
    SETTINGS_DIFFER
  );
});

test("CLI skips admin without credentials and fails on unavailable services", async (t) => {
  const url = await fixture(t, (_req, res) => {
    res.statusCode = 503;
    res.end();
  });
  await assert.rejects(
    run(process.execPath, [
      script,
      "--api",
      url,
      "--gms",
      url,
      "--admin",
      url,
      "--samples",
      "1",
    ]),
    (error) => {
      assert.equal(error.code, 1);
      assert.ok(error.stdout.includes("requires --cookie-file"));
      return true;
    }
  );
});

test("comparison separates first request from repeated median and reports signed deltas", () => {
  const sample = (ms) => ({
    status: 200,
    exitCode: 0,
    redirected: false,
    ttfbMs: ms,
    totalMs: ms + 5,
    bytes: 10,
  });
  const report = {
    version: 1,
    samples: 3,
    results: [{ target: "api/", requests: [100, 30, 10, 20].map(sample) }],
  };
  const baseline = {
    ...report,
    results: [{ target: "api/", requests: [200, 50, 30, 40].map(sample) }],
  };
  const rows = table(report, baseline);
  assert.equal(rows[0]["Δ TTFB ms"], "-100.0");
  assert.equal(rows[1]["TTFB ms"], "20.0");
  assert.equal(rows[1]["Δ TTFB ms"], "-20.0");
});
