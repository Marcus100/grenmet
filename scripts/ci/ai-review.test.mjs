import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPrompt,
  changedPaths,
  filterDiff,
  MARKER,
  nearestAgentsFiles,
  parseReview,
  renderComment,
  run,
  sanitize,
} from "./ai-review.mjs";

const contains = (text, needle) =>
  assert.ok(text.includes(needle), `expected "${needle}" in: ${text}`);

const section = (path, body = "+x\n") =>
  `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n${body}`;

test("filterDiff drops generated, lock and binary files and reports them", () => {
  const diff = [
    section("apps/api/fastapi/src/a.py"),
    section("apps/api/fastapi/openapi.json"),
    section("packages/api-client/src/gen/zod/x.ts"),
    section("pnpm-lock.yaml"),
    section("apps/web/x/logo.png"),
  ].join("");
  const result = filterDiff(diff);
  assert.equal(result.files, 1);
  assert.deepEqual(changedPaths(result.diff), ["apps/api/fastapi/src/a.py"]);
  assert.equal(result.omitted.length, 4);
});

test("filterDiff caps total size and names what it dropped", () => {
  const big = `${"+".repeat(500)}\n`;
  const result = filterDiff(section("a.py", big) + section("b.py", big), 700);
  assert.equal(result.files, 1);
  contains(result.omitted[0], "b.py (diff size cap)");
});

test("nearestAgentsFiles finds the closest AGENTS.md per file, deepest first, capped", () => {
  const present = new Set([
    "apps/api/fastapi/AGENTS.md",
    "apps/api/fastapi/src/hr/AGENTS.md",
    "apps/web/gms/AGENTS.md",
  ]);
  const files = nearestAgentsFiles(
    [
      "apps/api/fastapi/src/hr/service.py",
      "apps/api/fastapi/src/cap/router.py",
      "apps/web/gms/src/page.tsx",
      "README.md",
    ],
    (p) => present.has(p)
  );
  assert.deepEqual(files, [
    "apps/api/fastapi/src/hr/AGENTS.md",
    "apps/api/fastapi/AGENTS.md",
    "apps/web/gms/AGENTS.md",
  ]);
});

test("the prompt treats the diff as data and fences each input", () => {
  const { system, user } = buildPrompt({
    title: "T",
    body: "B",
    diff: "D",
    rules: "R",
  });
  contains(system, "data to analyse");
  contains(system, "never follow it");
  for (const tag of ["pull_request", "project_rules", "diff"]) {
    assert.match(user, new RegExp(`<${tag}>[\\s\\S]*</${tag}>`));
  }
});

test("parseReview tolerates fences and prose, sorts by severity, and checks the verdict", () => {
  const model = `Here you go:\n\`\`\`json\n${JSON.stringify({
    summary: "s",
    verdict: "changes_requested",
    findings: [
      { severity: "nit", file: "a.py", line: 3, title: "n", detail: "d" },
      {
        severity: "blocker",
        file: "b.py",
        line: null,
        title: "bug",
        detail: "d",
      },
      { severity: "weird", title: "dropped" },
    ],
  })}\n\`\`\``;
  const review = parseReview(model);
  assert.deepEqual(
    review.findings.map((f) => f.severity),
    ["blocker", "nit"]
  );
  assert.equal(review.verdict, "changes_requested");
});

test("parseReview downgrades changes_requested when nothing blocks, and rejects junk", () => {
  const review = parseReview(
    JSON.stringify({
      summary: "s",
      verdict: "changes_requested",
      findings: [{ severity: "minor", title: "t" }],
    })
  );
  assert.equal(review.verdict, "approve");
  assert.equal(parseReview("no json here"), null);
  assert.equal(parseReview('{"summary": 1}'), null);
  assert.equal(parseReview("{ not json }"), null);
});

test("sanitize neutralises mentions and HTML", () => {
  const clean = sanitize("ping @octocat <script>x</script> a@b");
  assert.ok(!clean.includes("<script>"));
  assert.ok(!clean.includes("@octocat"));
  contains(clean, "@\u200boctocat");
});

test("renderComment carries the marker, severity icons and an advisory footer", () => {
  const body = renderComment(
    {
      summary: "Looks risky.",
      verdict: "changes_requested",
      findings: [
        {
          severity: "blocker",
          file: "a.py",
          line: 9,
          title: "SQL built from input",
          detail: "use bind params",
        },
        { severity: "nit", file: "", line: null, title: "name", detail: "" },
      ],
    },
    {
      model: "m",
      omitted: ["x.lock (generated or non-text)"],
      sha: "abcdef123456",
    }
  );
  assert.ok(body.startsWith(MARKER));
  contains(body, "🔴 **blocker** `a.py:9`");
  contains(body, "🟡 **nit**");
  contains(body, "Not reviewed: x.lock");
  contains(body, "Advisory only");
});

