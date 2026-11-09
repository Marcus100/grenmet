import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  compareEnvironment,
  formatReport,
  run,
  validateManifest,
} from "./check-environment-settings.mjs";

const MISSING_LINE = /MISSING {4}secret SECRET_KEY/u;
const PENDING_LINE = /pending {4}variable X \(absent\): why/u;
const STAGING_PENDING = /staging:\n {2}pending/u;
const SURPRISE = /UNEXPECTED secret SURPRISE/u;
const INVALID = /Invalid manifest/u;

const MANIFEST = {
  environments: ["staging", "production"],
  shared: { secrets: ["SECRET_KEY"], variables: ["CORE_PRIVATE_IP"] },
  only: {
    staging: {
      secrets: { STAGING_BASIC_AUTH_USERS: "gate" },
      variables: {},
    },
    production: { secrets: {}, variables: {} },
  },
  pending: {
    staging: { secrets: { DO_SPACES_BUCKET: "rename" }, variables: {} },
    production: { secrets: { STORAGE_BUCKET: "rename" }, variables: {} },
  },
};

describe("validateManifest", () => {
  it("accepts a well-formed manifest", () => {
    assert.deepEqual(validateManifest(MANIFEST), []);
  });

  it("accepts the checked-in manifest", () => {
    const manifest = JSON.parse(
      readFileSync(
        new URL("./environment-settings.json", import.meta.url),
        "utf8"
      )
    );
    assert.deepEqual(validateManifest(manifest), []);
  });

  it("rejects a name listed twice for one environment", () => {
    const manifest = structuredClone(MANIFEST);
    manifest.pending.staging.secrets.SECRET_KEY = "dup";
    assert.deepEqual(validateManifest(manifest), [
      "staging secrets: SECRET_KEY is listed in both shared and pending",
    ]);
  });

  it("rejects unknown environments and invalid names", () => {
    const manifest = structuredClone(MANIFEST);
    manifest.only.preview = { secrets: {} };
    manifest.shared.variables.push("lower-case");
    const errors = validateManifest(manifest);
    assert.ok(errors.includes("only.preview is not a listed environment"));
    assert.ok(
      errors.includes("staging variables: lower-case is not a valid name")
    );
  });
});

describe("compareEnvironment", () => {
  it("passes when names match, tolerating pending drift either way", () => {
    const result = compareEnvironment(MANIFEST, "staging", {
      secrets: ["SECRET_KEY", "STAGING_BASIC_AUTH_USERS", "DO_SPACES_BUCKET"],
      variables: ["CORE_PRIVATE_IP"],
    });
    assert.deepEqual(result.missing, []);
    assert.deepEqual(result.unexpected, []);
    assert.deepEqual(result.pending, [
      {
        kind: "secrets",
        name: "DO_SPACES_BUCKET",
        present: true,
        reason: "rename",
      },
    ]);
    const absent = compareEnvironment(MANIFEST, "production", {
      secrets: ["SECRET_KEY"],
      variables: ["CORE_PRIVATE_IP"],
    });
    assert.equal(absent.pending[0].present, false);
    assert.deepEqual(absent.missing, []);
  });

  it("reports missing shared and environment-only names", () => {
    const result = compareEnvironment(MANIFEST, "staging", {
      secrets: [],
      variables: [],
    });
    assert.deepEqual(result.missing, [
      { kind: "secrets", name: "SECRET_KEY" },
      { kind: "secrets", name: "STAGING_BASIC_AUTH_USERS" },
      { kind: "variables", name: "CORE_PRIVATE_IP" },
    ]);
  });

  it("reports names the manifest does not list, including another environment's only-names", () => {
    const result = compareEnvironment(MANIFEST, "production", {
      secrets: ["SECRET_KEY", "STAGING_BASIC_AUTH_USERS", "NEW_TOKEN"],
      variables: ["CORE_PRIVATE_IP"],
    });
    assert.deepEqual(result.unexpected, [
      { kind: "secrets", name: "NEW_TOKEN" },
      { kind: "secrets", name: "STAGING_BASIC_AUTH_USERS" },
    ]);
  });
});

describe("formatReport", () => {
  it("fails on drift and lists pending entries", () => {
    const report = formatReport([
      {
        environment: "staging",
        missing: [{ kind: "secrets", name: "SECRET_KEY" }],
        unexpected: [],
        pending: [
          { kind: "variables", name: "X", present: false, reason: "why" },
        ],
      },
    ]);
    assert.equal(report.ok, false);
    assert.match(report.text, MISSING_LINE);
    assert.match(report.text, PENDING_LINE);
  });
});

describe("run", () => {
  const actual = {
    staging: {
      secrets: ["SECRET_KEY", "STAGING_BASIC_AUTH_USERS"],
      variables: ["CORE_PRIVATE_IP"],
    },
    production: { secrets: ["SECRET_KEY"], variables: ["CORE_PRIVATE_IP"] },
  };

  function options(lines, overrides = {}) {
    return {
      names: (repository, environment, kind) => {
        assert.equal(repository, "owner/repo");
        return actual[environment][kind];
      },
      log: (line) => lines.push(line),
      readManifest: (path) => {
        assert.equal(path, "custom.json");
        return structuredClone(MANIFEST);
      },
      env: { GITHUB_REPOSITORY: "owner/repo" },
      ...overrides,
    };
  }

  it("asks only for names and exits 0 when everything matches", () => {
    const lines = [];
    const code = run(["--manifest", "custom.json"], options(lines));
    assert.equal(code, 0);
    assert.match(lines[0], STAGING_PENDING);
  });

  it("exits 1 on drift", () => {
    const lines = [];
    const code = run(
      ["--manifest", "custom.json"],
      options(lines, {
        names: (_repository, environment, kind) =>
          environment === "production" && kind === "secrets"
            ? ["SECRET_KEY", "SURPRISE"]
            : actual[environment][kind],
      })
    );
    assert.equal(code, 1);
    assert.match(lines[0], SURPRISE);
  });

  it("exits 1 on an invalid manifest without calling the API", () => {
    const lines = [];
    const broken = structuredClone(MANIFEST);
    broken.only.staging.secrets.SECRET_KEY = "dup";
    const code = run(["--manifest", "custom.json"], {
      ...options(lines),
      names: () => assert.fail("API called"),
      readManifest: () => broken,
    });
    assert.equal(code, 1);
    assert.match(lines[0], INVALID);
  });

  it("rejects a malformed repository before calling the API", () => {
    assert.throws(
      () =>
        run(["--repo", "not a repo"], {
          names: () => assert.fail("API called"),
        }),
      { message: "Invalid repository: not a repo" }
    );
  });
});
