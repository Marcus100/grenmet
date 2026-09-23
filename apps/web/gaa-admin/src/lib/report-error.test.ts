import { describe, expect, it, vi } from "vitest";

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException }));

import { reportError } from "@/lib/report-error";

class HttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

describe("reportError", () => {
  it("reports server errors, network failures and bugs with their area", () => {
    for (const error of [
      new HttpError(503),
      new TypeError("fetch failed"),
      "string",
    ]) {
      captureException.mockClear();
      reportError(error, "cap");
      expect(captureException).toHaveBeenCalledWith(error, {
        tags: { area: "cap" },
      });
    }
  });

  it("skips expected 4xx outcomes the UI already explains", () => {
    captureException.mockClear();
    for (const status of [400, 401, 403, 404, 409, 422]) {
      reportError(new HttpError(status), "cap");
    }
    expect(captureException).not.toHaveBeenCalled();
  });
});
