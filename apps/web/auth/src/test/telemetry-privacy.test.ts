import { scrubSentryEvent } from "@barrelsgd/ui/lib/sentry-privacy";
import { beforeEach, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ capture: vi.fn(), shutdown: vi.fn() }));
vi.mock("posthog-node", () => ({
  PostHog: class {
    capture = sdk.capture;
    shutdown = sdk.shutdown;
  },
}));
vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_POSTHOG_KEY: "test-key",
    NEXT_PUBLIC_POSTHOG_HOST: "https://example.test",
  },
}));

import { captureServerEvent } from "@/lib/posthog-server";

beforeEach(() => {
  sdk.capture.mockReset();
  sdk.shutdown.mockReset();
});

it("counts auth outcomes without a session token or email identifier", async () => {
  await captureServerEvent("sign_in");
  await captureServerEvent("sign_out");
  const first = sdk.capture.mock.calls[0]?.[0];
  const second = sdk.capture.mock.calls[1]?.[0];
  expect(first.distinctId).not.toBe(second.distinctId);
  expect(first).toEqual({
    distinctId: expect.any(String),
    event: "sign_in",
    properties: { $process_person_profile: false, $geoip_disable: true },
  });
});

it("does not propagate analytics failures into authentication", async () => {
  sdk.shutdown.mockRejectedValue(new Error("provider unavailable"));
  await expect(captureServerEvent("sign_out")).resolves.toBeUndefined();
  sdk.capture.mockImplementation(() => {
    throw new Error("capture failure");
  });
  await expect(captureServerEvent("sign_in")).resolves.toBeUndefined();
});

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
