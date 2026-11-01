import { describe, expect, it } from "vitest";
import { isAllowedDeskCall } from "./proxy-rules";

const ID = "11111111-2222-4333-8444-555555555555";

describe("isAllowedDeskCall", () => {
  it.each([
    ["POST", "/api/v1/cap/alerts"],
    ["GET", `/api/v1/cap/alerts/${ID}`],
    ["PATCH", `/api/v1/cap/alerts/${ID}`],
    ["POST", `/api/v1/cap/alerts/${ID}/publish`],
    ["POST", `/api/v1/cap/alerts/${ID}/emergency-publish`],
    ["POST", `/api/v1/cap/alerts/${ID}/cancel`],
    ["POST", `/api/v1/cap/alerts/${ID}/updates`],
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
