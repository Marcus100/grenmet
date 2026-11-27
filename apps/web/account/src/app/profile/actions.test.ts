import { AuthApiError } from "@barrelsgd/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authApiFetch, redirect, reportError, revalidatePath } = vi.hoisted(
  () => ({
    authApiFetch: vi.fn(),
    redirect: vi.fn((url: string) => {
      throw new Error(`REDIRECT ${url}`);
    }),
    reportError: vi.fn(),
    revalidatePath: vi.fn(),
  })
);

vi.mock("@barrelsgd/auth/server", () => ({ authApiFetch }));
vi.mock("@/lib/auth-config", () => ({ getAuthConfig: () => ({}) }));
vi.mock("@/lib/report-error", () => ({ reportError }));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({
    accessToken: "tok-1",
    email: "kezia@example.com",
    name: null,
    userId: "11111111-1111-4111-8111-111111111111",
  })),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));

import type { NameFormState, PhoneFormState } from "@/lib/profile-form";
import { saveNameAction, savePhoneAction } from "./actions";

const NAME_START: NameFormState = {
  fieldErrors: {},
  formError: null,
  values: { first_name: "", last_name: "" },
};
const PHONE_START: PhoneFormState = {
  fieldErrors: {},
  formError: null,
  values: { phone: "" },
};
const PHONE_SENTENCE =
  "Enter the phone number with its country code, for example +1 473 440 1234";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  authApiFetch.mockReset();
  reportError.mockClear();
  revalidatePath.mockClear();
  redirect.mockClear();
});

