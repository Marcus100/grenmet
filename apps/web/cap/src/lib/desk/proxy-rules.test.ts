import { describe, expect, it } from "vitest";
import {
  deskUpstreamUrl,
  isAllowedDeskCall,
  resolveDeskCall,
} from "./proxy-rules";

const ID = "11111111-2222-4333-8444-555555555555";
const API = "https://auth.example.test";

describe("isAllowedDeskCall", () => {
  it.each([
    ["POST", "/api/v1/cap/alerts"],
    ["GET", `/api/v1/cap/alerts/${ID}`],
    ["PATCH", `/api/v1/cap/alerts/${ID}`],
    ["POST", `/api/v1/cap/alerts/${ID}/validate`],
    ["POST", `/api/v1/cap/alerts/${ID}/submit`],
    ["POST", `/api/v1/cap/alerts/${ID}/reviews`],
    ["POST", `/api/v1/cap/alerts/${ID}/approve`],
    ["POST", `/api/v1/cap/alerts/${ID}/publish`],
    ["POST", `/api/v1/cap/alerts/${ID}/emergency-publish`],
    ["POST", `/api/v1/cap/alerts/${ID}/cancel`],
    ["POST", `/api/v1/cap/alerts/${ID}/expire`],
    ["POST", `/api/v1/cap/alerts/${ID}/updates`],
    ["GET", "/api/v1/cap/areas/predefined"],
    ["GET", "/api/v1/wxproducts/public/products"],
  ])("allows %s %s", (method, path) => {
    expect(isAllowedDeskCall(method, path)).toBe(true);
  });

  it.each([
    ["GET", "/api/v1/auth/users/me"],
    ["PATCH", "/api/v1/cap/settings"],
    ["DELETE", `/api/v1/cap/alerts/${ID}`],
    ["POST", `/api/v1/cap/alerts/${ID}/duplicate`],
    ["POST", "/api/v1/cap/feeds"],
    ["GET", `/api/v1/cap/alerts/${ID}/../../../auth/users`],
    ["GET", "/api/v1/hr/leave-requests"],
    ["POST", `/api/v1/CAP/alerts/${ID}/publish`],
  ])("refuses %s %s", (method, path) => {
    expect(isAllowedDeskCall(method, path)).toBe(false);
  });
});

describe("resolveDeskCall", () => {
  it("returns the constant template and the id, not the browser path", () => {
    expect(resolveDeskCall("POST", `/api/v1/cap/alerts/${ID}/publish`)).toEqual(
      {
        template: "/api/v1/cap/alerts/{id}/publish",
        ids: [ID],
      }
    );
    expect(resolveDeskCall("GET", "/api/v1/cap/areas/predefined")).toEqual({
      template: "/api/v1/cap/areas/predefined",
      ids: [],
    });
  });

  it.each([
    ["encoded dot segment", `/api/v1/cap/alerts/%2e%2e/${ID}`],
    ["encoded dots in an id slot", "/api/v1/cap/alerts/%2e%2e"],
    ["encoded slash", `/api/v1/cap/alerts/${ID}%2fpublish`],
    ["double slash in the middle", `/api/v1//cap/alerts/${ID}`],
    [
      "leading double slash (host switch)",
      `//evil.example/api/v1/cap/alerts/${ID}`,
    ],
    ["dot segments", `/api/v1/cap/alerts/${ID}/./publish`],
    ["uppercase id", "/api/v1/cap/alerts/AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE"],
    ["uppercase action", `/api/v1/cap/alerts/${ID}/Publish`],
    ["non-UUID id", "/api/v1/cap/alerts/not-a-uuid"],
    ["numeric id", "/api/v1/cap/alerts/42"],
    ["UUID with a suffix", `/api/v1/cap/alerts/${ID}x`],
    ["UUID with a trailing slash", `/api/v1/cap/alerts/${ID}/`],
    ["UUID with a path traversal suffix", `/api/v1/cap/alerts/${ID}/..`],
    ["query string smuggled into the path", `/api/v1/cap/alerts/${ID}?x=1`],
    ["unknown action", `/api/v1/cap/alerts/${ID}/delete`],
  ])("refuses %s", (_label, path) => {
    expect(resolveDeskCall("GET", path)).toBeNull();
    expect(resolveDeskCall("POST", path)).toBeNull();
  });
});

describe("deskUpstreamUrl", () => {
  it("builds the upstream URL from the template and the validated id", () => {
    const call = resolveDeskCall("PATCH", `/api/v1/cap/alerts/${ID}`);
    expect(call).not.toBeNull();
    if (!call) return;
    const url = deskUpstreamUrl(call, API);
    expect(url.toString()).toBe(`${API}/api/v1/cap/alerts/${ID}`);
    expect(url.origin).toBe(new URL(API).origin);
  });

  it("never forwards a query string, even one the browser sent", () => {
    // The route passes only the pathname to the resolver; the query string is
    // not part of the input, so the upstream URL carries none.
    const call = resolveDeskCall("GET", "/api/v1/cap/areas/predefined");
    expect(call).not.toBeNull();
    if (!call) return;
    const url = deskUpstreamUrl(call, API);
    expect(url.search).toBe("");
    expect(url.toString()).toBe(`${API}/api/v1/cap/areas/predefined`);
  });

  it("keeps every allow-listed call on the configured API origin", () => {
    const paths: [string, string][] = [
      ["POST", "/api/v1/cap/alerts"],
      ["GET", `/api/v1/cap/alerts/${ID}`],
      ["POST", `/api/v1/cap/alerts/${ID}/emergency-publish`],
      ["GET", "/api/v1/wxproducts/public/products"],
    ];
    for (const [method, path] of paths) {
      const call = resolveDeskCall(method, path);
      expect(call, `${method} ${path}`).not.toBeNull();
      if (!call) continue;
      expect(deskUpstreamUrl(call, API).origin).toBe(new URL(API).origin);
    }
  });

  it("refuses a call whose ids do not match its template", () => {
    expect(() =>
      deskUpstreamUrl({ template: "/api/v1/cap/alerts/{id}", ids: [] }, API)
    ).toThrow();
    expect(() =>
      deskUpstreamUrl(
        { template: "/api/v1/cap/areas/predefined", ids: [ID] },
        API
      )
    ).toThrow();
  });
});
