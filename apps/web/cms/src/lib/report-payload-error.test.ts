import type { AfterErrorHookArgs } from "payload";
import { describe, expect, it, vi } from "vitest";

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException }));

import { reportPayloadError } from "./report-payload-error";

const run = (error: Error) =>
  reportPayloadError({ error } as unknown as AfterErrorHookArgs);

class StatusError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`status ${status}`);
    this.status = status;
  }
}

describe("reportPayloadError", () => {
  it("reports server failures and plain errors", async () => {
    const plain = new Error("database unavailable");
    await run(plain);
    await run(new StatusError(503));
    expect(captureException).toHaveBeenCalledWith(plain, {
      tags: { area: "cms" },
    });
    expect(captureException).toHaveBeenCalledTimes(2);
  });

  it("ignores expected client errors", async () => {
    captureException.mockClear();
    for (const status of [400, 401, 403, 404]) {
      await run(new StatusError(status));
    }
    expect(captureException).not.toHaveBeenCalled();
  });
});
