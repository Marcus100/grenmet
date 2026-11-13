import type { CapAlertPublic } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import { can, canAny } from "./cap-allowed-actions";

function alertWith(allowed_actions?: string[]) {
  return { allowed_actions, lifecycle_state: "APPROVED" } as Pick<
    CapAlertPublic,
    "allowed_actions"
  >;
}

describe("can", () => {
  it("reads the API's list, not the lifecycle state", () => {
    const alert = alertWith(["emergency_publish"]);
    expect(can(alert, "publish")).toBe(false);
    expect(can(alert, "emergency_publish")).toBe(true);
  });

  it("treats a missing list as no actions", () => {
    expect(can(alertWith(undefined), "submit")).toBe(false);
  });
});

describe("canAny", () => {
  it("is true when any listed action is offered", () => {
    const alert = alertWith(["expire"]);
    expect(canAny(alert, ["cancel", "expire"])).toBe(true);
    expect(canAny(alert, ["cancel", "publish"])).toBe(false);
  });
});
