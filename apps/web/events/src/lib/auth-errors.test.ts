import { AuthApiError } from "@barrelsgd/auth";
import { describe, expect, it, vi } from "vitest";
import { authErrorResponse } from "./auth-errors";

describe("authErrorResponse", () => {
  it("passes expected 4xx detail through without reporting", async () => {
    const report = vi.fn();
    const response = authErrorResponse(
      new AuthApiError(400, "Wrong or expired code"),
      report
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ detail: "Wrong or expired code" });
    expect(report).not.toHaveBeenCalled();
  });

  it("hides unexpected failures behind a generic 503 and reports them", async () => {
    const report = vi.fn();
    const response = authErrorResponse(new Error("boom"), report);
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("boom");
    expect(report).toHaveBeenCalledWith(expect.any(Error), "events-auth");
  });
});
