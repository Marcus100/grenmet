import { beforeEach, describe, expect, it, vi } from "vitest";

const createCheckIn = vi.hoisted(() => vi.fn());
const startRedemption = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  })
);

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/account-rewards", () => ({ createCheckIn, startRedemption }));
vi.mock("@/lib/report-error", () => ({ reportError }));
vi.mock("@/lib/session", () => ({
  exchangeSessionForAccessToken: vi
    .fn()
    .mockResolvedValue({ access_token: "access" }),
  readSessionCookie: vi.fn().mockResolvedValue("session"),
}));

import { checkIn } from "./actions";

const TOKEN = "v1.venue.123.abcdef0123456789";

function form(token: string) {
  const data = new FormData();
  data.set("token", token);
  return data;
}

async function destination(token = TOKEN): Promise<string> {
  try {
    await checkIn(form(token));
  } catch (error) {
    return (error as Error).message.replace("REDIRECT:", "");
  }
  return "";
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkIn", () => {
  it("posts the trimmed code and reports success", async () => {
    createCheckIn.mockResolvedValue({});
    expect(await destination(`  ${TOKEN} `)).toBe(
      "/rewards?notice=checked-in#check-in"
    );
    expect(createCheckIn).toHaveBeenCalledWith("access", TOKEN);
  });

  it("rejects a code of the wrong length without calling the API", async () => {
    expect(await destination("short")).toBe(
      "/rewards?notice=invalid-code#check-in"
    );
    expect(createCheckIn).not.toHaveBeenCalled();
  });

  it.each([
    [409, "already-checked-in"],
    [400, "invalid-code"],
    [503, "unavailable"],
  ])("maps HTTP %i to %s", async (status, notice) => {
    createCheckIn.mockRejectedValue({ status });
    expect(await destination()).toBe(`/rewards?notice=${notice}#check-in`);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("sends an expired session back to sign in", async () => {
    createCheckIn.mockRejectedValue({ status: 401 });
    expect(await destination()).toBe("/?session=expired");
  });

  it("reports unexpected failures and shows a generic notice", async () => {
    const error = { status: 500 };
    createCheckIn.mockRejectedValue(error);
    expect(await destination()).toBe(
      "/rewards?notice=check-in-failed#check-in"
    );
    expect(reportError).toHaveBeenCalledWith(error, "rewards-check-in");
  });
});
