import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class FakeAuthApiError extends Error {
    status: number;
    detail: string;
    constructor(status: number, detail: string) {
      super(detail);
      this.status = status;
      this.detail = detail;
    }
  }
  return {
    FakeAuthApiError,
    approveHazardProfile: vi.fn(),
    draftAlertFromHazardProfile: vi.fn(),
    getDeskGate: vi.fn(),
    reportError: vi.fn(),
    saveHazardProfileVersion: vi.fn(),
  };
});

vi.mock("@barrelsgd/auth", () => ({
  isAuthApiError: (error: unknown) => error instanceof mocks.FakeAuthApiError,
}));
vi.mock("@/lib/desk/gate", () => ({ getDeskGate: mocks.getDeskGate }));
vi.mock("@/lib/desk/api", () => ({
  approveHazardProfile: mocks.approveHazardProfile,
  draftAlertFromHazardProfile: mocks.draftAlertFromHazardProfile,
  saveHazardProfileVersion: mocks.saveHazardProfileVersion,
}));
vi.mock("@/lib/report-error", () => ({ reportError: mocks.reportError }));

import {
  approveHazardProfileAction,
  saveHazardProfileVersionAction,
  startAlertDraftFromProfileAction,
} from "./actions";

const { FakeAuthApiError } = mocks;
const PROFILE_ID = "11111111-2222-4333-8444-555555555555";
const STAFF = {
  accessToken: "token-abc",
  email: "reviewer@example.org",
  name: "Reviewer",
  permissions: { approve: true, libraryManage: true } as never,
  status: "staff",
  userId: "u2",
};

describe("approveHazardProfileAction", () => {
  beforeEach(() => {
    mocks.getDeskGate.mockReset();
    mocks.approveHazardProfile.mockReset();
    mocks.reportError.mockReset();
  });

  it("asks for sign-in when the session has ended", async () => {
    mocks.getDeskGate.mockResolvedValue({ status: "signed-out" });
    const outcome = await approveHazardProfileAction({ profileId: PROFILE_ID });
    expect(outcome).toMatchObject({ ok: false, error: { kind: "session" } });
    expect(mocks.approveHazardProfile).not.toHaveBeenCalled();
  });

  it("refuses without library or approval access, with no call", async () => {
    mocks.getDeskGate.mockResolvedValue({
      ...STAFF,
      permissions: { approve: true, libraryManage: false },
    });
    const outcome = await approveHazardProfileAction({ profileId: PROFILE_ID });
    expect(outcome).toMatchObject({
      ok: false,
      error: { kind: "not-allowed" },
    });
    expect(mocks.approveHazardProfile).not.toHaveBeenCalled();
  });

  it("rejects a malformed id before any call", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    const outcome = await approveHazardProfileAction({ profileId: "../x" });
    expect(outcome).toMatchObject({ ok: false, error: { kind: "state" } });
    expect(mocks.approveHazardProfile).not.toHaveBeenCalled();
  });

  it("approves with the staff token and returns the profile", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    const profile = { id: PROFILE_ID, state: "APPROVED" };
    mocks.approveHazardProfile.mockResolvedValue(profile);
    const outcome = await approveHazardProfileAction({ profileId: PROFILE_ID });
    expect(mocks.approveHazardProfile).toHaveBeenCalledWith(
      "token-abc",
      PROFILE_ID
    );
    expect(outcome).toEqual({ ok: true, profile });
  });

  it("shows the reviewer refusal from the API as a plain state error", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    mocks.approveHazardProfile.mockRejectedValue(
      new FakeAuthApiError(409, "A profile's author cannot approve it.")
    );
    const outcome = await approveHazardProfileAction({ profileId: PROFILE_ID });
    expect(outcome).toMatchObject({ ok: false, error: { kind: "state" } });
    expect(mocks.reportError).not.toHaveBeenCalled();
  });

  it("reports a server failure", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    mocks.approveHazardProfile.mockRejectedValue(
      new FakeAuthApiError(500, "boom")
    );
    const outcome = await approveHazardProfileAction({ profileId: PROFILE_ID });
    expect(outcome).toMatchObject({
      ok: false,
      error: { kind: "unavailable" },
    });
    expect(mocks.reportError).toHaveBeenCalledWith(
      expect.any(FakeAuthApiError),
      "cap-desk-profiles"
    );
  });

  it("lets an unexpected failure throw to error.tsx", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    mocks.approveHazardProfile.mockRejectedValue(new TypeError("network"));
    await expect(
      approveHazardProfileAction({ profileId: PROFILE_ID })
    ).rejects.toThrow("network");
  });
});

