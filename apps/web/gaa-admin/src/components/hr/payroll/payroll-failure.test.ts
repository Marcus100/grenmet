import { describe, expect, it } from "vitest";
import { describePayrollFailure, isMfaRequired } from "./payroll-failure";

function apiError(status: number, detail: string) {
  return Object.assign(new Error(detail), { status, data: { detail } });
}

describe("describePayrollFailure", () => {
  it("recognises the two-step verification response", () => {
    const error = apiError(
      403,
      "Sign in again with your authenticator or recovery code before using privileged staff tools"
    );
    expect(isMfaRequired(error)).toBe(true);
    expect(describePayrollFailure(error).kind).toBe("mfa");
  });

  it("reads the detail from a text (CSV or PDF) error body", () => {
    const error = Object.assign(new Error("failed"), {
      status: 403,
      data: JSON.stringify({
        detail: "Sign in again with your authenticator or recovery code",
      }),
    });
    expect(describePayrollFailure(error).kind).toBe("mfa");
  });

  it("treats other 403s as forbidden", () => {
    expect(describePayrollFailure(apiError(403, "No")).kind).toBe("forbidden");
  });

  it("keeps the API reason for conflicts", () => {
    const failure = describePayrollFailure(
      apiError(409, "Approve the pay period's quantities first")
    );
    expect(failure.kind).toBe("conflict");
    expect(failure.message).toBe("Approve the pay period's quantities first");
  });

  it("marks anything else as unexpected so the caller reports it", () => {
    expect(describePayrollFailure(new Error("network")).kind).toBe(
      "unexpected"
    );
  });
});
