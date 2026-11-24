import { describe, expect, it } from "vitest";
import { apiError } from "@/test/studio";
import { logoUploadFailure, settingsFailure } from "./studio-errors";

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
          detail: "Validation error",
          errors: [
            {
              loc: ["body", "timezone"],
              msg: "Value error, Unknown IANA timezone",
              type: "value_error",
            },
          ],
        })
      )
    ).toMatchObject({ message: expect.stringContaining("timezone") });
    expect(
      settingsFailure(
        apiError(422, {
          detail: "Validation error",
          errors: [
            {
              loc: ["body", "slug"],
              msg: "Value error, That booking address is reserved",
              type: "value_error",
            },
          ],
        })
      )
    ).toMatchObject({
      kind: "invalid",
      message: expect.stringContaining("reserved"),
    });
    expect(
      settingsFailure(
        apiError(422, { detail: "Working periods on the same day overlap" })
      )
    ).toMatchObject({ message: expect.stringContaining("overlap") });
  });

  it("ignores text outside detail and errors", () => {
    expect(
      settingsFailure(
        apiError(422, { other: "That booking address is reserved" })
      )
    ).toMatchObject({ message: "The settings were not accepted." });
  });

  it("maps roles, missing rows and faults", () => {
    expect(settingsFailure(apiError(403))).toMatchObject({
      kind: "forbidden",
      message: "This business can't change booking settings right now.",
    });
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

describe("add-on failures", () => {
  it("explains the 409 for a service with upcoming bookings", () => {
    expect(
      settingsFailure(
        apiError(409, {
          detail:
            "This service has upcoming bookings, so it cannot become an add-on yet",
        })
      )
    ).toEqual({
      kind: "conflict",
      message:
        "This service has upcoming bookings, so it cannot become an add-on yet.",
      nextStep:
        "Move or cancel those bookings, or keep it as a main service, then save again.",
    });
  });
});

describe("logo upload failures", () => {
  it("shows the API's own plain sentence for a refused image", () => {
    expect(
      logoUploadFailure(
        apiError(422, { detail: "The image has too many pixels" })
      ).message
    ).toBe("The image has too many pixels.");
  });

  it("asks for a new start when the upload link has expired", () => {
    expect(
      logoUploadFailure(
        apiError(409, {
          detail: "The upload link expired; start the upload again",
        })
      )
    ).toMatchObject({
      kind: "conflict",
      message: "The upload link expired; start the upload again.",
    });
  });

  it("says uploads are off when storage is not configured", () => {
    expect(logoUploadFailure(apiError(503, {}))).toMatchObject({
      kind: "unavailable",
      message: "Logo uploads are not available right now.",
    });
  });

  it("refuses a member in plain words", () => {
    expect(logoUploadFailure(apiError(403, {})).message).toBe(
      "This business can't change booking settings right now."
    );
  });

  it("keeps a generic retry for anything else", () => {
    expect(logoUploadFailure(new Error("boom"))).toMatchObject({
      kind: "unavailable",
      message: "The logo could not be uploaded.",
    });
  });

  it("names a settings save that used a logo that never finished", () => {
    expect(
      settingsFailure(
        apiError(409, {
          detail: "That logo is not a finished upload for this business",
        })
      ).message
    ).toBe("That logo did not finish uploading for this business.");
  });
});
