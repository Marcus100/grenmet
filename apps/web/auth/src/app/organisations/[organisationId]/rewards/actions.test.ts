import { beforeEach, describe, expect, it, vi } from "vitest";

const lib = vi.hoisted(() => ({
  addTrailStop: vi.fn(),
  confirmRedemption: vi.fn(),
  createAchievement: vi.fn(),
  createChallenge: vi.fn(),
  createProgramme: vi.fn(),
  createTrail: vi.fn(),
  createVenue: vi.fn(),
  setChallengePaused: vi.fn(),
  setProgrammePaused: vi.fn(),
  updateTrail: vi.fn(),
}));
const reportError = vi.hoisted(() => vi.fn());
const readSessionCookie = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  })
);
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/org-rewards", () => lib);
vi.mock("@/lib/report-error", () => ({ reportError }));
vi.mock("@/lib/session", () => ({
  exchangeSessionForAccessToken: vi
    .fn()
    .mockResolvedValue({ access_token: "access" }),
  readSessionCookie,
}));

import {
  addTrailStopAction,
  confirmRedemptionAction,
  createAchievementAction,
  createChallengeAction,
  createProgrammeAction,
  createTrailAction,
  createVenueAction,
  setChallengeStatusAction,
  setProgrammeStatusAction,
  setTrailStatusAction,
} from "./actions";
import { IDLE } from "./state";

const UUID = "11111111-1111-4111-8111-111111111111";
const VENUE = "22222222-2222-4222-8222-222222222222";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  data.set("organisation_id", "org_1");
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

function apiError(status: number, data: unknown = {}) {
  return Object.assign(new Error(`status ${status}`), { data, status });
}

async function redirected(call: Promise<unknown>): Promise<string> {
  try {
    await call;
  } catch (error) {
    return error instanceof Error ? error.message.replace("REDIRECT:", "") : "";
  }
  return "no redirect";
}

beforeEach(() => {
  vi.clearAllMocks();
  readSessionCookie.mockResolvedValue("session");
});

describe("shared behaviour", () => {
  it("sends signed-out visitors to sign in without calling the API", async () => {
    readSessionCookie.mockResolvedValue(null);
    expect(
      await redirected(createVenueAction(IDLE, form({ name: "Market" })))
    ).toBe("/");
    expect(lib.createVenue).not.toHaveBeenCalled();
  });

  it("rejects a malformed organisation id", async () => {
    const result = await createVenueAction(
      IDLE,
      form({ name: "Market", organisation_id: "org/../x" })
    );
    expect(result.status).toBe("error");
    expect(lib.createVenue).not.toHaveBeenCalled();
  });

  it("acts for the organisation in the form and refreshes its page", async () => {
    lib.createVenue.mockResolvedValue({});
    const result = await createVenueAction(IDLE, form({ name: "Market" }));
    expect(result).toEqual({ message: 'Venue "Market" added.', status: "ok" });
    expect(lib.createVenue).toHaveBeenCalledWith("access", "org_1", "Market");
    expect(revalidatePath).toHaveBeenCalledWith("/organisations/org_1/rewards");
  });

  it("sends an expired session back to sign in", async () => {
    lib.createVenue.mockRejectedValue(apiError(401));
    expect(
      await redirected(createVenueAction(IDLE, form({ name: "Market" })))
    ).toBe("/?session=expired");
  });

  it("explains a missing entitlement or role on 403", async () => {
    lib.createVenue.mockRejectedValue(
      apiError(403, { detail: "This organisation is not entitled to this app" })
    );
    const result = await createVenueAction(IDLE, form({ name: "Market" }));
    expect(result.message).toContain("isn't switched on");
    lib.createVenue.mockRejectedValue(apiError(403, { detail: "Forbidden" }));
    expect(
      (await createVenueAction(IDLE, form({ name: "Market" }))).message
    ).toContain("Only owners and admins");
  });

  it("reports unexpected failures and shows a generic message", async () => {
    const failure = apiError(500);
    lib.createVenue.mockRejectedValue(failure);
    const result = await createVenueAction(IDLE, form({ name: "Market" }));
    expect(result.status).toBe("error");
    expect(reportError).toHaveBeenCalledWith(
      failure,
      "org-rewards-venue-create"
    );
  });
});

