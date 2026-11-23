import { describe, expect, it } from "vitest";
import {
  auditActorLabel,
  auditStateLabel,
  auditTransitionLabel,
  STAFF_ACTOR_LABEL,
  SYSTEM_ACTOR_LABEL,
} from "./audit-labels";

const USER_ID = "33333333-3333-4333-8333-333333333333";

describe("audit actor label", () => {
  it("never shows a raw user id: a staff member reads as 'Staff member'", () => {
    expect(auditActorLabel(USER_ID)).toBe(STAFF_ACTOR_LABEL);
    expect(auditActorLabel(USER_ID)).not.toContain("3333");
  });

  it("reads a null actor as 'System'", () => {
    expect(auditActorLabel(null)).toBe("System");
    expect(auditActorLabel(undefined)).toBe(SYSTEM_ACTOR_LABEL);
  });

  it("treats an empty id as no actor", () => {
    expect(auditActorLabel("")).toBe("System");
  });
});

describe("audit state label", () => {
  it("uses sentence case and spaces for underscores", () => {
    expect(auditStateLabel("DRAFT")).toBe("Draft");
    expect(auditStateLabel("PUBLISHED")).toBe("Published");
    expect(auditStateLabel("PENDING_REVIEW")).toBe("Pending review");
  });
});

describe("audit transition label", () => {
  it("says 'Created as a draft' when there is no previous state", () => {
    expect(auditTransitionLabel(null, "DRAFT")).toBe("Created as a draft");
    expect(auditTransitionLabel(undefined, "DRAFT")).toBe("Created as a draft");
  });

  it("says where a first state other than draft started, in sentence case", () => {
    expect(auditTransitionLabel(null, "PUBLISHED")).toBe(
      "Created as published"
    );
  });

  it("shows a state change as 'Draft → Published'", () => {
    expect(auditTransitionLabel("DRAFT", "PUBLISHED")).toBe(
      "Draft → Published"
    );
  });

  it("never shows 'None' or the raw state names", () => {
    expect(auditTransitionLabel("DRAFT", null)).toBe(
      "Draft (no new state recorded)"
    );
    expect(auditTransitionLabel(null, null)).toBe("No state recorded");
    expect(auditTransitionLabel(null, null)).not.toContain("None");
  });
});
