import { describe, expect, it } from "vitest";
import { hrApiErrorMessage } from "./api-error";

describe("HR API error messages", () => {
  it("shows service validation details from both generated and PDF requests", () => {
    expect(
      hrApiErrorMessage({ data: { detail: "No opening balance recorded" } })
    ).toBe("No opening balance recorded");
    expect(
      hrApiErrorMessage({
        detail: "The employee does not belong to this department",
      })
    ).toBe("The employee does not belong to this department");
  });

  it("explains Pydantic field errors without repeating submitted personal values", () => {
    const result = hrApiErrorMessage({
      data: {
        detail: [
          {
            loc: ["body", "absence_start_time"],
            msg: "Use HH:MM",
            input: "private input",
          },
          {
            loc: ["body", "notes"],
            msg: "Must be shorter than 1000 characters",
            input: "private medical note",
          },
        ],
      },
    });
    expect(result).toBe(
      "absence start time: Use HH:MM; notes: Must be shorter than 1000 characters"
    );
    expect(result).not.toContain("private");
  });

  it("handles malformed validation data and network failures", () => {
    expect(hrApiErrorMessage({ detail: [null, {}, { msg: 12 }] })).toBe(
      "Something went wrong"
    );
    expect(hrApiErrorMessage(new Error("Network unavailable"))).toBe(
      "Network unavailable"
    );
  });

  it("shows field errors from the API's documented validation envelope", () => {
    expect(
      hrApiErrorMessage({
        data: {
          detail: "Validation error",
          errors: [{ loc: ["body", "start_date"], msg: "Use a valid date" }],
        },
      })
    ).toBe("start date: Use a valid date");
  });
});
