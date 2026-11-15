import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  revoke: vi.fn(),
  report: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("@barrelsgd/auth", () => ({
  isAuthApiError: (error: unknown) =>
    typeof error === "object" && error !== null && "status" in error,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
vi.mock("@/lib/report-error", () => ({ reportError: mocks.report }));
vi.mock("@/lib/staff-gate", () => ({
  requireGate: async () => ({
    status: "staff",
    accessToken: "staff-token",
    email: "ops@example.org",
    name: "Ops",
  }),
}));
vi.mock("@/lib/superuser-invitations-api", () => ({
  createSuperuserInvitation: mocks.create,
  revokeSuperuserInvitation: mocks.revoke,
}));

import { INVITED_NOTICE } from "@/lib/superuser-invitation-form";
import {
  type InviteFormState,
  inviteSuperuserAction,
  revokeSuperuserInvitationAction,
} from "./actions";

const INVITATION_ID = "3f2b8c1e-9a4d-4e7f-8b2a-1c2d3e4f5a6b";
const REASON = "Operations lead for the platform";
const PREVIOUS: InviteFormState = {
  message: null,
  notice: null,
  resetKey: 4,
  values: { email: "", reason: "" },
};

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function apiError(status: number, detail = "x"): Error {
  return Object.assign(new Error("api"), { status, detail });
}

function validInvite(): FormData {
  return form({ email: "new.admin@example.org", reason: REASON });
}

/** The redirect helper throws, as Next does; this captures where it sent the page. */
async function redirectedTo(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return message.replace("NEXT_REDIRECT ", "");
  }
  throw new Error("expected a redirect");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("inviteSuperuserAction: outcomes", () => {
  it("success clears the fields, shows the invited notice and does not redirect", async () => {
    mocks.create.mockResolvedValue({ id: INVITATION_ID });
    const state = await inviteSuperuserAction(PREVIOUS, validInvite());
    expect(state.notice).toBe(INVITED_NOTICE);
    expect(state.message).toBeNull();
    expect(state.values).toEqual({ email: "", reason: "" });
    expect(state.resetKey).toBe(PREVIOUS.resetKey + 1);
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it("a validation refusal keeps what was typed and calls nothing", async () => {
    const state = await inviteSuperuserAction(
      PREVIOUS,
      form({ email: "a@example.org", reason: "short" })
    );
    expect(state.message).toContain("10 to 500 characters");
    expect(state.values).toEqual({ email: "a@example.org", reason: "short" });
    expect(state.resetKey).toBe(PREVIOUS.resetKey);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each([
    [400, "cannot be invited"],
    [409, "is being sent"],
    [422, "Check the email address"],
    [429, "too many invitations"],
  ])(
    "maps API status %i to a readable message and keeps the values",
    async (status, text) => {
      mocks.create.mockRejectedValue(apiError(status));
      const state = await inviteSuperuserAction(PREVIOUS, validInvite());
      expect(state.message?.toLowerCase()).toContain(text.toLowerCase());
      expect(state.values.email).toBe("new.admin@example.org");
      expect(state.notice).toBeNull();
      expect(mocks.report).not.toHaveBeenCalled();
    }
  );

  it("a 403 without an authenticator says to set one up, and is not reported", async () => {
    mocks.create.mockRejectedValue(
      apiError(403, "superuser_mfa_required: set up two-step verification")
    );
    const state = await inviteSuperuserAction(PREVIOUS, validInvite());
    expect(state.message).toContain("Set up your authenticator");
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it("a 403 for a session without two-step sign-in says to sign in again", async () => {
    mocks.create.mockRejectedValue(
      apiError(403, "Sign in again with your authenticator or recovery code")
    );
    const state = await inviteSuperuserAction(PREVIOUS, validInvite());
    expect(state.message).toContain("Sign in again");
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it("a 401 sends the person to sign in again", async () => {
    mocks.create.mockRejectedValue(apiError(401));
    expect(
      await redirectedTo(inviteSuperuserAction(PREVIOUS, validInvite()))
    ).toBe("/signin?sign_in=expired");
  });

  it("reports a server fault, with a generic message", async () => {
    mocks.create.mockRejectedValue(apiError(500, "internal detail"));
    const state = await inviteSuperuserAction(PREVIOUS, validInvite());
    expect(state.message).toBe(
      "The invitation was not sent. Nothing was changed."
    );
    expect(state.message).not.toContain("internal detail");
    expect(mocks.report).toHaveBeenCalledOnce();
  });

  it("rethrows a failure that is not an API error", async () => {
    mocks.create.mockRejectedValue(new TypeError("network down"));
    await expect(
      inviteSuperuserAction(PREVIOUS, validInvite())
    ).rejects.toThrow("network down");
  });
});

describe("revokeSuperuserInvitationAction", () => {
  it("success redirects with the revoked notice", async () => {
    mocks.revoke.mockResolvedValue({ id: INVITATION_ID });
    expect(
      await redirectedTo(
        revokeSuperuserInvitationAction(form({ invitation_id: INVITATION_ID }))
      )
    ).toBe("/superusers?notice=revoked");
    expect(mocks.revoke).toHaveBeenCalledWith("staff-token", INVITATION_ID);
  });

  it("an id that is not a UUID is refused before the API call", async () => {
    expect(
      await redirectedTo(
        revokeSuperuserInvitationAction(form({ invitation_id: "../../x" }))
      )
    ).toBe("/superusers?notice=not-found");
    expect(mocks.revoke).not.toHaveBeenCalled();
  });

  it("a 404 says the invitation no longer exists", async () => {
    mocks.revoke.mockRejectedValue(apiError(404));
    expect(
      await redirectedTo(
        revokeSuperuserInvitationAction(form({ invitation_id: INVITATION_ID }))
      )
    ).toBe("/superusers?notice=not-found");
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it("a 409 says the invitation had already ended", async () => {
    mocks.revoke.mockRejectedValue(apiError(409));
    expect(
      await redirectedTo(
        revokeSuperuserInvitationAction(form({ invitation_id: INVITATION_ID }))
      )
    ).toBe("/superusers?notice=already-closed");
  });

  it("a 403 uses the guidance code and is not reported", async () => {
    mocks.revoke.mockRejectedValue(apiError(403, "mfa_enrolment_required"));
    expect(
      await redirectedTo(
        revokeSuperuserInvitationAction(form({ invitation_id: INVITATION_ID }))
      )
    ).toBe("/superusers?notice=set-up-authenticator");
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it("a 401 sends the person to sign in again", async () => {
    mocks.revoke.mockRejectedValue(apiError(401));
    expect(
      await redirectedTo(
        revokeSuperuserInvitationAction(form({ invitation_id: INVITATION_ID }))
      )
    ).toBe("/signin?sign_in=expired");
  });

  it("a server fault is reported and shown as a revoke failure", async () => {
    mocks.revoke.mockRejectedValue(apiError(500));
    expect(
      await redirectedTo(
        revokeSuperuserInvitationAction(form({ invitation_id: INVITATION_ID }))
      )
    ).toBe("/superusers?notice=revoke-failed");
    expect(mocks.report).toHaveBeenCalledOnce();
  });
});
