import type { CapAlertPublic } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import { deskAlert } from "@/test/desk-alert.fixture";
import { can, canAny, isEditable } from "./allowed-actions";

function offered(
  lifecycle_state: CapAlertPublic["lifecycle_state"],
  allowed_actions: string[]
) {
  return { allowed_actions, lifecycle_state } as Pick<
    CapAlertPublic,
    "allowed_actions" | "lifecycle_state"
  >;
}

describe("can", () => {
  it("reads the API's list, not the state", () => {
    const alert = offered("APPROVED", ["emergency_publish"]);
    expect(can(alert, "publish")).toBe(false);
    expect(can(alert, "emergency_publish")).toBe(true);
  });

  it("treats a missing list as no actions", () => {
    expect(can({ lifecycle_state: "DRAFT" } as never, "submit")).toBe(false);
  });

  it("is true when any of the listed actions is offered", () => {
    const alert = offered("PUBLISHED", ["expire"]);
    expect(canAny(alert, ["cancel", "expire"])).toBe(true);
    expect(canAny(alert, ["cancel", "publish"])).toBe(false);
  });
});

describe("isEditable", () => {
  it("allows a draft without any transition", () => {
    expect(isEditable(offered("DRAFT", []))).toBe(true);
  });

  it("keeps submitted and approved alerts editable, since an edit reverts them", () => {
    expect(isEditable(offered("SUBMITTED", ["approve"]))).toBe(true);
    expect(isEditable(offered("APPROVED", ["publish"]))).toBe(true);
  });

  it("refuses a published, expired or cancelled alert", () => {
    expect(isEditable(deskAlert({ lifecycle_state: "PUBLISHED" }))).toBe(false);
    expect(isEditable(deskAlert({ lifecycle_state: "EXPIRED" }))).toBe(false);
    expect(isEditable(deskAlert({ lifecycle_state: "CANCELLED" }))).toBe(false);
  });

  it("accepts revert_to_draft if the API ever offers it", () => {
    expect(isEditable(offered("PUBLISHED", ["revert_to_draft"]))).toBe(true);
  });
});