describe("stamp cards", () => {
  const fields = {
    max_redemptions_per_account: "",
    name: "Coffee card",
    qualifying_source_type: "rewards.venue_check_in",
    reward_description: "A free coffee",
    stamps_per_source: "1",
    stamps_required: "8",
  };

  it("creates with the catalogue source and no cap", async () => {
    lib.createProgramme.mockResolvedValue({});
    const result = await createProgrammeAction(IDLE, form(fields));
    expect(result.status).toBe("ok");
    expect(lib.createProgramme).toHaveBeenCalledWith("access", "org_1", {
      max_redemptions_per_account: null,
      name: "Coffee card",
      qualifying_source_type: "rewards.venue_check_in",
      reward_description: "A free coffee",
      stamps_per_source: 1,
      stamps_required: 8,
    });
  });

  it.each([
    [{ stamps_required: "0" }],
    [{ stamps_required: "101" }],
    [{ stamps_required: "many" }],
    [{ stamps_per_source: "11" }],
    [{ max_redemptions_per_account: "x" }],
    [{ qualifying_source_type: "app.opened" }],
    [{ name: "" }],
  ])("rejects %j before calling the API", async (change) => {
    const result = await createProgrammeAction(
      IDLE,
      form({ ...fields, ...change })
    );
    expect(result.status).toBe("error");
    expect(lib.createProgramme).not.toHaveBeenCalled();
  });

  it("shows the API's 422 text", async () => {
    lib.createProgramme.mockRejectedValue(
      apiError(422, {
        errors: [
          { loc: ["body"], msg: "Value error, Unknown source", type: "x" },
        ],
      })
    );
    const result = await createProgrammeAction(IDLE, form(fields));
    expect(result).toEqual({ message: "Unknown source", status: "error" });
  });

  it("pauses and resumes", async () => {
    lib.setProgrammePaused.mockResolvedValue({});
    expect(
      await setProgrammeStatusAction(
        IDLE,
        form({ pause: "true", program_id: UUID })
      )
    ).toEqual({ message: "Stamp card paused.", status: "ok" });
    expect(lib.setProgrammePaused).toHaveBeenLastCalledWith(
      "access",
      "org_1",
      UUID,
      true
    );
    expect(
      (
        await setProgrammeStatusAction(
          IDLE,
          form({ pause: "false", program_id: UUID })
        )
      ).message
    ).toBe("Stamp card resumed.");
    expect(lib.setProgrammePaused).toHaveBeenLastCalledWith(
      "access",
      "org_1",
      UUID,
      false
    );
  });

  it("refuses a programme id that isn't a uuid", async () => {
    const result = await setProgrammeStatusAction(
      IDLE,
      form({ pause: "true", program_id: "../x" })
    );
    expect(result.status).toBe("error");
    expect(lib.setProgrammePaused).not.toHaveBeenCalled();
  });
});

describe("redeem code", () => {
  it("confirms the one-time code and says what to hand over", async () => {
    lib.confirmRedemption.mockResolvedValue({
      confirmed_at: "x",
      program_name: "Coffee card",
      reward_description: "A free coffee",
      stamps: 8,
    });
    const result = await confirmRedemptionAction(
      IDLE,
      form({ code: " AB12CD34 " })
    );
    expect(lib.confirmRedemption).toHaveBeenCalledWith(
      "access",
      "org_1",
      "AB12CD34"
    );
    expect(result.status).toBe("ok");
    expect(result.message).toContain("Coffee card, A free coffee (8 stamps)");
  });

  it("answers a 404 (another organisation's or used code) with one generic message", async () => {
    lib.confirmRedemption.mockRejectedValue(apiError(404));
    const result = await confirmRedemptionAction(
      IDLE,
      form({ code: "AB12CD34" })
    );
    expect(result).toEqual({
      message:
        "That code isn't valid for this organisation, or it was already used.",
      status: "error",
    });
  });

  it("rejects an empty or oversized code without calling the API", async () => {
    expect(
      (await confirmRedemptionAction(IDLE, form({ code: "" }))).status
    ).toBe("error");
    expect(
      (await confirmRedemptionAction(IDLE, form({ code: "x".repeat(40) })))
        .status
    ).toBe("error");
    expect(lib.confirmRedemption).not.toHaveBeenCalled();
  });
});

