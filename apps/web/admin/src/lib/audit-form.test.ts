import { describe, expect, it } from "vitest";
import {
  auditApiQuery,
  auditPageHref,
  changeValue,
  formatGrenada,
  formatUtc,
  grenadaDayEnd,
  grenadaDayStart,
  parseAuditFilters,
  parseCursor,
} from "@/lib/audit-form";

const ACTOR = "0b8f6f0e-6a53-4a0e-9a9b-3f1f2c5d7e11";

describe("parseAuditFilters", () => {
  it("treats empty fields as no filter", () => {
    expect(parseAuditFilters({ actor_id: "", from: "  " })).toEqual({
      ok: true,
      value: {},
    });
  });

  it("trims and keeps valid values", () => {
    const result = parseAuditFilters({
      actor_id: ` ${ACTOR} `,
      action: "update",
      entity_type: "platform_organisation",
      organisation_id: "org_1",
      from: "2026-11-01",
      to: "2026-11-30",
    });
    expect(result).toEqual({
      ok: true,
      value: {
        actorId: ACTOR,
        action: "update",
        entityType: "platform_organisation",
        organisationId: "org_1",
        from: "2026-11-01",
        to: "2026-11-30",
      },
    });
  });

  it("refuses a malformed actor id", () => {
    const result = parseAuditFilters({ actor_id: "someone@barrels.gd" });
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.problems).toEqual([
      "The actor id must be a full user id (a UUID).",
    ]);
  });

  it("refuses an action longer than the API accepts or with spaces", () => {
    expect(parseAuditFilters({ action: "a".repeat(21) }).ok).toBe(false);
    expect(parseAuditFilters({ action: "not valid" }).ok).toBe(false);
    expect(parseAuditFilters({ action: "a".repeat(20) }).ok).toBe(true);
  });

  it("refuses an entity type over 60 characters", () => {
    expect(parseAuditFilters({ entity_type: "a".repeat(61) }).ok).toBe(false);
  });

  it("refuses an organisation id with spaces or punctuation", () => {
    expect(parseAuditFilters({ organisation_id: "org 1" }).ok).toBe(false);
    expect(parseAuditFilters({ organisation_id: "org.1" }).ok).toBe(false);
  });

  it("refuses dates that are not real days", () => {
    const result = parseAuditFilters({ from: "2026-02-30" });
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.problems).toEqual([
      "The from date must be a real day in the form YYYY-MM-DD.",
    ]);
    expect(parseAuditFilters({ to: "22/11/2026" }).ok).toBe(false);
  });

  it("refuses a range that ends before it starts", () => {
    const result = parseAuditFilters({ from: "2026-11-10", to: "2026-11-09" });
    expect(result.ok ? [] : result.problems).toEqual([
      "The to date is before the from date.",
    ]);
  });

  it("reports every problem at once, not only the first", () => {
    const result = parseAuditFilters({ actor_id: "x", from: "nope" });
    expect(result.ok ? [] : result.problems).toHaveLength(2);
  });
});

describe("Grenada day bounds", () => {
  it("starts a Grenada day at 04:00 UTC (UTC-4, no daylight saving)", () => {
    expect(grenadaDayStart("2026-11-01")).toBe("2026-11-01T04:00:00.000Z");
  });

  it("ends a Grenada day on its last millisecond, so the API's inclusive bound holds", () => {
    expect(grenadaDayEnd("2026-11-30")).toBe("2026-12-01T03:59:59.999Z");
  });

  it("rolls the end across a year boundary", () => {
    expect(grenadaDayEnd("2026-12-31")).toBe("2027-01-01T03:59:59.999Z");
  });
});

describe("auditApiQuery", () => {
  it("uses the API's parameter names and converts the day range", () => {
    const params = auditApiQuery(
      {
        actorId: ACTOR,
        action: "update",
        entityType: "platform_organisation",
        organisationId: "org_1",
        from: "2026-11-01",
        to: "2026-11-30",
      },
      "abc+/=="
    );
    expect(Object.fromEntries(params)).toEqual({
      actor_id: ACTOR,
      action: "update",
      entity_type: "platform_organisation",
      organisation_id: "org_1",
      created_from: "2026-11-01T04:00:00.000Z",
      created_to: "2026-12-01T03:59:59.999Z",
      cursor: "abc+/==",
    });
  });

  it("sends nothing for empty filters", () => {
    expect(auditApiQuery({}, undefined).toString()).toBe("");
  });
});

describe("cursor links", () => {
  it("keeps the filters and URL-encodes the opaque cursor", () => {
    const href = auditPageHref(
      { action: "update", from: "2026-11-01" },
      "eyJ0IjoiMjAyNiJ9+/=="
    );
    expect(href).toBe(
      "/audit?action=update&from=2026-11-01&cursor=eyJ0IjoiMjAyNiJ9%2B%2F%3D%3D"
    );
  });

  it("returns to the newest entries with the same filters when there is no cursor", () => {
    expect(auditPageHref({ action: "update" })).toBe("/audit?action=update");
  });

  it("is the bare screen when there are no filters and no cursor", () => {
    expect(auditPageHref({})).toBe("/audit");
  });

  it("refuses a cursor longer than the API can have issued", () => {
    expect(parseCursor("a".repeat(501))).toBeUndefined();
    expect(parseCursor("a".repeat(500))).toBe("a".repeat(500));
    expect(parseCursor(undefined)).toBeUndefined();
  });
});

describe("display helpers", () => {
  it("shows the Grenada wall-clock time and the UTC value", () => {
    // 02:30 UTC on the 22nd is 22:30 on the 21st in Grenada.
    expect(formatGrenada("2026-11-22T02:30:00.123456Z")).toBe(
      "21 Nov 2026, 22:30"
    );
    expect(formatUtc("2026-11-22T02:30:00.123456Z")).toBe(
      "2026-11-22 02:30 UTC"
    );
  });

  it("shows change values exactly as sent", () => {
    expect(changeValue("Acme Events")).toBe("Acme Events");
    expect(changeValue(0)).toBe("0");
    expect(changeValue(false)).toBe("false");
    expect(changeValue(null)).toBe("null");
    expect(changeValue(undefined)).toBe("-");
  });
});
