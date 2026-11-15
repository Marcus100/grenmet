import { describe, expect, it } from "vitest";
import { signInPath, signUpHref } from "@/lib/sign-in-links";

const AUTH = "https://auth.example.test";
const OWN = "https://bookings.example.test";

function returnTo(href: string): string | null {
  return new URL(href).searchParams.get("returnTo");
}

describe("signInPath", () => {
  it("is this app's sign-in, returning to the business's booking page", () => {
    expect(signInPath("sea-salt-spa")).toBe("/signin?returnTo=%2Fsea-salt-spa");
  });
});

describe("signUpHref", () => {
  it("goes to auth's sign-up and returns the person signed in to the booking page", () => {
    const href = signUpHref(AUTH, OWN, "sea-salt-spa");
    const url = new URL(href);
    expect(`${url.origin}${url.pathname}`).toBe(`${AUTH}/signup`);
    expect(returnTo(href)).toBe(
      "https://bookings.example.test/signin?returnTo=%2Fsea-salt-spa"
    );
  });

  it("uses only the origin of the configured address", () => {
    const href = signUpHref(
      AUTH,
      "https://bookings.example.test/some/path?x=1#y",
      "sea-salt-spa"
    );
    expect(returnTo(href)).toBe(
      "https://bookings.example.test/signin?returnTo=%2Fsea-salt-spa"
    );
  });

  it("keeps a local http address and its port as configured", () => {
    const href = signUpHref(AUTH, "http://localhost:3015", "sea-salt-spa");
    expect(returnTo(href)).toBe(
      "http://localhost:3015/signin?returnTo=%2Fsea-salt-spa"
    );
  });

  it("falls back to the plain sign-up page when no own address is configured or it is unusable", () => {
    for (const own of [
      undefined,
      "",
      "not a url",
      "javascript:alert(1)",
      "ftp://bookings.example.test",
    ]) {
      expect(signUpHref(AUTH, own, "sea-salt-spa")).toBe(`${AUTH}/signup`);
    }
  });
});
