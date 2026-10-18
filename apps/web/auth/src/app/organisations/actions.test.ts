import { afterEach, describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  })
);
const readSessionCookie = vi.hoisted(() => vi.fn());
const exchangeSessionForAccessToken = vi.hoisted(() => vi.fn());
const acceptOrganisationInvitation = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({
  exchangeSessionForAccessToken,
  readSessionCookie,
}));
vi.mock("@/lib/account-organisations", () => ({
  acceptOrganisationInvitation,
  describeAcceptFailure: (error: unknown) => {
    const status = (error as { status?: number }).status;
    if (status === 400) return "invalid";
    if (status === 403) return "wrong-email";
    return "failed";
  },
}));

import { acceptInvitation } from "./actions";

const TOKEN = "abc_DEF-1234567890";

function form(token: string) {
  const data = new FormData();
  data.set("token", token);
  return data;
}

async function destination(run: Promise<unknown>) {
  try {
    await run;
  } catch (error) {
    return (error as Error).message.replace("redirect:", "");
  }
  return null;
}

afterEach(() => vi.clearAllMocks());

describe("acceptInvitation", () => {
  it("posts the token to the API and lands on the organisations page", async () => {
    readSessionCookie.mockResolvedValue("account-session");
    exchangeSessionForAccessToken.mockResolvedValue({ access_token: "access" });
    acceptOrganisationInvitation.mockResolvedValue({});
    expect(await destination(acceptInvitation(form(TOKEN)))).toBe(
      "/organisations?notice=joined"
    );
    expect(acceptOrganisationInvitation).toHaveBeenCalledWith("access", TOKEN);
  });

  it("sends a signed-out visitor to sign in", async () => {
    readSessionCookie.mockResolvedValue(null);
    expect(await destination(acceptInvitation(form(TOKEN)))).toBe("/");
    expect(acceptOrganisationInvitation).not.toHaveBeenCalled();
  });

  it("refuses a malformed token without calling the API", async () => {
    readSessionCookie.mockResolvedValue("account-session");
    expect(await destination(acceptInvitation(form("../etc/passwd")))).toBe(
      "/organisations/accept?notice=invalid"
    );
    expect(acceptOrganisationInvitation).not.toHaveBeenCalled();
  });

  it.each([
    [400, "invalid"],
    [403, "wrong-email"],
    [500, "failed"],
  ])("maps a %s response to the %s notice", async (status, notice) => {
    readSessionCookie.mockResolvedValue("account-session");
    exchangeSessionForAccessToken.mockResolvedValue({ access_token: "access" });
    acceptOrganisationInvitation.mockRejectedValue({ status });
    expect(await destination(acceptInvitation(form(TOKEN)))).toBe(
      `/organisations/accept?notice=${notice}`
    );
  });

  it("returns to sign-in when the session has expired", async () => {
    readSessionCookie.mockResolvedValue("account-session");
    exchangeSessionForAccessToken.mockResolvedValue({ access_token: "access" });
    acceptOrganisationInvitation.mockRejectedValue({ status: 401 });
    expect(await destination(acceptInvitation(form(TOKEN)))).toBe(
      "/?session=expired"
    );
  });
});
