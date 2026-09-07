const missingUrl = /TRANSPORT_DATABASE_URL is required/;
const wrongDatabase = /configured domain database/;

import assert from "node:assert/strict";
import test from "node:test";
import { databaseConfig } from "./database-config.mjs";

test("requires a dedicated URL without exposing credentials", () => {
  assert.throws(
    () => databaseConfig("transport", { DATABASE_URL: "postgres://secret" }),
    missingUrl
  );
  assert.throws(
    () =>
      databaseConfig("transport", {
        TRANSPORT_DATABASE_URL: "postgres://user:secret@host/app_prod",
      }),
    wrongDatabase
  );
});

test("local and staging names are distinct", () => {
  assert.equal(
    databaseConfig("wxwatch", {
      WXWATCH_DATABASE_URL: "postgres://user:p%40ss@localhost/wxwatch",
    }).connectionTimeoutMillis,
    10_000
  );
  assert.throws(() =>
    databaseConfig("wxwatch", {
      ENVIRONMENT: "staging",
      WXWATCH_DATABASE_URL: "postgres://user:secret@host/wxwatch",
    })
  );
  assert.ok(
    databaseConfig("wxwatch", {
      ENVIRONMENT: "staging",
      WXWATCH_DATABASE_URL: "postgres://user:secret@host/wxwatch_staging",
    })
  );
});

test("preserves explicitly configured names but refuses application and test databases", () => {
  assert.ok(
    databaseConfig("wxwatch", {
      WXWATCH_DB_NAME: "existing_weather",
      WXWATCH_DATABASE_URL: "postgres://user:secret@host/existing_weather",
    })
  );
  assert.throws(() =>
    databaseConfig("wxwatch", {
      WXWATCH_DB_NAME: "app_test",
      WXWATCH_DATABASE_URL: "postgres://user:secret@host/app_test",
    })
  );
  assert.throws(() =>
    databaseConfig("wxwatch", {
      WXWATCH_DATABASE_URL: "https://user:secret@host/wxwatch",
    })
  );
});
