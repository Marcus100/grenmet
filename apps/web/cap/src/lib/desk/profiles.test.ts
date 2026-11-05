import type { CapProfilePublic } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import type { DeskPermissions } from "./permissions";
import {
  alertStartCheck,
  alertStartPermissionCheck,
  approvalCheck,
  groupProfiles,
  versionDraftCheck,
} from "./profiles";

const AUTHOR = "aaaaaaaa-0000-4000-8000-000000000001";
const REVIEWER = "bbbbbbbb-0000-4000-8000-000000000002";

function profile(
  overrides: Partial<CapProfilePublic> & { key: string; version: number }
): CapProfilePublic {
  return {
    approval_errors: [],
    approved_at: null,
    approved_by: null,
    created_at: "2026-10-01T10:00:00Z",
    created_by: AUTHOR,
    definition: { name: `Hazard ${overrides.key}` },
    id: `id-${overrides.key}-${overrides.version}`,
    state: "DRAFT",
    ...overrides,
  } as unknown as CapProfilePublic;
}

const ALL: Pick<DeskPermissions, "approve" | "libraryManage"> = {
  approve: true,
  libraryManage: true,
};

describe("groupProfiles", () => {
  it("picks the newest version as latest and keeps history newest first", () => {
    const groups = groupProfiles([
      profile({ key: "flood", version: 1, state: "APPROVED" }),
      profile({ key: "flood", version: 3 }),
      profile({ key: "flood", version: 2, state: "APPROVED" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.latest.version).toBe(3);
    expect(groups[0]?.versions.map((v) => v.version)).toEqual([3, 2, 1]);
  });

  it("sorts profiles by name", () => {
    const groups = groupProfiles([
      profile({ key: "wind", version: 1 }),
      profile({ key: "flood", version: 1 }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["flood", "wind"]);
  });
});

describe("approvalCheck", () => {
  it("allows a different reviewer with both permissions", () => {
    expect(
      approvalCheck(profile({ key: "a", version: 1 }), ALL, REVIEWER)
    ).toEqual({
      allowed: true,
    });
  });

  it("says plainly that an approved version is already approved", () => {
    const result = approvalCheck(
      profile({ key: "a", version: 1, state: "APPROVED" }),
      ALL,
      REVIEWER
    );
    expect(result).toMatchObject({ allowed: false });
  });

  it("refuses without library and approval access", () => {
    const result = approvalCheck(
      profile({ key: "a", version: 1 }),
      { approve: true, libraryManage: false },
      REVIEWER
    );
    expect(result.allowed).toBe(false);
  });

  it("refuses the author's own version", () => {
    const result = approvalCheck(
      profile({ key: "a", version: 1, created_by: AUTHOR }),
      ALL,
      AUTHOR
    );
    expect(result).toMatchObject({
      allowed: false,
      reason: "You wrote this version. A different reviewer must approve it.",
    });
  });

  it("refuses a version with approval errors", () => {
    const result = approvalCheck(
      profile({ key: "a", version: 1, approval_errors: ["No templates"] }),
      ALL,
      REVIEWER
    );
    expect(result.allowed).toBe(false);
  });
});

describe("versionDraftCheck (cap.library.manage)", () => {
  it("allows a holder of hazard library access", () => {
    expect(versionDraftCheck({ libraryManage: true })).toEqual({
      allowed: true,
    });
  });

  it("refuses without library access and says what to ask for", () => {
    expect(versionDraftCheck({ libraryManage: false })).toEqual({
      allowed: false,
      reason:
        "You need hazard library access to draft a profile version. Ask a GMS administrator.",
    });
  });
});

describe("alertStartCheck (cap.alert.create on an approved version)", () => {
  it("allows an approved version for a holder of warning creation", () => {
    expect(
      alertStartCheck(profile({ key: "a", version: 1, state: "APPROVED" }), {
        create: true,
      })
    ).toEqual({ allowed: true });
  });

  it("says a draft must be approved first, even for an allowed user", () => {
    expect(
      alertStartCheck(profile({ key: "a", version: 1 }), { create: true })
    ).toEqual({
      allowed: false,
      reason: "Approve this version before starting a warning from it.",
    });
  });

  it("refuses an approved version without warning creation", () => {
    const result = alertStartCheck(
      profile({ key: "a", version: 1, state: "APPROVED" }),
      { create: false }
    );
    expect(result.allowed).toBe(false);
  });
});

describe("alertStartPermissionCheck", () => {
  it("is the permission half of alertStartCheck", () => {
    expect(alertStartPermissionCheck({ create: true })).toEqual({
      allowed: true,
    });
    expect(alertStartPermissionCheck({ create: false })).toMatchObject({
      allowed: false,
    });
  });
});
