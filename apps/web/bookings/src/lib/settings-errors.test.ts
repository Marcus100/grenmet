import { describe, expect, it } from "vitest";
import { apiError } from "@/test/studio";
import { settingsFailure } from "./studio-errors";

describe("settings failures", () => {
  it("maps the API's own strings", () => {
    expect(
      settingsFailure(
        apiError(409, { detail: "That booking address is already in use" })
      )
    ).toMatchObject({
      kind: "conflict",
      message: expect.stringContaining("already in use"),
    });
    expect(
      settingsFailure(
        apiError(422, { detail: "That booking address is reserved" })
      )
    ).toMatchObject({
      kind: "invalid",
      message: expect.stringContaining("reserved"),
    });
    expect(
      settingsFailure(
        apiError(422, { detail: "The deposit cannot exceed the price" })
      )
    ).toMatchObject({ message: "The deposit cannot exceed the price." });
    expect(
      settingsFailure(
        apiError(422, {
          errors: [{ msg: "Value error, Unknown IANA timezone" }],
        })
      )
    ).toMatchObject({ message: expect.stringContaining("timezone") });
    expect(
      settingsFailure(
        apiError(422, { detail: "Working periods on the same day overlap" })
      )
    ).toMatchObject({ message: expect.stringContaining("overlap") });
  });

  it("maps roles, missing rows and faults", () => {
    expect(settingsFailure(apiError(403))).toMatchObject({ kind: "forbidden" });
    expect(settingsFailure(apiError(401))).toMatchObject({
      kind: "signed_out",
    });
    expect(settingsFailure(apiError(404))).toMatchObject({ kind: "not_found" });
    expect(settingsFailure(apiError(422))).toMatchObject({ kind: "invalid" });
    expect(settingsFailure(apiError(409))).toMatchObject({ kind: "conflict" });
    expect(settingsFailure(apiError(503))).toMatchObject({
      kind: "unavailable",
    });
    expect(settingsFailure(new Error("network"))).toMatchObject({
      kind: "unavailable",
    });
  });
});