const DEFINITION = {
  channels: [],
  family: "Heavy rain and flooding",
  name: "Flood / Heavy Rain",
  subtypes: [
    {
      affected_groups: [],
      categories: ["Met"],
      id: "33333333-4444-4555-8666-777777777777",
      impacts: [],
      name: "Flash Flood",
      responses: [],
      rules: [],
    },
  ],
  templates: [],
};
const SAVED_PROFILE = {
  id: "22222222-3333-4444-8555-666666666666",
  key: "flood-heavy-rain",
  version: 3,
};
const WRITER = {
  accessToken: "token-abc",
  email: "writer@example.org",
  name: "Writer",
  permissions: {
    approve: false,
    create: true,
    libraryManage: true,
  } as never,
  status: "staff",
  userId: "u1",
};
const NO_LIBRARY = {
  ...WRITER,
  permissions: { approve: false, create: true, libraryManage: false } as never,
};
const NO_CREATE = {
  ...WRITER,
  permissions: { approve: false, create: false, libraryManage: true } as never,
};

describe("saveHazardProfileVersionAction", () => {
  beforeEach(() => {
    mocks.getDeskGate.mockReset();
    mocks.saveHazardProfileVersion.mockReset();
    mocks.reportError.mockReset();
  });

  it("asks for sign-in when the session has ended, with no call", async () => {
    mocks.getDeskGate.mockResolvedValue({ status: "signed-out" });
    const outcome = await saveHazardProfileVersionAction({
      baseVersion: 2,
      definition: DEFINITION,
      key: "flood-heavy-rain",
    });
    expect(outcome).toMatchObject({ ok: false, error: { kind: "session" } });
    expect(mocks.saveHazardProfileVersion).not.toHaveBeenCalled();
  });

  it("refuses a refused account with no call", async () => {
    mocks.getDeskGate.mockResolvedValue({ email: "x", status: "refused" });
    const outcome = await saveHazardProfileVersionAction({
      baseVersion: 2,
      definition: DEFINITION,
      key: "flood-heavy-rain",
    });
    expect(outcome).toMatchObject({
      ok: false,
      error: { kind: "not-allowed" },
    });
    expect(mocks.saveHazardProfileVersion).not.toHaveBeenCalled();
  });

  it("refuses without hazard library access, naming the reason", async () => {
    mocks.getDeskGate.mockResolvedValue(NO_LIBRARY);
    const outcome = await saveHazardProfileVersionAction({
      baseVersion: 2,
      definition: DEFINITION,
      key: "flood-heavy-rain",
    });
    expect(outcome).toMatchObject({
      ok: false,
      error: {
        items: [
          "You need hazard library access to draft a profile version. Ask a GMS administrator.",
        ],
        kind: "not-allowed",
      },
    });
    expect(mocks.saveHazardProfileVersion).not.toHaveBeenCalled();
  });

  it("rejects a malformed key before any call", async () => {
    mocks.getDeskGate.mockResolvedValue(WRITER);
    const outcome = await saveHazardProfileVersionAction({
      baseVersion: 2,
      definition: DEFINITION,
      key: "Flood Key!",
    });
    expect(outcome).toMatchObject({ ok: false, error: { kind: "validation" } });
    expect(mocks.saveHazardProfileVersion).not.toHaveBeenCalled();
  });

  it("rejects a definition the API schema refuses, before any call", async () => {
    mocks.getDeskGate.mockResolvedValue(WRITER);
    const outcome = await saveHazardProfileVersionAction({
      baseVersion: 2,
      definition: { ...DEFINITION, subtypes: [] },
      key: "flood-heavy-rain",
    });
    expect(outcome).toMatchObject({ ok: false, error: { kind: "validation" } });
    expect(mocks.saveHazardProfileVersion).not.toHaveBeenCalled();
  });

  it("saves a new draft from the base version and returns it", async () => {
    mocks.getDeskGate.mockResolvedValue(WRITER);
    mocks.saveHazardProfileVersion.mockResolvedValue(SAVED_PROFILE);
    const outcome = await saveHazardProfileVersionAction({
      baseVersion: 2,
      definition: DEFINITION,
      key: "flood-heavy-rain",
    });
    expect(mocks.saveHazardProfileVersion).toHaveBeenCalledWith(
      "token-abc",
      "flood-heavy-rain",
      {
        base_version: 2,
        definition: expect.objectContaining({ name: "Flood / Heavy Rain" }),
      }
    );
    expect(outcome).toEqual({ ok: true, profile: SAVED_PROFILE });
  });

  it("shows a concurrent-save refusal from the API as a state error", async () => {
    mocks.getDeskGate.mockResolvedValue(WRITER);
    mocks.saveHazardProfileVersion.mockRejectedValue(
      new FakeAuthApiError(
        409,
        "This profile changed. Reload before saving a new version."
      )
    );
    const outcome = await saveHazardProfileVersionAction({
      baseVersion: 2,
      definition: DEFINITION,
      key: "flood-heavy-rain",
    });
    expect(outcome).toMatchObject({
      ok: false,
      error: {
        items: ["This profile changed. Reload before saving a new version."],
        kind: "state",
      },
    });
    expect(mocks.reportError).not.toHaveBeenCalled();
  });

  it("lists the API's field problems for a refused save", async () => {
    mocks.getDeskGate.mockResolvedValue(WRITER);
    mocks.saveHazardProfileVersion.mockRejectedValue(
      new FakeAuthApiError(422, "Subtype names must be nonempty and unique")
    );
    const outcome = await saveHazardProfileVersionAction({
      baseVersion: 2,
      definition: DEFINITION,
      key: "flood-heavy-rain",
    });
    expect(outcome).toMatchObject({
      ok: false,
      error: {
        items: ["Subtype names must be nonempty and unique"],
        kind: "validation",
      },
    });
  });

  it("reports a server failure and returns an unavailable state", async () => {
    mocks.getDeskGate.mockResolvedValue(WRITER);
    mocks.saveHazardProfileVersion.mockRejectedValue(
      new FakeAuthApiError(500, "boom")
    );
    const outcome = await saveHazardProfileVersionAction({
      baseVersion: 2,
      definition: DEFINITION,
      key: "flood-heavy-rain",
    });
    expect(outcome).toMatchObject({
      ok: false,
      error: { kind: "unavailable" },
    });
    expect(mocks.reportError).toHaveBeenCalledWith(
      expect.any(FakeAuthApiError),
      "cap-desk-profiles"
    );
  });

  it("lets an unexpected failure throw to error.tsx", async () => {
    mocks.getDeskGate.mockResolvedValue(WRITER);
    mocks.saveHazardProfileVersion.mockRejectedValue(new TypeError("network"));
    await expect(
      saveHazardProfileVersionAction({
        baseVersion: 2,
        definition: DEFINITION,
        key: "flood-heavy-rain",
      })
    ).rejects.toThrow("network");
  });
});

