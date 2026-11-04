import { describe, expect, it } from "vitest";
import { buildApiProxyUrl } from "./api-proxy-target";

const BASE = "http://fastapi.test";

function target(pathname: string, search = ""): string | null {
  return buildApiProxyUrl(pathname, search, BASE)?.href ?? null;
}

describe("buildApiProxyUrl: normal module calls", () => {
  it.each([
    [
      "/api/v1/hr/leave/requests",
      "http://fastapi.test/api/v1/hr/leave/requests",
    ],
    [
      "/api/v1/wxproducts/public/products",
      "http://fastapi.test/api/v1/wxproducts/public/products",
    ],
    ["/api/cap/alerts.xml", "http://fastapi.test/api/cap/alerts.xml"],
    [
      "/api/v1/cap/alerts/0b6f7c2e-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
      "http://fastapi.test/api/v1/cap/alerts/0b6f7c2e-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
    ],
    [
      "/api/v1/stores/items_v2~draft-1",
      "http://fastapi.test/api/v1/stores/items_v2~draft-1",
    ],
  ])("maps %s to the fixed base", (pathname, expected) => {
    expect(target(pathname)).toBe(expected);
  });

  it("forwards the query string unchanged", () => {
    expect(target("/api/v1/hr/roster", "?from=2026-11-01&kind=gaa")).toBe(
      "http://fastapi.test/api/v1/hr/roster?from=2026-11-01&kind=gaa"
    );
  });

  it("decodes a percent-encoded plain character to the same segment", () => {
    expect(target("/api/v1/%41bc")).toBe("http://fastapi.test/api/v1/Abc");
  });

  it("keeps the base origin and ignores any base path", () => {
    const url = buildApiProxyUrl(
      "/api/v1/x",
      "",
      "https://api.barrels.gd/some/prefix/"
    );
    expect(url?.href).toBe("https://api.barrels.gd/api/v1/x");
  });
});

describe("buildApiProxyUrl: traversal", () => {
  it.each([
    "/api/../secret",
    "/api/v1/../../admin",
    "/api/v1/./x/../../admin",
    "/api/v1/..",
    "/api/v1/.",
  ])("refuses %s", (pathname) => {
    expect(target(pathname)).toBeNull();
  });
});

describe("buildApiProxyUrl: encoded dots and slashes", () => {
  it.each([
    "/api/%2e%2e/admin",
    "/api/%2E%2E/admin",
    "/api/v1/%2e%2e",
    "/api/v1/%2e",
    "/api/v1/%2e%2e%2fadmin",
    "/api/v1/..%2fadmin",
    "/api/v1%2Fadmin",
    "/api/v1%5Cadmin",
    "/api/%252e%252e/admin",
    "/api/v1/%2e%2e%5cadmin",
  ])("refuses %s", (pathname) => {
    expect(target(pathname)).toBeNull();
  });

  it("refuses bytes that are not valid UTF-8 percent-encoding", () => {
    expect(target("/api/v1/%E0%A4%A")).toBeNull();
  });
});

describe("buildApiProxyUrl: empty segments", () => {
  it.each([
    "/api//v1/x",
    "/api/v1//x",
    "/api/v1/x//",
    "/api//",
    "/api/",
    "/api",
    "/api/v1//",
    "/api/a//b",
  ])("refuses %s", (pathname) => {
    expect(target(pathname)).toBeNull();
  });
});

describe("buildApiProxyUrl: one trailing slash", () => {
  it.each([
    [
      "/api/v1/utils/health-check/",
      "http://fastapi.test/api/v1/utils/health-check/",
    ],
    [
      "/api/v1/utils/test-email/",
      "http://fastapi.test/api/v1/utils/test-email/",
    ],
    ["/api/v1/utils/ready/", "http://fastapi.test/api/v1/utils/ready/"],
  ])("keeps the single final slash on %s", (pathname, expected) => {
    expect(target(pathname)).toBe(expected);
  });

  it("keeps the query string with a trailing slash", () => {
    expect(target("/api/v1/utils/ready/", "?verbose=1")).toBe(
      "http://fastapi.test/api/v1/utils/ready/?verbose=1"
    );
  });

  it("refuses a double slash even at the end", () => {
    expect(target("/api/v1/utils/ready//")).toBeNull();
  });
});

