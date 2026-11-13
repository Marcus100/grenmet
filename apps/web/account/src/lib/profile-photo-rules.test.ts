import { describe, expect, it } from "vitest";
import { profilePhotoErrorMessage } from "./profile-photo-error";
import {
  PROFILE_PHOTO_ACCEPT,
  PROFILE_PHOTO_MAX_BYTES,
  profilePhotoProblem,
} from "./profile-photo-rules";

describe("profilePhotoProblem", () => {
  it("accepts JPEG, PNG and WebP up to 5 MB", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(profilePhotoProblem({ type, size: 1024 })).toBeNull();
    }
    expect(
      profilePhotoProblem({ type: "image/jpeg", size: PROFILE_PHOTO_MAX_BYTES })
    ).toBeNull();
  });

  it("refuses other formats, including HEIC from phones, before any upload", () => {
    for (const type of ["image/heic", "image/gif", "application/pdf", ""]) {
      expect(profilePhotoProblem({ type, size: 1024 }), type).toBe(
        "Choose a JPEG, PNG or WebP photo."
      );
    }
  });

  it("refuses an empty file", () => {
    expect(profilePhotoProblem({ type: "image/png", size: 0 })).toBe(
      "That file is empty. Choose another photo."
    );
  });

  it("refuses a file one byte over 5 MB", () => {
    expect(
      profilePhotoProblem({
        type: "image/png",
        size: PROFILE_PHOTO_MAX_BYTES + 1,
      })
    ).toBe("That photo is larger than 5 MB. Choose a smaller one.");
  });

  it("offers the three formats to the file picker", () => {
    expect(PROFILE_PHOTO_ACCEPT).toBe("image/jpeg,image/png,image/webp");
  });
});

describe("profilePhotoErrorMessage", () => {
  it("shows the API's detail for the statuses written for the person", () => {
    for (const status of [413, 415, 422, 503]) {
      expect(
        profilePhotoErrorMessage({
          status,
          data: { detail: "The photo must be 5 MB or smaller." },
        })
      ).toBe("The photo must be 5 MB or smaller.");
    }
  });

  it("does not show a list of validation internals", () => {
    expect(
      profilePhotoErrorMessage({
        status: 422,
        data: { detail: [{ loc: ["body"], msg: "field required" }] },
      })
    ).toBe("The photo could not be saved. Try again.");
  });

  it("asks for a fresh sign-in on 401 and 403", () => {
    expect(profilePhotoErrorMessage({ status: 401, data: {} })).toBe(
      "Sign in again to change your photo."
    );
    expect(profilePhotoErrorMessage({ status: 403, data: {} })).toBe(
      "Sign in again to change your photo."
    );
  });

  it("falls back for anything else, including network failures", () => {
    expect(profilePhotoErrorMessage(new TypeError("Failed to fetch"))).toBe(
      "The photo could not be saved. Try again."
    );
    expect(
      profilePhotoErrorMessage({ status: 500, data: { detail: "x" } })
    ).toBe("The photo could not be saved. Try again.");
    expect(profilePhotoErrorMessage(null)).toBe(
      "The photo could not be saved. Try again."
    );
  });
});
