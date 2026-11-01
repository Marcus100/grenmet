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
  it.each(["/api//v1/x", "/api/v1//x", "/api/v1/x/", "/api/", "/api"])(
    "refuses %s",
    (pathname) => {
      expect(target(pathname)).toBeNull();
    }
  );
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