describe("trails and stops", () => {
  it("creates a trail", async () => {
    lib.createTrail.mockResolvedValue({});
    const result = await createTrailAction(
      IDLE,
      form({
        description: "",
        ends_on: "2026-12-31",
        kind: "parish",
        name: "Parish Explorer",
        starts_on: "2026-11-01",
        status: "active",
      })
    );
    expect(result.status).toBe("ok");
    expect(lib.createTrail).toHaveBeenCalledWith("access", "org_1", {
      description: "",
      ends_on: "2026-12-31",
      kind: "parish",
      name: "Parish Explorer",
      starts_on: "2026-11-01",
      status: "active",
    });
  });

  it("rejects a reversed date window and unknown kinds", async () => {
    const base = { kind: "custom", name: "T", status: "active" };
    expect(
      (
        await createTrailAction(
          IDLE,
          form({ ...base, ends_on: "2026-01-01", starts_on: "2026-02-01" })
        )
      ).status
    ).toBe("error");
    expect(
      (await createTrailAction(IDLE, form({ ...base, kind: "x" }))).status
    ).toBe("error");
    expect(lib.createTrail).not.toHaveBeenCalled();
  });

  it("activates and pauses with PATCH status values", async () => {
    lib.updateTrail.mockResolvedValue({});
    await setTrailStatusAction(IDLE, form({ status: "draft", trail_id: UUID }));
    expect(lib.updateTrail).toHaveBeenLastCalledWith("access", "org_1", UUID, {
      status: "draft",
    });
    const result = await setTrailStatusAction(
      IDLE,
      form({ status: "active", trail_id: UUID })
    );
    expect(result.message).toBe("Trail activated.");
    expect(
      (
        await setTrailStatusAction(
          IDLE,
          form({ status: "archived", trail_id: UUID })
        )
      ).status
    ).toBe("error");
  });

  it("adds a stop at the end with its venue", async () => {
    lib.addTrailStop.mockResolvedValue({});
    const data = form({ label: "Gouyave", trail_id: UUID, venue_id: VENUE });
    data.set("required_check_in", "on");
    const result = await addTrailStopAction(IDLE, data);
    expect(result.status).toBe("ok");
    expect(lib.addTrailStop).toHaveBeenCalledWith("access", "org_1", UUID, {
      label: "Gouyave",
      required_check_in: true,
      venue_id: VENUE,
    });
  });

  it("requires a venue for a stop that needs a check-in", async () => {
    const data = form({ label: "Gouyave", trail_id: UUID, venue_id: "" });
    data.set("required_check_in", "on");
    expect((await addTrailStopAction(IDLE, data)).message).toContain(
      "must have a venue"
    );
    expect(lib.addTrailStop).not.toHaveBeenCalled();
  });

  it("allows an informational stop without a venue", async () => {
    lib.addTrailStop.mockResolvedValue({});
    const result = await addTrailStopAction(
      IDLE,
      form({ label: "Lookout", trail_id: UUID, venue_id: "" })
    );
    expect(result.status).toBe("ok");
    expect(lib.addTrailStop).toHaveBeenCalledWith("access", "org_1", UUID, {
      label: "Lookout",
      required_check_in: false,
      venue_id: null,
    });
  });
});

