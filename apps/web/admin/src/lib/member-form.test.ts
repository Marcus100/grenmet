import { describe, expect, it } from "vitest";
import {
  memberNoticeFor,
  memberNoticeForError,
  parseMemberAdd,
} from "@/lib/member-form";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("member form", () => {
  it("requires a valid email or uuid and a long enough reason", () => {
    const reason = "A real reason here";
    expect(parseMemberAdd(form({ user: "nope", reason })).ok).toBe(false);
    expect(parseMemberAdd(form({ user: "a@b.gd", reason: "short" })).ok).toBe(
      false
    );
    expect(parseMemberAdd(form({ user: "a@b.gd", reason })).ok).toBe(true);
  });

  it("reads a 409 as already-member on add and last-owner otherwise", () => {
    expect(memberNoticeForError("add", 409, "").code).toBe("member-already");
    expect(memberNoticeForError("remove", 409, "").code).toBe(
      "member-last-owner"
    );
    expect(memberNoticeForError("add", 500, "").known).toBe(false);
  });
});

describe("notice lookups", () => {
  it("ignores prototype keys", () => {
    expect(memberNoticeFor("constructor")).toBeUndefined();
    expect(memberNoticeFor("member-added")?.tone).toBe("ok");
  });

  it("maps other 403s to a neutral notice that is reported", () => {
    for (const action of ["change", "remove"] as const) {
      expect(memberNoticeForError(action, 403, "Only an owner can")).toEqual({
        code: "member-forbidden",
        known: false,
      });
    }
    expect(
      memberNoticeForError("change", 403, "superuser_mfa_required: x").code
    ).toBe("member-mfa");
  });
});
