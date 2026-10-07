import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  })
);
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth-redirect", () => ({
  getSafeLocalReturnTo: (value: string | null) =>
    value?.startsWith("/") && !value.startsWith("//") ? value : null,
  readQueryParam: (value: unknown) =>
    typeof value === "string" ? value : null,
}));

import SignIn from "./page";

async function target(returnTo?: string) {
  try {
    await SignIn({ searchParams: Promise.resolve({ returnTo }) });
  } catch (error) {
    return (error as Error).message.replace("redirect:", "");
  }
  return null;
}

describe("/signin", () => {
  it("starts single sign-on and keeps a local return path", async () => {
    expect(await target("/hr/forms?tab=leave")).toBe(
      "/auth/start?returnTo=%2Fhr%2Fforms%3Ftab%3Dleave"
    );
  });

  it("drops an off-site return path", async () => {
    expect(await target("https://evil.test/")).toBe("/auth/start?returnTo=%2F");
  });
});
