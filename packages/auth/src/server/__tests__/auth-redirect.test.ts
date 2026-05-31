import { describe, expect, it } from "vitest";
import {
  buildSharedSignInUrl,
  getRequestOrigin,
  getSafeLocalReturnTo,
} from "../auth-redirect";

describe("getSafeLocalReturnTo", () => {
  it("returns null for null/undefined/empty", () => {
    expect(getSafeLocalReturnTo(null)).toBeNull();
    expect(getSafeLocalReturnTo(undefined)).toBeNull();
    expect(getSafeLocalReturnTo("")).toBeNull();
    expect(getSafeLocalReturnTo("   ")).toBeNull();
  });

  it("returns null for non-path values", () => {
    expect(getSafeLocalReturnTo("https://evil.com")).toBeNull();
    expect(getSafeLocalReturnTo("evil.com/path")).toBeNull();
  });

  it("returns null for protocol-relative URLs", () => {
    expect(getSafeLocalReturnTo("//evil.com")).toBeNull();
  });

  it("returns valid local paths unchanged", () => {
    expect(getSafeLocalReturnTo("/dashboard")).toBe("/dashboard");
    expect(getSafeLocalReturnTo("/a/b/c?q=1")).toBe("/a/b/c?q=1");
  });
});

describe("getRequestOrigin", () => {
  it("prefers x-forwarded-host over host", () => {
    const h = new Headers({
      "x-forwarded-host": "app.example.com",
      "x-forwarded-proto": "https",
      host: "internal-host",
    });
    expect(getRequestOrigin(h)).toBe("https://app.example.com");
  });

  it("falls back to host header", () => {
    const h = new Headers({ host: "app.example.com" });
    expect(getRequestOrigin(h)).toBe("https://app.example.com");
  });

  it("uses http for localhost", () => {
    const h = new Headers({ host: "localhost:3000" });
    expect(getRequestOrigin(h)).toBe("http://localhost:3000");
  });

  it("returns localhost default when no host header present", () => {
    expect(getRequestOrigin(new Headers())).toBe("http://localhost:3000");
  });
});

describe("buildSharedSignInUrl", () => {
  const config = {
    appName: "wxwatch",
    authAppUrl: "https://auth.weather.gd",
    authApiBaseUrl: "https://api.weather.gd",
    authApiPrefix: "/api/v1",
    sessionCookieName: "grenmet_session",
  };

  it("sets app and returnTo params", () => {
    const url = new URL(
      buildSharedSignInUrl(config, {
        origin: "https://wxwatch.weather.gd",
        returnTo: "/forecast",
      })
    );
    expect(url.origin).toBe("https://auth.weather.gd");
    expect(url.searchParams.get("app")).toBe("wxwatch");
    expect(url.searchParams.get("returnTo")).toBe(
      "https://wxwatch.weather.gd/forecast"
    );
  });

  it("defaults returnTo to / when null", () => {
    const url = new URL(
      buildSharedSignInUrl(config, {
        origin: "https://wxwatch.weather.gd",
        returnTo: null,
      })
    );
    expect(url.searchParams.get("returnTo")).toBe(
      "https://wxwatch.weather.gd/"
    );
  });

  it("rejects unsafe returnTo and falls back to /", () => {
    const url = new URL(
      buildSharedSignInUrl(config, {
        origin: "https://wxwatch.weather.gd",
        returnTo: "//evil.com",
      })
    );
    expect(url.searchParams.get("returnTo")).toBe(
      "https://wxwatch.weather.gd/"
    );
  });
});
