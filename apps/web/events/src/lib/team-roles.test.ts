import { describe, expect, it } from "vitest";
import {
  allowedActions,
  bundleCopy,
  CHANGED_TOGETHER,
  EXPIRY_PAST,
  expiryFromDate,
  formatUtc,
  friendlyTeamError,
  isOpaqueId,
  isRoleKey,
  NOT_FOUND_TEAM,
  permissionLabel,
  todayUtc,
} from "./team-roles";

const NOW = new Date("2026-10-22T15:00:00Z");

describe("bundleCopy", () => {
  it("names each Events bundle and falls back for a new one", () => {
    expect(bundleCopy("events-door").title).toBe("Door staff");
    expect(bundleCopy("events-refunds").description).toContain("refunds");
    expect(bundleCopy("bookings-front-desk").title).toBe("Bookings front desk");
  });

  it("words permissions and keeps an unknown key readable", () => {
    expect(permissionLabel("events.door.scan")).toBe(
      "Scan and admit tickets at the door"
    );
    expect(allowedActions(["events.new.thing"])).toEqual(["Events new thing"]);
  });
});

describe("expiryFromDate", () => {
  it("means no end date when empty", () => {
    expect(expiryFromDate("  ", NOW)).toEqual({ ok: true, iso: null });
  });

  it("ends the chosen day at 23:59:59 UTC", () => {
    expect(expiryFromDate("2026-10-22", NOW)).toEqual({
      ok: true,
      iso: "2026-10-22T23:59:59.000Z",
    });
  });

  it("refuses a past day, a malformed value and a day that does not exist", () => {
    for (const value of ["2026-10-21", "22/10/2026", "2026-02-30"]) {
      expect(expiryFromDate(value, NOW)).toEqual({
        ok: false,
        error: EXPIRY_PAST,
      });
    }
  });

  it("gives the UTC day the date field starts from", () => {
    expect(todayUtc(new Date("2026-10-22T23:30:00Z"))).toBe("2026-10-22");
  });

  it("labels stored instants as UTC", () => {
    expect(formatUtc("2026-10-22T23:59:59Z")).toContain("UTC");
  });
});

describe("id checks", () => {
  it("accepts opaque ids and role keys and rejects path tricks", () => {
    expect(isOpaqueId("mem_abc-123")).toBe(true);
    expect(isOpaqueId("../org")).toBe(false);
    expect(isOpaqueId("")).toBe(false);
    expect(isRoleKey("events-door")).toBe(true);
    expect(isRoleKey("Events Door")).toBe(false);
  });
});

describe("friendlyTeamError", () => {
  it("passes the API's plain refusals through", () => {
    expect(friendlyTeamError(403, "You cannot change your own roles")).toBe(
      "You cannot change your own roles"
    );
    expect(
      friendlyTeamError(
        422,
        "This grant cannot outlast your own access to the role"
      )
    ).toContain("outlast");
    expect(friendlyTeamError(409, "That member already holds this role")).toBe(
      "That member already holds this role"
    );
  });

  it("rewords the lost-race conflict and asks for a reload on 404", () => {
    expect(
      friendlyTeamError(
        409,
        "Roles for this member changed at the same time; try again"
      )
    ).toBe(CHANGED_TOGETHER);
    expect(friendlyTeamError(404, "Role grant not found")).toBe(NOT_FOUND_TEAM);
  });

  it("passes the real owner-touch refusal through", () => {
    expect(
      friendlyTeamError(
        403,
        "Your role in this organisation does not allow this"
      )
    ).toBe("Your role in this organisation does not allow this");
  });

  it("does not echo unknown detail text", () => {
    expect(friendlyTeamError(403, "secret internal text")).not.toContain(
      "secret"
    );
    expect(friendlyTeamError(422, null)).toContain("refused");
  });
});
