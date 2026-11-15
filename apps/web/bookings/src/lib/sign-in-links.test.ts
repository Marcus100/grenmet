import { describe, expect, it } from "vitest";
import { signInPath, signUpHref } from "@/lib/sign-in-links";

const AUTH = "https://auth.example.test";

function headers(values: Record<string, string>) {
  const map = new Map(Object.entries(values));
  return { get: (name: string) => map.get(name) ?? null };
}

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
    const href = signUpHref(
      AUTH,
      headers({
        host: "bookings.example.test",
        "x-forwarded-proto": "https",
      }),
      "sea-salt-spa"
    );
    const url = new URL(href);
    expect(`${url.origin}${url.pathname}`).toBe(`${AUTH}/signup`);
    expect(returnTo(href)).toBe(
      "https://bookings.example.test/signin?returnTo=%2Fsea-salt-spa"
    );
  });

  it("prefers the forwarded host and protocol the proxy chain set", () => {
    const href = signUpHref(
      AUTH,
      headers({
        host: "web-bookings:3015",
        "x-forwarded-host": "bookings.example.test, other",
        "x-forwarded-proto": "https, http",
      }),
      "sea-salt-spa"
    );
    expect(returnTo(href)).toBe(
      "https://bookings.example.test/signin?returnTo=%2Fsea-salt-spa"
    );
  });

  it("uses http for a local host with no forwarded protocol", () => {
    const href = signUpHref(
      AUTH,
      headers({ host: "localhost:3015" }),
      "sea-salt-spa"
    );
    expect(returnTo(href)).toBe(
      "http://localhost:3015/signin?returnTo=%2Fsea-salt-spa"
    );
  });

  it("falls back to the plain sign-up page when the host is unusable", () => {
    for (const host of ["", "bad host", "evil.test/path?x=1", "a@b"]) {
      const href = signUpHref(AUTH, headers({ host }), "sea-salt-spa");
      expect(href).toBe(`${AUTH}/signup`);
    }
    expect(signUpHref(AUTH, headers({}), "sea-salt-spa")).toBe(
      `${AUTH}/signup`
    );
  });
});
