import { describe, expect, it } from "vitest";
import {
  parsePrintixAccess,
  parsePrintixAdd,
  printixNoticeFor,
  printixNoticeForError,
} from "./printix-form";

const REASON = "Rehearsal staff for the 14 Dec event";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("parsePrintixAdd", () => {
  it("takes an email and an access level", () => {
    const parsed = parsePrintixAdd(
      form({ user: " ann@example.gd ", access: "organiser", reason: REASON })
    );
    expect(parsed).toEqual({
      ok: true,
      value: { email: "ann@example.gd", access: "organiser", reason: REASON },
    });
  });

  it("sends an account id as user_id", () => {
    const id = "0b8f6f0e-6a53-4a0e-9a9b-3f1f2c5d7e11";
    const parsed = parsePrintixAdd(
      form({ user: id, access: "gate_lead", reason: REASON })
    );
    expect(parsed).toEqual({
      ok: true,
      value: { user_id: id, access: "gate_lead", reason: REASON },
    });
  });

  it("refuses none, a short reason and a bad email", () => {
    expect(
      parsePrintixAdd(form({ user: "a@b.gd", access: "none", reason: REASON }))
        .ok
    ).toBe(false);
    expect(
      parsePrintixAdd(
        form({ user: "a@b.gd", access: "organiser", reason: "short" })
      ).ok
    ).toBe(false);
    expect(
      parsePrintixAdd(
        form({ user: "not an email", access: "organiser", reason: REASON })
      ).ok
    ).toBe(false);
  });
});

describe("parsePrintixAccess", () => {
  it("accepts the three levels and rejects anything else", () => {
    for (const access of ["none", "gate_lead", "organiser"]) {
      expect(parsePrintixAccess(form({ access, reason: REASON })).ok).toBe(
        true
      );
    }
    expect(
      parsePrintixAccess(form({ access: "owner", reason: REASON })).ok
    ).toBe(false);
    expect(parsePrintixAccess(form({ access: "none", reason: "" })).ok).toBe(
      false
    );
  });
});

describe("printixNoticeForError", () => {
  it("maps expected refusals to known notices", () => {
    expect(printixNoticeForError("add", 404, "Account not found")).toEqual({
      code: "printix-no-account",
      known: true,
    });
    expect(printixNoticeForError("set", 404, "Member not found")).toEqual({
      code: "printix-missing",
      known: true,
    });
    expect(
      printixNoticeForError(
        "set",
        409,
        "Turn on Printix for this organisation first"
      )
    ).toEqual({ code: "printix-not-entitled", known: true });
    expect(
      printixNoticeForError("set", 409, "Owners and admins hold every")
    ).toEqual({ code: "printix-owner", known: true });
    expect(printixNoticeForError("add", 409, "Already a member")).toEqual({
      code: "printix-already",
      known: true,
    });
    expect(printixNoticeForError("add", 403, "superuser_mfa_required")).toEqual(
      { code: "printix-mfa", known: true }
    );
  });

  it("reports what it does not expect", () => {
    expect(printixNoticeForError("set", 500, "boom").known).toBe(false);
    expect(printixNoticeForError("set", 403, "nope").known).toBe(false);
  });

  it("looks notices up safely", () => {
    expect(printixNoticeFor("printix-added")?.tone).toBe("ok");
    expect(printixNoticeFor("constructor")).toBeUndefined();
    expect(printixNoticeFor(undefined)).toBeUndefined();
  });
});
