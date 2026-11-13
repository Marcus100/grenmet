import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPublicAlert } from "@/lib/cap";
import type { AlertsResult } from "@/lib/cap-alerts";
import { redWarningIssuedAt } from "@/lib/red-warning";

vi.mock("@/lib/cap", () => ({ fetchPublicAlert: vi.fn() }));

type Detail = Awaited<ReturnType<typeof fetchPublicAlert>>;

const warning = (
  identifier: string,
  severity: "Extreme" | "Severe" | "Moderate" | "Minor",
  status: "Actual" | "Test" | "Exercise" | "Draft" = "Actual"
) => ({
  identifier,
  event: "Event",
  headline: "Headline",
  areas: ["Grenada"],
  expires: null,
  severity,
  status,
});

const feed = (...alerts: ReturnType<typeof warning>[]): AlertsResult =>
  ({
    status: "ok",
    activeCount: alerts.length,
    groups: [{ alerts }],
  }) as unknown as AlertsResult;

const detail = (sent: string): Detail =>
  ({
    status: "ok",
    alert: { identifier: "x", sent },
  }) as unknown as Detail;

beforeEach(() => {
  vi.mocked(fetchPublicAlert).mockReset();
});

describe("redWarningIssuedAt", () => {
  it("reads the CAP issue time of the red warning", async () => {
    vi.mocked(fetchPublicAlert).mockResolvedValue(
      detail("2026-11-01T12:00:00Z")
    );
    expect(await redWarningIssuedAt(feed(warning("red-1", "Extreme")))).toBe(
      Date.parse("2026-11-01T12:00:00Z")
    );
    expect(fetchPublicAlert).toHaveBeenCalledWith("red-1");
  });

  it("takes the earliest issue time when more than one red warning is in effect", async () => {
    vi.mocked(fetchPublicAlert).mockImplementation(async (identifier) =>
      identifier === "red-1"
        ? detail("2026-11-02T08:00:00Z")
        : detail("2026-11-01T12:00:00Z")
    );
    expect(
      await redWarningIssuedAt(
        feed(warning("red-1", "Severe"), warning("red-2", "Extreme"))
      )
    ).toBe(Date.parse("2026-11-01T12:00:00Z"));
  });

  it("skips every non-Actual red warning, not only test messages", async () => {
    expect(
      await redWarningIssuedAt(
        feed(
          warning("exercise", "Extreme", "Exercise"),
          warning("draft", "Extreme", "Draft")
        )
      )
    ).toBeNull();
    expect(fetchPublicAlert).not.toHaveBeenCalled();
  });

  it("looks at no warning below red", async () => {
    expect(
      await redWarningIssuedAt(
        feed(warning("amber", "Moderate"), warning("yellow", "Minor"))
      )
    ).toBeNull();
    expect(fetchPublicAlert).not.toHaveBeenCalled();
  });

  it("ignores a test warning, which never sets the level", async () => {
    expect(
      await redWarningIssuedAt(feed(warning("test", "Extreme", "Test")))
    ).toBeNull();
    expect(fetchPublicAlert).not.toHaveBeenCalled();
  });

  it("is unknown when any red warning cannot be read", async () => {
    vi.mocked(fetchPublicAlert).mockResolvedValue({ status: "unavailable" });
    expect(
      await redWarningIssuedAt(
        feed(warning("red-1", "Extreme"), warning("red-2", "Severe"))
      )
    ).toBeNull();
  });

  it("is unknown when the warnings feed itself is unavailable", async () => {
    expect(await redWarningIssuedAt({ status: "unavailable" })).toBeNull();
    expect(fetchPublicAlert).not.toHaveBeenCalled();
  });
});
