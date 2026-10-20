import type { FeatureFlagAdmin } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import {
  audienceSummary,
  collectValues,
  dateToInstant,
  flagNoticeFor,
  parseFlagCreate,
  parseFlagUpdate,
  splitIds,
} from "@/lib/flag-form";

const USER = "11111111-1111-4111-8111-111111111111";

function form(values: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      data.append(key, item);
    }
  }
  return data;
}

const current: FeatureFlagAdmin = {
  id: "flag_1",
  key: "new-checkout",
  description: "Checkout",
  enabled: false,
  exposed: false,
  audience: { everyone: false, organisation_ids: ["gaa"], percentage: 10 },
  success_metric: null,
  owner: null,
  expires_at: null,
  review_by: "2026-12-01T09:30:00Z",
  stale: false,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

describe("parseFlagCreate", () => {
  it("builds an audience from the form fields", () => {
    const parsed = parseFlagCreate(
      form({
        key: "new-checkout",
        enabled: "on",
        success_metric: "Conversion",
        organisation_ids: "gaa, org_2  gaa",
        user_ids: USER,
        percentage: "25",
        environments: ["staging", "production"],
        review_by: "2026-12-01",
      })
    );
    expect(parsed).toEqual({
      ok: true,
      value: {
        key: "new-checkout",
        description: "",
        enabled: true,
        exposed: false,
        success_metric: "Conversion",
        owner: null,
        expires_at: null,
        review_by: "2026-12-01T00:00:00Z",
        audience: {
          everyone: false,
          organisation_ids: ["gaa", "org_2"],
          user_ids: [USER],
          percentage: 25,
          environments: ["staging", "production"],
        },
      },
    });
  });

  it.each([
    ["bad key", { key: "Bad_Key" }],
    ["percentage over 100", { key: "a", percentage: "101" }],
    ["fractional percentage", { key: "a", percentage: "1.5" }],
    ["non-uuid user", { key: "a", user_ids: "nobody" }],
    ["bad date", { key: "a", review_by: "31/12/2026" }],
  ])("rejects %s", (_name, values) => {
    expect(parseFlagCreate(form(values)).ok).toBe(false);
  });
});

describe("parseFlagUpdate", () => {
  const same = {
    description: "Checkout",
    organisation_ids: "gaa",
    percentage: "10",
    review_by: "2026-12-01",
  };

  it("sends nothing when the form matches the stored flag", () => {
    expect(parseFlagUpdate(form(same), current)).toEqual({
      ok: true,
      value: {},
    });
  });

  it("sends only what changed, including clears as null", () => {
    const parsed = parseFlagUpdate(
      form({
        ...same,
        enabled: "on",
        success_metric: "Conversion",
        percentage: "",
      }),
      current
    );
    expect(parsed).toEqual({
      ok: true,
      value: {
        enabled: true,
        success_metric: "Conversion",
        audience: {
          everyone: false,
          organisation_ids: ["gaa"],
          user_ids: [],
          percentage: null,
          environments: [],
        },
      },
    });
  });
});

describe("helpers", () => {
  it("summarises audiences", () => {
    expect(audienceSummary({})).toBe("Nobody");
    expect(
      audienceSummary({
        everyone: true,
        organisation_ids: ["a", "b"],
        percentage: 5,
        environments: ["production"],
      })
    ).toBe("Everyone, 2 organisations, 5% rollout (only in production)");
  });

  it("splits ids and parses dates", () => {
    expect(splitIds(" a,b\nc  a ")).toEqual(["a", "b", "c"]);
    expect(dateToInstant("2026-02-30")).toBeUndefined();
    expect(dateToInstant("2026-02-27")).toBe("2026-02-27T00:00:00Z");
  });

  it("keeps typed values and only knows fixed notice codes", () => {
    expect(collectValues(form({ key: "a", environments: ["local"] }))).toEqual({
      key: "a",
      environments: ["local"],
    });
    expect(flagNoticeFor("flag-created")?.tone).toBe("ok");
    expect(flagNoticeFor("<script>")).toBeUndefined();
  });
});
