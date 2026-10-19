import { describe, expect, it } from "vitest";
import {
  noticeFor,
  noticeForStatus,
  parseCreate,
  parseEdit,
  parseEntitlement,
  parseOrganisationId,
  parseReason,
  parseStatus,
} from "@/lib/organisation-form";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("organisation forms", () => {
  it("accepts a create with an optional slug and trims the name", () => {
    expect(parseCreate(form({ name: "  Acme  ", kind: "client" }))).toEqual({
      ok: true,
      value: { name: "Acme", kind: "client" },
    });
    expect(
      parseCreate(form({ name: "Acme", kind: "barrels", slug: "acme-co" }))
    ).toEqual({
      ok: true,
      value: { name: "Acme", kind: "barrels", slug: "acme-co" },
    });
  });

  it("rejects a blank name, an unknown kind and a malformed slug", () => {
    expect(parseCreate(form({ name: " ", kind: "client" })).ok).toBe(false);
    expect(parseCreate(form({ name: "A", kind: "government" })).ok).toBe(false);
    expect(
      parseCreate(form({ name: "A", kind: "client", slug: "Not Ok" })).ok
    ).toBe(false);
  });

  it("requires a slug when editing", () => {
    expect(parseEdit(form({ name: "A", kind: "client" })).ok).toBe(false);
    expect(parseEdit(form({ name: "A", kind: "client", slug: "a-1" })).ok).toBe(
      true
    );
  });

  it("requires a reason of 3 to 500 characters", () => {
    expect(parseReason(form({ reason: "  " })).ok).toBe(false);
    expect(parseReason(form({ reason: "ab" })).ok).toBe(false);
    expect(parseReason(form({ reason: "x".repeat(501) })).ok).toBe(false);
    expect(parseReason(form({ reason: " Papers checked " }))).toEqual({
      ok: true,
      value: "Papers checked",
    });
  });

  it("accepts only active or suspended", () => {
    expect(parseStatus(form({ status: "suspended" })).ok).toBe(true);
    expect(parseStatus(form({ status: "deleted" })).ok).toBe(false);
  });

  it("parses an entitlement toggle strictly", () => {
    expect(
      parseEntitlement(form({ app_key: "events", enabled: "false" }))
    ).toEqual({ ok: true, value: { appKey: "events", enabled: false } });
    expect(
      parseEntitlement(form({ app_key: "Events!", enabled: "true" })).ok
    ).toBe(false);
    expect(
      parseEntitlement(form({ app_key: "events", enabled: "yes" })).ok
    ).toBe(false);
  });

  it("rejects ids that could escape the path", () => {
    expect(parseOrganisationId("org_0123abcd")).toBe("org_0123abcd");
    expect(parseOrganisationId("../x")).toBeUndefined();
    expect(parseOrganisationId("")).toBeUndefined();
  });

  it("maps only known notice codes and API statuses", () => {
    expect(noticeFor("verified")?.tone).toBe("ok");
    expect(noticeFor("<script>")).toBeUndefined();
    expect(noticeForStatus(409)).toBe("conflict");
    expect(noticeForStatus(422)).toBe("invalid");
    expect(noticeForStatus(403)).toBe("failed");
  });
});
