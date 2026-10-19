import { describe, expect, it } from "vitest";
import {
  canRequestAccess,
  chooseOrganisation,
  firstParam,
  type OrganisationStanding,
} from "@/lib/organisations";

const org = (
  id: string,
  entitled: boolean,
  role = "admin"
): OrganisationStanding => ({
  entitled,
  id,
  name: id,
  request_status: null,
  role,
});

describe("chooseOrganisation", () => {
  const list = [org("a", false), org("b", true), org("c", true)];

  it("honours a requested organisation the person belongs to", () => {
    expect(chooseOrganisation(list, "a")?.id).toBe("a");
  });

  it("ignores an organisation the person does not belong to", () => {
    expect(chooseOrganisation(list, "zzz")?.id).toBe("b");
  });

  it("falls back to the first organisation, or null", () => {
    expect(chooseOrganisation([org("a", false)], null)?.id).toBe("a");
    expect(chooseOrganisation([], null)).toBeNull();
  });
});

describe("canRequestAccess", () => {
  it("allows owners and admins only", () => {
    expect(canRequestAccess("owner")).toBe(true);
    expect(canRequestAccess("admin")).toBe(true);
    expect(canRequestAccess("member")).toBe(false);
  });
});

describe("firstParam", () => {
  it("takes the first non-blank value", () => {
    expect(firstParam(["x", "y"])).toBe("x");
    expect(firstParam("  ")).toBeNull();
    expect(firstParam(undefined)).toBeNull();
  });
});
