import { captureException } from "@sentry/nextjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reportError } from "./report-error";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

describe("reportError", () => {
  beforeEach(() => {
    vi.mocked(captureException).mockClear();
  });

  it("sends unexpected errors to Sentry with only the area tag", () => {
    const error = new Error("boom");
    reportError(error, "weather");
    expect(captureException).toHaveBeenCalledWith(error, {
      tags: { area: "weather" },
    });
  });

  it("reports 5xx responses", () => {
    reportError({ status: 503 }, "cap");
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("skips expected 4xx outcomes the UI already explains", () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
      reportError({ status }, "cap");
    }
    expect(captureException).not.toHaveBeenCalled();
  });
});