const DRAFT_INPUT = {
  colour: "red",
  level: "Warning",
  profileId: PROFILE_ID,
  subtype: "Flash Flood",
};

describe("startAlertDraftFromProfileAction", () => {
  beforeEach(() => {
    mocks.getDeskGate.mockReset();
    mocks.draftAlertFromHazardProfile.mockReset();
    mocks.reportError.mockReset();
  });

  it("asks for sign-in when the session has ended, with no call", async () => {
    mocks.getDeskGate.mockResolvedValue({ status: "signed-out" });
    const outcome = await startAlertDraftFromProfileAction(DRAFT_INPUT);
    expect(outcome).toMatchObject({ ok: false, error: { kind: "session" } });
    expect(mocks.draftAlertFromHazardProfile).not.toHaveBeenCalled();
  });

  it("refuses without warning-creation access, with no call", async () => {
    mocks.getDeskGate.mockResolvedValue(NO_CREATE);
    const outcome = await startAlertDraftFromProfileAction(DRAFT_INPUT);
    expect(outcome).toMatchObject({
      ok: false,
      error: {
        items: [
          "You need warning-creation access to start a warning from a profile.",
        ],
        kind: "not-allowed",
      },
    });
    expect(mocks.draftAlertFromHazardProfile).not.toHaveBeenCalled();
  });

  it("rejects an unknown product before any call", async () => {
    mocks.getDeskGate.mockResolvedValue(WRITER);
    const outcome = await startAlertDraftFromProfileAction({
      ...DRAFT_INPUT,
      level: "Watchy",
    });
    expect(outcome).toMatchObject({ ok: false, error: { kind: "validation" } });
    expect(mocks.draftAlertFromHazardProfile).not.toHaveBeenCalled();
  });

  it("rejects a malformed profile id before any call", async () => {
    mocks.getDeskGate.mockResolvedValue(WRITER);
    const outcome = await startAlertDraftFromProfileAction({
      ...DRAFT_INPUT,
      profileId: "../x",
    });
    expect(outcome).toMatchObject({ ok: false, error: { kind: "validation" } });
    expect(mocks.draftAlertFromHazardProfile).not.toHaveBeenCalled();
  });

  it("starts a draft and returns its id; nothing is submitted or published", async () => {
    mocks.getDeskGate.mockResolvedValue(WRITER);
    mocks.draftAlertFromHazardProfile.mockResolvedValue({
      id: "44444444-5555-4666-8777-888888888888",
      lifecycle_state: "DRAFT",
    });
    const outcome = await startAlertDraftFromProfileAction(DRAFT_INPUT);
    expect(mocks.draftAlertFromHazardProfile).toHaveBeenCalledWith(
      "token-abc",
      PROFILE_ID,
      { colour: "red", level: "Warning", subtype: "Flash Flood" }
    );
    expect(outcome).toEqual({
      alertId: "44444444-5555-4666-8777-888888888888",
      ok: true,
    });
  });

  it("shows the API's refusal for an unapproved or colourless draft", async () => {
    mocks.getDeskGate.mockResolvedValue(WRITER);
    mocks.draftAlertFromHazardProfile.mockRejectedValue(
      new FakeAuthApiError(
        409,
        "Approve the profile before using it to start an alert."
      )
    );
    const outcome = await startAlertDraftFromProfileAction(DRAFT_INPUT);
    expect(outcome).toMatchObject({
      ok: false,
      error: {
        items: ["Approve the profile before using it to start an alert."],
        kind: "state",
      },
    });
  });

  it("reports a server failure and returns an unavailable state", async () => {
    mocks.getDeskGate.mockResolvedValue(WRITER);
    mocks.draftAlertFromHazardProfile.mockRejectedValue(
      new FakeAuthApiError(500, "boom")
    );
    const outcome = await startAlertDraftFromProfileAction(DRAFT_INPUT);
    expect(outcome).toMatchObject({
      ok: false,
      error: { kind: "unavailable" },
    });
    expect(mocks.reportError).toHaveBeenCalledWith(
      expect.any(FakeAuthApiError),
      "cap-desk-profiles"
    );
  });
});