describe("saveNameAction", () => {
  it("saves both names with a PATCH and returns to the profile", async () => {
    authApiFetch.mockResolvedValue({});

    await expect(
      saveNameAction(
        NAME_START,
        form({ first_name: " Kezia ", last_name: "Mitchell" })
      )
    ).rejects.toThrow("REDIRECT /?saved=name");

    expect(authApiFetch).toHaveBeenCalledWith(
      expect.anything(),
      "/auth/users/me/profile",
      expect.anything(),
      {
        accessToken: "tok-1",
        body: { first_name: "Kezia", last_name: "Mitchell" },
        method: "PATCH",
      }
    );
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(reportError).not.toHaveBeenCalled();
  });

  it("names the empty first name and does not call the API", async () => {
    const state = await saveNameAction(
      NAME_START,
      form({ first_name: "  ", last_name: "Mitchell" })
    );

    expect(state.fieldErrors).toEqual({ first_name: "Enter your first name." });
    expect(state.values).toEqual({ first_name: "", last_name: "Mitchell" });
    expect(authApiFetch).not.toHaveBeenCalled();
  });

  it("saves a one-word name with a blank last name", async () => {
    authApiFetch.mockResolvedValue({});

    await expect(
      saveNameAction(NAME_START, form({ first_name: "Kezia", last_name: " " }))
    ).rejects.toThrow("REDIRECT /?saved=name");

    expect(authApiFetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ body: { first_name: "Kezia", last_name: "" } })
    );
  });

  it("says to wait on a rate limit, without reporting", async () => {
    authApiFetch.mockRejectedValue(new AuthApiError(429, "Too many requests"));

    const state = await saveNameAction(
      NAME_START,
      form({ first_name: "Kezia", last_name: "Mitchell" })
    );

    expect(state.formError).toBe(
      "Too many changes. Wait a minute, then try again."
    );
    expect(state.fieldErrors).toEqual({});
    expect(reportError).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("puts the API's reason beside the field it is about", async () => {
    authApiFetch.mockRejectedValue(
      new AuthApiError(422, "Validation error", [
        {
          loc: ["body", "first_name"],
          msg: "Value error, Enter a name",
          type: "value_error",
        },
      ])
    );

    const state = await saveNameAction(
      NAME_START,
      form({ first_name: "​.", last_name: "Mitchell" })
    );

    expect(state.fieldErrors).toEqual({ first_name: "Enter a name" });
    expect(state.formError).toBeNull();
    expect(reportError).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("reports an API failure and says so plainly, keeping what was typed", async () => {
    const failure = new AuthApiError(500, "Internal Server Error");
    authApiFetch.mockRejectedValue(failure);

    const state = await saveNameAction(
      NAME_START,
      form({ first_name: "Kezia", last_name: "Mitchell" })
    );

    expect(state.formError).toBe("Your name could not be saved. Try again.");
    expect(state.fieldErrors).toEqual({});
    expect(state.values).toEqual({
      first_name: "Kezia",
      last_name: "Mitchell",
    });
    expect(reportError).toHaveBeenCalledWith(failure, "account-profile-name");
    // Only the error and the area: nothing the person typed.
    expect(JSON.stringify(reportError.mock.calls)).not.toContain("Kezia");
  });

  it("asks for a fresh sign-in on 401 without reporting", async () => {
    authApiFetch.mockRejectedValue(new AuthApiError(401, "Sign in again"));

    const state = await saveNameAction(
      NAME_START,
      form({ first_name: "Kezia", last_name: "Mitchell" })
    );

    expect(state.formError).toBe(
      "Your sign-in has ended. Sign in again, then save."
    );
    expect(reportError).not.toHaveBeenCalled();
  });
});

describe("savePhoneAction", () => {
  it("sends what was typed and lets the API store it", async () => {
    authApiFetch.mockResolvedValue({});

    await expect(
      savePhoneAction(PHONE_START, form({ phone: " +1 (473) 440-1234 " }))
    ).rejects.toThrow("REDIRECT /?saved=phone");

    expect(authApiFetch).toHaveBeenCalledWith(
      expect.anything(),
      "/auth/users/me/profile",
      expect.anything(),
      {
        accessToken: "tok-1",
        body: { phone: "+1 (473) 440-1234" },
        method: "PATCH",
      }
    );
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("removes the number when the field is blank", async () => {
    authApiFetch.mockResolvedValue({});

    await expect(
      savePhoneAction(PHONE_START, form({ phone: "  " }))
    ).rejects.toThrow("REDIRECT /?saved=phone-removed");

    expect(authApiFetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ body: { phone: null } })
    );
  });

  it("refuses text with no digits before calling the API", async () => {
    const state = await savePhoneAction(
      PHONE_START,
      form({ phone: "call me" })
    );

    expect(state.fieldErrors).toEqual({ phone: PHONE_SENTENCE });
    expect(state.values).toEqual({ phone: "call me" });
    expect(authApiFetch).not.toHaveBeenCalled();
  });

  it("shows the API's reason beside the field for a number it cannot read", async () => {
    authApiFetch.mockRejectedValue(
      new AuthApiError(422, "Validation error", [
        {
          loc: ["body", "phone"],
          msg: `Value error, ${PHONE_SENTENCE}`,
          type: "value_error",
        },
      ])
    );

    const state = await savePhoneAction(
      PHONE_START,
      form({ phone: "440 1234" })
    );

    expect(state.fieldErrors).toEqual({ phone: PHONE_SENTENCE });
    expect(state.values).toEqual({ phone: "440 1234" });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("says to wait on a rate limit, without reporting", async () => {
    authApiFetch.mockRejectedValue(new AuthApiError(429, "Too many requests"));

    const state = await savePhoneAction(
      PHONE_START,
      form({ phone: "+14734401234" })
    );

    expect(state.formError).toBe(
      "Too many changes. Wait a minute, then try again."
    );
    expect(reportError).not.toHaveBeenCalled();
  });

  it("reports an API failure with no phone number in the report", async () => {
    const failure = new AuthApiError(503, "Service unavailable");
    authApiFetch.mockRejectedValue(failure);

    const state = await savePhoneAction(
      PHONE_START,
      form({ phone: "+14734401234" })
    );

    expect(state.formError).toBe(
      "Your phone number could not be saved. Try again."
    );
    expect(state.values).toEqual({ phone: "+14734401234" });
    expect(reportError).toHaveBeenCalledWith(failure, "account-profile-phone");
    expect(JSON.stringify(reportError.mock.calls)).not.toContain("4734401234");
  });
});
