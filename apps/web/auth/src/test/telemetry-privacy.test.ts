import {
  scrubSentryEvent,
  scrubSentryTransaction,
  sentryDataCollection,
} from "@barrelsgd/ui/lib/sentry-privacy";
import { expect, it } from "vitest";

it("removes sensitive Sentry context while retaining error types and stack locations", () => {
  const result = scrubSentryEvent({
    user: { email: "private@example.test" },
    request: { headers: { Authorization: "secret" }, data: "draft" },
    extra: { draft: "private" },
    breadcrumbs: [{ message: "private" }],
    contexts: { private: true },
    message: "private",
    exception: {
      values: [
        {
          type: "Error",
          value: "private",
          stacktrace: { frames: [{ filename: "app.ts", lineno: 10 }] },
        },
      ],
    },
  });
  expect(JSON.stringify(result)).not.toContain("private");
  expect(JSON.stringify(result)).not.toContain("secret");
  expect(result.exception.values[0]?.type).toBe("Error");
  expect(result.exception.values[0]?.stacktrace.frames[0]?.lineno).toBe(10);
});

it("keeps only the digest, area and request_id tags, dropping anything else", () => {
  const result = scrubSentryEvent({
    tags: {
      digest: "abc123",
      area: "cap",
      request_id: "req-12345678",
      email: "private@example.test",
    },
  });
  expect(result.tags).toEqual({
    digest: "abc123",
    area: "cap",
    request_id: "req-12345678",
  });
  expect(scrubSentryEvent({ tags: { email: "private" } }).tags).toBeUndefined();
});

it("keeps the internal user ID and org_id tag but no personal user fields", () => {
  const result = scrubSentryEvent({
    user: {
      id: "11111111-2222-3333-4444-555555555555",
      email: "private@example.test",
      username: "private-name",
      ip_address: "203.0.113.9",
      name: "Private Person",
    },
    tags: {
      org_id: "org-uuid-1",
      user_id: "11111111-2222-3333-4444-555555555555",
      phone: "private",
    },
  });
  expect(result.user).toEqual({ id: "11111111-2222-3333-4444-555555555555" });
  expect(result.tags).toEqual({
    org_id: "org-uuid-1",
    user_id: "11111111-2222-3333-4444-555555555555",
  });
  expect(JSON.stringify(result)).not.toContain("private");
  expect(JSON.stringify(result)).not.toContain("203.0.113.9");
  expect(
    scrubSentryEvent({ user: { email: "private@example.test" } }).user
  ).toBeUndefined();
});

it("drops unknown user keys and rejects an ID that looks like an email or name", () => {
  const withExtras = scrubSentryEvent({
    user: { id: "user_abc-123", geo: { city: "private" }, segment: "private" },
  });
  expect(withExtras.user).toEqual({ id: "user_abc-123" });
  for (const bad of [
    "private@example.test",
    "Private Person",
    "x".repeat(65),
  ]) {
    expect(scrubSentryEvent({ user: { id: bad } }).user).toBeUndefined();
    expect(scrubSentryEvent({ tags: { user_id: bad } }).tags).toBeUndefined();
  }
});

it("drops performance events until their sanitation and quota are verified", () => {
  expect(
    scrubSentryTransaction({
      spans: [{ data: { email: "private@example.test" } }],
    })
  ).toBeNull();
  const event = scrubSentryEvent({
    exception: {
      values: [{ stacktrace: { frames: [{ vars: { password: "private" } }] } }],
    },
  });
  expect(JSON.stringify(event)).not.toContain("private");
});

it("opts out of every Sentry 11 customer-content collection category", () => {
  expect(sentryDataCollection).toEqual({
    userInfo: false,
    cookies: false,
    httpHeaders: { request: false, response: false },
    httpBodies: [],
    urlQueryParams: false,
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    queues: false,
    graphQL: { document: false, variables: false },
    stackFrameVariables: false,
    frameContextLines: 0,
  });
});
