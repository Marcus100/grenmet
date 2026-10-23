import { describe, expect, it } from "vitest";
import {
  historyActionLabel,
  moderationNoticeFor,
  moderationNoticeForError,
  parseModerationStatus,
  parseReason,
} from "./moderation-form";

describe("moderation form helpers", () => {
  it("defaults the status filter to pending", () => {
    expect(parseModerationStatus("rejected")).toBe("rejected");
    expect(parseModerationStatus("bogus")).toBe("pending");
    expect(parseModerationStatus(undefined)).toBe("pending");
  });

  it("requires a 3 to 500 character reason to reject", () => {
    expect(parseReason("reject", "  ")).toEqual({ ok: false });
    expect(parseReason("reject", "ab")).toEqual({ ok: false });
    expect(parseReason("reject", "x".repeat(501))).toEqual({ ok: false });
    expect(parseReason("reject", " Papers missing ")).toEqual({
      ok: true,
      value: "Papers missing",
    });
  });

  it("lets approval omit the note but not send a too-short one", () => {
    expect(parseReason("approve", "")).toEqual({ ok: true, value: undefined });
    expect(parseReason("approve", "ok")).toEqual({ ok: false });
  });

  it("maps real API refusals", () => {
    const code = (status: number, detail: string) =>
      moderationNoticeForError(status, detail).code;
    expect(code(403, "superuser_mfa_required: enrol")).toBe("mfa");
    expect(
      code(403, "Sign in again with your authenticator or recovery code")
    ).toBe("mfa");
    expect(code(403, "Only a superuser can do this")).toBe("not-allowed");
    expect(code(409, "Organisation is already verified")).toBe(
      "already-decided"
    );
    expect(code(409, "Organisation is already rejected")).toBe(
      "already-decided"
    );
    expect(
      code(409, "This organiser was rejected; it must be resubmitted")
    ).toBe("already-decided");
    expect(code(409, "A suspended organisation cannot be verified")).toBe(
      "suspended"
    );
    expect(code(404, "Verification case not found")).toBe("missing");
    expect(code(422, "x")).toBe("invalid");
    expect(moderationNoticeForError(500, "boom")).toEqual({
      code: "failed",
      known: false,
    });
  });

  it("only resolves known notice codes", () => {
    expect(moderationNoticeFor("approved")?.tone).toBe("ok");
    expect(moderationNoticeFor("toString")).toBeUndefined();
    expect(moderationNoticeFor(undefined)).toBeUndefined();
  });

  it("labels history actions", () => {
    expect(historyActionLabel("verify")).toBe("Approved");
    expect(historyActionLabel("resubmit")).toBe("Resubmitted for review");
    expect(historyActionLabel("other")).toBe("other");
  });
});
