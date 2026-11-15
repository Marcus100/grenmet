import { describe, expect, it } from "vitest";
import {
  isInvitationId,
  parseSuperuserInvite,
  REASON_MAX,
  REASON_MIN,
  superuserNoticeFor,
} from "./superuser-invitation-form";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const GOOD_REASON = "Operations lead for the platform";

describe("parseSuperuserInvite", () => {
  it("accepts an address and a reason within the rule", () => {
    const parsed = parseSuperuserInvite(
      form({ email: " New.Admin@example.org ", reason: GOOD_REASON })
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value).toEqual({
        email: "New.Admin@example.org",
        reason: GOOD_REASON,
      });
    }
  });

  it("refuses a malformed address and keeps what was typed", () => {
    const parsed = parseSuperuserInvite(
      form({ email: "not-an-address", reason: GOOD_REASON })
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.message).toContain("email address");
      expect(parsed.values.reason).toBe(GOOD_REASON);
    }
  });

  it.each([
    ["short", "x".repeat(REASON_MIN - 1)],
    ["long", "x".repeat(REASON_MAX + 1)],
    ["blank padding", "         "],
  ])("refuses a %s reason", (_label, reason) => {
    const parsed = parseSuperuserInvite(
      form({ email: "a@example.org", reason })
    );
    expect(parsed.ok).toBe(false);
  });

  it("states the rule in the refusal", () => {
    const parsed = parseSuperuserInvite(
      form({ email: "a@example.org", reason: "short" })
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.message).toBe(
        `The reason must be ${REASON_MIN} to ${REASON_MAX} characters.`
      );
    }
  });

  it("refuses a NUL character in the reason", () => {
    const parsed = parseSuperuserInvite(
      form({ email: "a@example.org", reason: `${GOOD_REASON}\u0000` })
    );
    expect(parsed.ok).toBe(false);
  });
});

describe("invitation ids and notices", () => {
  it("accepts only a UUID as an invitation id", () => {
    expect(isInvitationId("3f2b8c1e-9a4d-4e7f-8b2a-1c2d3e4f5a6b")).toBe(true);
    expect(isInvitationId("../../etc")).toBe(false);
    expect(isInvitationId("")).toBe(false);
  });

  it("maps only the fixed notice codes", () => {
    expect(superuserNoticeFor("invited")).toContain("Invitation sent");
    expect(superuserNoticeFor("revoked")).toContain("revoked");
    expect(superuserNoticeFor("<script>")).toBeNull();
    expect(superuserNoticeFor("toString")).toBeNull();
    expect(superuserNoticeFor(undefined)).toBeNull();
  });
});
