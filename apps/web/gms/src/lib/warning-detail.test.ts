import type {
  CapAlertPublic,
  CapAreaPublic,
  CapInfoPublic,
} from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import {
  formatWarningTime,
  recentlyEnded,
  toWarningDetail,
  warningHref,
} from "@/lib/warning-detail";

const LOCAL_SIX_PM = /6:00\s?pm AST$/;
const ENDS_AST = /AST$/;

function info(overrides: Partial<CapInfoPublic> = {}): CapInfoPublic {
  return {
    areas: [{ area_desc: "St. George" } as CapAreaPublic],
    certainty: "Likely",
    description: "Heavy showers tonight; 50 to 100 mm possible.",
    event: "Heavy Rainfall Watch",
    expires: "2026-09-25T10:00:00Z",
    headline: "Heavy rainfall likely from tonight",
    id: "00000000-0000-0000-0000-000000000001",
    instruction: "Avoid crossing flooded roads.",
    language: "en",
    onset: "2026-09-24T22:00:00Z",
    sequence: 0,
    severity: "Moderate",
    urgency: "Expected",
    ...overrides,
  };
}

function alert(overrides: Partial<CapAlertPublic> = {}): CapAlertPublic {
  return {
    created_at: "2026-09-24T12:00:00Z",
    created_by_user_id: "00000000-0000-0000-0000-000000000009",
    id: "00000000-0000-0000-0000-000000000002",
    identifier: "urn:oid:2.49.0.1.308.0.2026.1",
    info: [info()],
    lifecycle_state: "PUBLISHED",
    msg_type: "Alert",
    scope: "Public",
    sender: "gms@gaa.gd",
    sent: "2026-09-24T12:00:00Z",
    status: "Actual",
    updated_at: "2026-09-24T12:00:00Z",
    ...overrides,
  } as CapAlertPublic;
}

describe("formatWarningTime", () => {
  it("states Grenada local time with the zone", () => {
    expect(formatWarningTime("2026-09-24T22:00:00Z")).toMatch(LOCAL_SIX_PM);
  });

  it("returns null for missing or invalid times", () => {
    expect(formatWarningTime(null)).toBeNull();
    expect(formatWarningTime("not a date")).toBeNull();
  });
});

describe("warningHref", () => {
  it("encodes CAP identifiers safely", () => {
    expect(warningHref("urn:oid:2.49.0.1")).toBe(
      "/warnings/urn%3Aoid%3A2.49.0.1"
    );
  });
});

describe("toWarningDetail", () => {
  const now = new Date("2026-09-24T12:00:00Z");

  it("maps the content contract: expect, do, where, when, how likely", () => {
    const detail = toWarningDetail(alert(), now);
    expect(detail).toMatchObject({
      areas: ["St. George"],
      certainty: "Likely",
      ended: null,
      event: "Heavy Rainfall Watch",
      instruction: "Avoid crossing flooded roads.",
      whatToExpect: "Heavy showers tonight; 50 to 100 mm possible.",
    });
    expect(detail?.starts).toMatch(ENDS_AST);
  });

  it("prefers the English info block", () => {
    const detail = toWarningDetail(
      alert({
        info: [
          info({ headline: "Fortes pluies", language: "fr", sequence: 0 }),
          info({ language: "en-GB", sequence: 1 }),
        ],
      }),
      now
    );
    expect(detail?.headline).toBe("Heavy rainfall likely from tonight");
  });

  it("treats a blank instruction as absent", () => {
    expect(
      toWarningDetail(alert({ info: [info({ instruction: "  " })] }), now)
        ?.instruction
    ).toBeNull();
  });

  it("marks cancelled and expired alerts as ended", () => {
    expect(
      toWarningDetail(
        alert({
          cancellation_reason: "Hazard has ended",
          lifecycle_state: "CANCELLED",
        }),
        now
      )
    ).toMatchObject({
      cancellationReason: "Hazard has ended",
      ended: "cancelled",
    });
    expect(
      toWarningDetail(alert({ lifecycle_state: "EXPIRED" }), now)?.ended
    ).toBe("expired");
  });

  it("returns null without an info block", () => {
    expect(toWarningDetail(alert({ info: [] }), now)).toBeNull();
  });

  it("recognizes natural expiry without treating a replacement as an all-clear", () => {
    const later = new Date("2026-09-25T12:00:00Z");
    expect(toWarningDetail(alert(), later)?.ended).toBe("expired");
    expect(
      toWarningDetail(
        alert({ replaced_by_identifier: "urn:grenmet:cap:new" }),
        later
      )?.ended
    ).toBeNull();
  });
});

describe("recentlyEnded", () => {
  const now = new Date("2026-09-25T12:00:00Z");

  it("keeps real warnings that ended in the last 24 hours, newest first", () => {
    const ended = recentlyEnded(
      [
        alert({
          expired_at: "2026-09-25T02:00:00Z",
          identifier: "a",
          lifecycle_state: "EXPIRED",
        }),
        alert({
          expired_at: "2026-09-25T10:00:00Z",
          identifier: "b",
          lifecycle_state: "CANCELLED",
        }),
        alert({
          expired_at: "2026-09-23T10:00:00Z",
          identifier: "old",
          lifecycle_state: "EXPIRED",
        }),
      ],
      now
    );
    expect(ended.map((e) => [e.identifier, e.how])).toEqual([
      ["b", "cancelled"],
      ["a", "expired"],
    ]);
  });

  it("never shows an exercise as an all-clear", () => {
    expect(
      recentlyEnded(
        [
          alert({
            expired_at: "2026-09-25T10:00:00Z",
            lifecycle_state: "EXPIRED",
            status: "Exercise",
          }),
        ],
        now
      )
    ).toEqual([]);
  });

  it("shows natural expiry but excludes superseded messages", () => {
    const result = recentlyEnded(
      [
        alert({ identifier: "natural" }),
        alert({
          identifier: "replaced",
          lifecycle_state: "EXPIRED",
          replaced_by_identifier: "new-message",
        }),
      ],
      now
    );
    expect(result.map((item) => item.identifier)).toEqual(["natural"]);
  });
});
