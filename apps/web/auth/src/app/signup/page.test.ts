import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("@/lib/return-to", () => ({
  getRequestedAppName: (app: string | null) => app,
  getSafeReturnTo: (value: string | null) =>
    value?.startsWith("/") ? value : null,
  readQueryParam: (value: string | string[] | undefined) =>
    typeof value === "string" ? value : null,
}));

import SignUpPage from "./page";

async function destination(params: Record<string, string>) {
  try {
    await SignUpPage({ searchParams: Promise.resolve(params) });
  } catch (error) {
    return (error as Error).message.replace("redirect:", "");
  }
  return null;
}

describe("/signup", () => {
  it("is the one sign-in screen now", async () => {
    expect(await destination({})).toBe("/");
  });

  it("keeps where the person was going and the app they came from", async () => {
    expect(
      await destination({ app: "bookings", returnTo: "/continue?app=bookings" })
    ).toBe("/?app=bookings&returnTo=%2Fcontinue%3Fapp%3Dbookings");
  });

  it("drops a return address on another site", async () => {
    expect(await destination({ returnTo: "https://evil.example/" })).toBe("/");
  });
});
