import { afterEach, describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  })
);
const readSessionCookie = vi.hoisted(() => vi.fn());
const joinAccountApp = vi.hoisted(() => vi.fn());
const leaveAccountApp = vi.hoisted(() => vi.fn());
class FakeAuthApiError extends Error {
  status: number;
  constructor(status: number) {
    super("api");
    this.status = status;
  }
}
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({
  isAuthApiError: (error: unknown) => error instanceof FakeAuthApiError,
  readSessionCookie,
}));
vi.mock("@/lib/account-apps", () => ({ joinAccountApp, leaveAccountApp }));

import { joinAppFromAccount, leaveAppFromAccount } from "./actions";

function form(app: string) {
  const data = new FormData();
  data.set("app", app);
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

describe("apps actions", () => {
  it("joins and reports it", async () => {
    readSessionCookie.mockResolvedValue("account-session");
    joinAccountApp.mockResolvedValue({ joined: true });
    expect(await destination(joinAppFromAccount(form("events")))).toBe(
      "/apps?notice=joined"
    );
    expect(joinAccountApp).toHaveBeenCalledWith("events", "account-session");
  });

  it("leaves and reports it", async () => {
    readSessionCookie.mockResolvedValue("account-session");
    leaveAccountApp.mockResolvedValue({ left: true, still_has_access: false });
    expect(await destination(leaveAppFromAccount(form("events")))).toBe(
      "/apps?notice=left"
    );
  });

  it("says so when a role from elsewhere still gives access", async () => {
    readSessionCookie.mockResolvedValue("account-session");
    leaveAccountApp.mockResolvedValue({ left: true, still_has_access: true });
    expect(await destination(leaveAppFromAccount(form("events")))).toBe(
      "/apps?notice=left-still"
    );
  });

  it("sends a signed-out visitor home without calling the API", async () => {
    readSessionCookie.mockResolvedValue(null);
    expect(await destination(leaveAppFromAccount(form("events")))).toBe("/");
    expect(leaveAccountApp).not.toHaveBeenCalled();
  });

  it("rejects an app key that is not a plain key", async () => {
    readSessionCookie.mockResolvedValue("account-session");
    expect(await destination(leaveAppFromAccount(form("../x")))).toBe("/");
    expect(leaveAccountApp).not.toHaveBeenCalled();
  });

  it("asks to sign in again when the account session has expired", async () => {
    readSessionCookie.mockResolvedValue("account-session");
    leaveAccountApp.mockRejectedValue(new FakeAuthApiError(401));
    expect(await destination(leaveAppFromAccount(form("events")))).toBe(
      "/?session=expired"
    );
  });

  it("shows a fixed failure notice for other API errors", async () => {
    readSessionCookie.mockResolvedValue("account-session");
    joinAccountApp.mockRejectedValue(new FakeAuthApiError(403));
    expect(await destination(joinAppFromAccount(form("events")))).toBe(
      "/apps?notice=failed"
    );
  });
});