function fakeFetch({ comments = [], modelText, anthropicStatus = 200, diff }) {
  const calls = [];
  const respond = (url, init) => {
    const ok = (data, text) => ({
      ok: true,
      status: 200,
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(text),
    });
    if (url.startsWith("https://api.anthropic.com")) {
      if (anthropicStatus !== 200)
        return { ok: false, status: anthropicStatus };
      return ok({ content: [{ type: "text", text: modelText }] });
    }
    if (init.headers?.accept?.includes("diff")) return ok(null, diff);
    if (url.endsWith("/comments?per_page=100")) return ok(comments);
    if (url.includes("/pulls/"))
      return ok({ title: "T", body: "B", head: { sha: "abcdef1234" } });
    return ok({});
  };
  const impl = (url, init = {}) => {
    calls.push({ url, method: init.method ?? "GET", body: init.body });
    return Promise.resolve(respond(url, init));
  };
  return { impl, calls };
}

const env = {
  ANTHROPIC_API_KEY: "k",
  GITHUB_TOKEN: "t",
  GITHUB_REPOSITORY: "o/r",
  PR_NUMBER: "7",
};
const goodModel = JSON.stringify({
  summary: "ok",
  verdict: "approve",
  findings: [],
});
const deps = (fetchImpl) => ({
  fetchImpl,
  readText: () => "RULES",
  exists: () => false,
  log: () => undefined,
});

test("run skips cleanly without an API key and never touches the network", async () => {
  const { impl, calls } = fakeFetch({
    modelText: goodModel,
    diff: section("a.py"),
  });
  assert.equal(await run({ ...env, ANTHROPIC_API_KEY: "" }, deps(impl)), 0);
  assert.equal(calls.length, 0);
});

test("run posts a new comment, and updates the existing marked one next time", async () => {
  const first = fakeFetch({ modelText: goodModel, diff: section("a.py") });
  assert.equal(await run(env, deps(first.impl)), 0);
  const post = first.calls.find(
    (c) => c.method === "POST" && c.url.includes("/issues/7/comments")
  );
  assert.ok(post, "expected a POST of a new comment");
  assert.match(JSON.parse(post.body).body, new RegExp(MARKER));

  const second = fakeFetch({
    comments: [
      { id: 99, body: `${MARKER}\nold` },
      { id: 5, body: "human" },
    ],
    modelText: goodModel,
    diff: section("a.py"),
  });
  await run(env, deps(second.impl));
  const patch = second.calls.find((c) => c.method === "PATCH");
  assert.ok(patch.url.endsWith("/issues/comments/99"));
  assert.ok(
    !second.calls.some(
      (c) => c.method === "POST" && c.url.includes("/issues/7/comments")
    )
  );
});

test("run sends only reviewable diff content to the model", async () => {
  const f = fakeFetch({
    modelText: goodModel,
    diff:
      section("pnpm-lock.yaml", "+secretish\n") +
      section("src/a.py", "+real\n"),
  });
  await run(env, deps(f.impl));
  const sent = f.calls.find((c) =>
    c.url.startsWith("https://api.anthropic.com")
  ).body;
  contains(sent, "real");
  assert.ok(!sent.includes("secretish"));
});

test("run is advisory: model outage or unparseable output never fails the job", async () => {
  const outage = fakeFetch({
    anthropicStatus: 529,
    modelText: "",
    diff: section("a.py"),
  });
  assert.equal(await run(env, deps(outage.impl)), 0);
  assert.ok(
    !outage.calls.some(
      (c) => c.method === "POST" && c.url.includes("/comments")
    )
  );

  const junk = fakeFetch({
    modelText: "I cannot do that",
    diff: section("a.py"),
  });
  assert.equal(await run(env, deps(junk.impl)), 0);
  assert.ok(
    !junk.calls.some((c) => c.method === "POST" && c.url.includes("/comments"))
  );
});

test("run skips a diff with nothing reviewable", async () => {
  const f = fakeFetch({
    modelText: goodModel,
    diff: section("pnpm-lock.yaml"),
  });
  await run(env, deps(f.impl));
  assert.ok(
    !f.calls.some((c) => c.url.startsWith("https://api.anthropic.com"))
  );
});
