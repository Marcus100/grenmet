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

it("keeps only the digest and area tags, dropping anything else", () => {
  const result = scrubSentryEvent({
    tags: { digest: "abc123", area: "cap", email: "private@example.test" },
  });
  expect(result.tags).toEqual({ digest: "abc123", area: "cap" });
  expect(scrubSentryEvent({ tags: { email: "private" } }).tags).toBeUndefined();
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
