import { describe, expect, it, vi } from "vitest";

// vi.hoisted so the mock factory can read a value the tests mutate per-case.
const envState = vi.hoisted(() => ({ allowedHosts: "" }));

vi.mock("@/lib/env", () => ({
  env: {
    get AUTH_ALLOWED_RETURN_HOSTS() {
      return envState.allowedHosts;
    },
  },
}));

import { getSafeReturnTo } from "@/lib/return-to";

function withAllowedHosts(value: string) {
  envState.allowedHosts = value;
}

describe("getSafeReturnTo", () => {
  it("allows relative paths regardless of the allowlist", () => {
    withAllowedHosts("");
    expect(getSafeReturnTo("/dashboard")).toBe("/dashboard");
    expect(getSafeReturnTo("/")).toBe("/");
  });

  it("rejects protocol-relative URLs", () => {
    withAllowedHosts(".barrels.gd");
    expect(getSafeReturnTo("//evil.example.com/steal")).toBeNull();
  });

  it("returns null for empty or missing input", () => {
    withAllowedHosts(".barrels.gd");
    expect(getSafeReturnTo(null)).toBeNull();
    expect(getSafeReturnTo(undefined)).toBeNull();
    expect(getSafeReturnTo("   ")).toBeNull();
  });

  describe("exact host entries (local dev format)", () => {
    it("matches hosts with ports exactly", () => {
      withAllowedHosts("localhost:3001,localhost:3002");
      expect(getSafeReturnTo("http://localhost:3001/hr")).toBe(
        "http://localhost:3001/hr"
      );
      expect(getSafeReturnTo("http://localhost:3005/")).toBeNull();
    });
  });

  describe("leading-dot entries (deployed format)", () => {
    it("matches any subdomain of the entry", () => {
      withAllowedHosts(".barrels.gd");
      expect(getSafeReturnTo("https://admin.barrels.gd/hr")).toBe(
        "https://admin.barrels.gd/hr"
      );
      expect(getSafeReturnTo("https://deep.sub.barrels.gd/")).toBe(
        "https://deep.sub.barrels.gd/"
      );
    });

    it("matches the apex domain itself", () => {
      withAllowedHosts(".weather.gd");
      expect(getSafeReturnTo("https://weather.gd/forecast")).toBe(
        "https://weather.gd/forecast"
      );
    });

    it("rejects lookalike domains that merely end with the same letters", () => {
      withAllowedHosts(".barrels.gd");
      expect(getSafeReturnTo("https://evilbarrels.gd/")).toBeNull();
    });

    it("rejects the allowed domain appearing as a subdomain of another", () => {
      withAllowedHosts(".barrels.gd");
      expect(getSafeReturnTo("https://admin.barrels.gd.evil.com/")).toBeNull();
    });

    it("rejects hosts with an unexpected port", () => {
      withAllowedHosts(".barrels.gd");
      expect(getSafeReturnTo("https://admin.barrels.gd:8443/")).toBeNull();
    });
  });

  it("supports multiple entries across both domains", () => {
    withAllowedHosts(".barrels.gd,.weather.gd");
    expect(getSafeReturnTo("https://admin.barrels.gd/")).toBe(
      "https://admin.barrels.gd/"
    );
    expect(getSafeReturnTo("https://api.weather.gd/docs")).toBe(
      "https://api.weather.gd/docs"
    );
    expect(getSafeReturnTo("https://weather.gd/")).toBe("https://weather.gd/");
    expect(getSafeReturnTo("https://other.gd/")).toBeNull();
  });

  it("matches hosts case-insensitively", () => {
    withAllowedHosts(".barrels.gd");
    expect(getSafeReturnTo("https://Admin.BARRELS.gd/")).toBe(
      "https://admin.barrels.gd/"
    );
  });

  it("rejects non-http(s) schemes even for allowed hosts", () => {
    withAllowedHosts(".barrels.gd");
    expect(getSafeReturnTo("ftp://admin.barrels.gd/")).toBeNull();
    expect(getSafeReturnTo("javascript:alert(1)")).toBeNull();
  });
});