describe("achievements", () => {
  const base = { description: "", key: "regular", name: "Regular" };

  it("builds parameters for each rule type", async () => {
    lib.createAchievement.mockResolvedValue({});
    await createAchievementAction(
      IDLE,
      form({ ...base, n: "5", rule_type: "attended_n_events" })
    );
    expect(lib.createAchievement).toHaveBeenLastCalledWith(
      "access",
      "org_1",
      expect.objectContaining({
        parameters: { n: 5 },
        rule_type: "attended_n_events",
      })
    );
    await createAchievementAction(
      IDLE,
      form({ ...base, days: "7", rule_type: "streak_days" })
    );
    expect(lib.createAchievement).toHaveBeenLastCalledWith(
      "access",
      "org_1",
      expect.objectContaining({ parameters: { days: 7 } })
    );
    await createAchievementAction(
      IDLE,
      form({ ...base, rule_type: "visited_all_stops_of_trail", trail_id: UUID })
    );
    expect(lib.createAchievement).toHaveBeenLastCalledWith(
      "access",
      "org_1",
      expect.objectContaining({ parameters: { trail_id: UUID } })
    );
  });

  it("validates parameters before calling the API", async () => {
    const bad = await createAchievementAction(
      IDLE,
      form({ ...base, n: "0", rule_type: "attended_n_events" })
    );
    expect(bad.status).toBe("error");
    expect(lib.createAchievement).not.toHaveBeenCalled();
  });

  it("shows the API's error text", async () => {
    lib.createAchievement.mockRejectedValue(
      apiError(422, { detail: "Trail not found" })
    );
    const result = await createAchievementAction(
      IDLE,
      form({ ...base, rule_type: "visited_all_stops_of_trail", trail_id: UUID })
    );
    expect(result.message).toBe("Trail not found");
  });
});

describe("challenges", () => {
  const fields = {
    description: "",
    ends_on: "2026-11-30",
    metric: "venue_check_ins",
    name: "500 check-ins",
    reward_description: "A shout-out",
    starts_on: "2026-11-01",
    target_total: "500",
  };

  it("sends Grenada-time day boundaries as UTC instants", async () => {
    lib.createChallenge.mockResolvedValue({});
    const result = await createChallengeAction(IDLE, form(fields));
    expect(result.status).toBe("ok");
    expect(lib.createChallenge).toHaveBeenCalledWith(
      "access",
      "org_1",
      expect.objectContaining({
        ends_at: "2026-12-01T03:59:59.000Z",
        starts_at: "2026-11-01T04:00:00.000Z",
        target_total: 500,
      })
    );
  });

  it("validates the window and the target", async () => {
    expect(
      (
        await createChallengeAction(
          IDLE,
          form({ ...fields, ends_on: "2026-10-01" })
        )
      ).status
    ).toBe("error");
    expect(
      (
        await createChallengeAction(
          IDLE,
          form({ ...fields, target_total: "0" })
        )
      ).status
    ).toBe("error");
    expect(lib.createChallenge).not.toHaveBeenCalled();
  });

  it("says challenges aren't enabled on a 404 (flag off)", async () => {
    lib.createChallenge.mockRejectedValue(apiError(404));
    const result = await createChallengeAction(IDLE, form(fields));
    expect(result.message).toContain(
      "aren't enabled for your organisation yet"
    );
    lib.setChallengePaused.mockRejectedValue(apiError(404));
    expect(
      (
        await setChallengeStatusAction(
          IDLE,
          form({ challenge_id: UUID, pause: "true" })
        )
      ).message
    ).toContain("aren't enabled");
  });

  it("pauses and resumes", async () => {
    lib.setChallengePaused.mockResolvedValue({});
    await setChallengeStatusAction(
      IDLE,
      form({ challenge_id: UUID, pause: "true" })
    );
    expect(lib.setChallengePaused).toHaveBeenLastCalledWith(
      "access",
      "org_1",
      UUID,
      true
    );
    const result = await setChallengeStatusAction(
      IDLE,
      form({ challenge_id: UUID, pause: "false" })
    );
    expect(result.message).toBe("Challenge resumed.");
  });
});
