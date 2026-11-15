// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ERROR_REPORT_EVENT, reportError } from "@/lib/report-error";
import { SECRET } from "@/test/fixtures";

afterEach(() => {
  vi.restoreAllMocks();
});

function capture() {
  const seen: unknown[] = [];
  const listener = (event: Event) => {
    seen.push((event as CustomEvent).detail);
  };
  window.addEventListener(ERROR_REPORT_EVENT, listener);
  return {
    seen,
    stop: () => window.removeEventListener(ERROR_REPORT_EVENT, listener),
  };
}

describe("reportError", () => {
  it("reports the area and the error's class, never its message", () => {
    const log = capture();
    reportError(new TypeError(`bad value ${SECRET}`), "camera");
    log.stop();
    expect(log.seen).toEqual([{ area: "camera", name: "TypeError" }]);
    expect(JSON.stringify(log.seen)).not.toContain(SECRET);
  });

  it("copes with something that is not an Error", () => {
    const log = capture();
    reportError("text", "sound");
    log.stop();
    expect(log.seen).toEqual([{ area: "sound", name: "string" }]);
  });

  it("prints nothing to the console", () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    reportError(new Error(SECRET), "camera");
    expect(error).not.toHaveBeenCalled();
  });
});
