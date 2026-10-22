import { describe, expect, it } from "vitest";
import { memberNoticeForError, parseMemberAdd } from "@/lib/member-form";

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