describe("buildApiProxyUrl: host switch attempts", () => {
  it.each([
    "//evil.example/api/v1/x",
    "/api//evil.example/x",
    "/api/http:/evil.example",
    "/api/http:%2F%2Fevil.example",
    "/api/%2F%2Fevil.example/x",
    "/api/@evil.example",
    "/api/%40evil.example",
    "/api/evil.example:443",
    "/api/v1\\evil.example",
    "/api/v1/%5C%5Cevil.example",
    "/api/v1/x%3Fhost=evil.example",
    "/api/v1/x%23frag",
  ])("refuses %s and never leaves the base origin", (pathname) => {
    expect(target(pathname)).toBeNull();
  });

  it("does not accept a path that does not start under /api/", () => {
    expect(target("/_next/static/x")).toBeNull();
    expect(target("/apix/v1/x")).toBeNull();
    expect(target("/v1/x")).toBeNull();
  });

  it("never returns a URL whose origin differs from the base", () => {
    const url = buildApiProxyUrl("/api/v1/x", "?y=//evil.example", BASE);
    expect(url?.origin).toBe("http://fastapi.test");
  });
});

describe("buildApiProxyUrl: baseline policy key (colon allowed)", () => {
  it.each([
    [
      "/api/v1/hr/setup/policies/hr:ops:leave",
      "http://fastapi.test/api/v1/hr/setup/policies/hr:ops:leave",
    ],
    [
      "/api/v1/hr/setup/policies/hr:gms:LEAVE",
      "http://fastapi.test/api/v1/hr/setup/policies/hr:gms:LEAVE",
    ],
    [
      // The generated client percent-encodes the key, so the colon arrives as %3A.
      "/api/v1/hr/setup/policies/hr%3Agms%3ALEAVE",
      "http://fastapi.test/api/v1/hr/setup/policies/hr:gms:LEAVE",
    ],
    [
      "/api/v1/hr/setup/policies/hr:gms:LEAVE/",
      "http://fastapi.test/api/v1/hr/setup/policies/hr:gms:LEAVE/",
    ],
  ])("allows the policy key in %s", (pathname, expected) => {
    expect(target(pathname)).toBe(expected);
  });

  it("keeps the base origin for a key that looks like a scheme", () => {
    const url = buildApiProxyUrl("/api/v1/hr/setup/policies/http:", "", BASE);
    expect(url?.href).toBe(
      "http://fastapi.test/api/v1/hr/setup/policies/http:"
    );
    expect(url?.origin).toBe("http://fastapi.test");
  });

  it.each([
    // Encoded slashes, dots and separators in the key stay refused.
    "/api/v1/hr/setup/policies/http%3A%2F%2Fevil.example",
    "/api/v1/hr/setup/policies/hr:%2F%2Fevil.example",
    "/api/v1/hr/setup/policies/hr:gms%2FLEAVE",
    "/api/v1/hr/setup/policies/%2e%2e",
    "/api/v1/hr/setup/policies/..",
    "/api/v1/hr/setup/policies/hr:gms:LEAVE%3F",
    "/api/v1/hr/setup/policies/hr:gms:LEAVE%23x",
    "/api/v1/hr/setup/policies/hr:gms:LEAVE%40evil.example",
    "/api/v1/hr/setup/policies/hr:gms:LEAVE%5Cx",
    // A double-encoded colon decodes to %3A, which still contains %.
    "/api/v1/hr/setup/policies/hr%253Agms",
    // Empty segments around the key.
    "/api/v1/hr/setup/policies//hr:gms:LEAVE",
    "/api/v1/hr/setup/policies/hr:gms:LEAVE//",
    "/api/v1/hr/setup/policies/hr:gms:LEAVE//x",
  ])("still refuses %s", (pathname) => {
    expect(target(pathname)).toBeNull();
  });

  it.each([
    // A colon must not be allowed past the policy key or into another route.
    "/api/v1/hr/setup/policies/hr:gms:LEAVE/extra",
    "/api/v1/hr/setup/policies/hr:gms:LEAVE/hr:gms:LEAVE",
    "/api/v1/hr/setup/policy/hr:gms:LEAVE",
    "/api/v1/hr/setup/hr:gms:LEAVE",
    "/api/v1/hr/leave/requests/hr:gms:LEAVE",
    "/api/v1/hr/leave/requests/hr%3Agms%3ALEAVE",
    "/api/v1/hr:x/setup/policies/hr:gms:LEAVE",
    "/api/v1/hr%3Ax/setup/policies/hr:gms:LEAVE",
    "/api/v1/HR/setup/policies/hr:gms:LEAVE",
    "/api/v2/hr/setup/policies/hr:gms:LEAVE",
    "/api/v1%3A/hr/setup/policies/hr:gms:LEAVE",
    "/api/http:/v1/hr/setup/policies/hr:gms:LEAVE",
    "/api/evil.example:443/v1/hr/setup/policies/hr:gms:LEAVE",
    "/api:x/v1/hr/setup/policies/hr:gms:LEAVE",
    "/api%3Ax/v1/hr/setup/policies/hr:gms:LEAVE",
    "/api/v1/x%3Ay",
    "/api/%3A%2F%2Fevil.example",
  ])("refuses a colon outside the policy key in %s", (pathname) => {
    expect(target(pathname)).toBeNull();
  });
});
