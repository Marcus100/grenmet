import { describe, expect, it, vi } from "vitest";
import {
  type CaptureError,
  createReportError,
  shouldReportError,
} from "./report-error";

describe("shouldReportError", () => {
  it("reports errors without an HTTP status, including bugs", () => {
    expect(shouldReportError(new Error("boom"))).toBe(true);
    expect(shouldReportError("network failure")).toBe(true);
    expect(shouldReportError(null)).toBe(true);
    expect(shouldReportError({ message: "no status" })).toBe(true);
  });

  it("reports 5xx responses and non-numeric statuses", () => {
    expect(shouldReportError({ status: 500 })).toBe(true);
    expect(shouldReportError({ status: 503 })).toBe(true);
    expect(shouldReportError({ status: "404" })).toBe(true);
  });

  it("skips expected 4xx outcomes at both boundaries", () => {
    expect(shouldReportError({ status: 400 })).toBe(false);
    expect(shouldReportError({ status: 401 })).toBe(false);
    expect(shouldReportError({ status: 403 })).toBe(false);
    expect(shouldReportError({ status: 404 })).toBe(false);
    expect(shouldReportError({ status: 409 })).toBe(false);
    expect(shouldReportError({ status: 422 })).toBe(false);
    expect(shouldReportError({ status: 499 })).toBe(false);
  });

  it("reports statuses just outside the 4xx range", () => {
    expect(shouldReportError({ status: 399 })).toBe(true);
    expect(shouldReportError({ status: 500 })).toBe(true);
  });
});

describe("createReportError", () => {
  it("passes only the area tag to the app's capture function", () => {
    const capture = vi.fn<CaptureError>();
    const reportError = createReportError(capture);
    const error = new Error("boom");

    reportError(error, "weather");

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(error, {
      tags: { area: "weather" },
    });
  });

  it("does not call capture for expected 4xx outcomes", () => {
    const capture = vi.fn<CaptureError>();
    const reportError = createReportError(capture);

    reportError({ status: 409 }, "cap");

    expect(capture).not.toHaveBeenCalled();
  });

  it("keeps each reporter bound to its own capture function", () => {
    const captureA = vi.fn<CaptureError>();
    const captureB = vi.fn<CaptureError>();
    const reportA = createReportError(captureA);
    const reportB = createReportError(captureB);

    reportA({ status: 502 }, "auth");

    expect(captureA).toHaveBeenCalledTimes(1);
    expect(captureB).not.toHaveBeenCalled();
    reportB(new Error("x"), "events");
    expect(captureB).toHaveBeenCalledTimes(1);
  });
});
