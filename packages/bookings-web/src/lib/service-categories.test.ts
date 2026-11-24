import type { BookingPublicService } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import {
  defaultOpenCategory,
  groupServicesByCategory,
  serviceCountLabel,
  UNCATEGORISED_LABEL,
} from "./service-categories";

function service(id: string, category: string | null): BookingPublicService {
  return {
    id,
    name: `Service ${id}`,
    category,
    description: null,
    duration_min: 30,
    price_minor: 1000,
    deposit_minor: 0,
  };
}

const LASH_1 = service("lash-1", "Lashes");
const BROW_1 = service("brow-1", "Brows");
const LASH_2 = service("lash-2", "Lashes");
const FACIAL_1 = service("facial-1", "Facials");

describe("groupServicesByCategory", () => {
  it("groups in the order each category first appears, keeping service order", () => {
    const groups = groupServicesByCategory([LASH_1, BROW_1, LASH_2, FACIAL_1]);
    expect(groups.map((g) => g.label)).toEqual(["Lashes", "Brows", "Facials"]);
    expect(groups[0]?.services.map((s) => s.id)).toEqual(["lash-1", "lash-2"]);
  });

  it("treats categories that differ only by case or spaces as one group", () => {
    const groups = groupServicesByCategory([
      service("a", "Lashes"),
      service("b", "  lashes "),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("Lashes");
    expect(groups[0]?.services).toHaveLength(2);
  });

  it("puts services without a category under the Services heading", () => {
    const groups = groupServicesByCategory([
      service("x", null),
      service("y", ""),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe(UNCATEGORISED_LABEL);
    expect(groups[0]?.services).toHaveLength(2);
  });

  it("returns no groups for no services", () => {
    expect(groupServicesByCategory([])).toEqual([]);
  });
});

describe("defaultOpenCategory", () => {
  const groups = groupServicesByCategory([LASH_1, BROW_1, FACIAL_1]);

  it("opens the first category when nothing is chosen", () => {
    expect(defaultOpenCategory(groups, null)).toBe("lashes");
  });

  it("opens the category holding the chosen service", () => {
    expect(defaultOpenCategory(groups, "facial-1")).toBe("facials");
  });

  it("opens the category holding the first Book again service", () => {
    expect(defaultOpenCategory(groups, null, ["brow-1", "facial-1"])).toBe(
      "brows"
    );
  });

  it("prefers the chosen service over a Book again shortcut", () => {
    expect(defaultOpenCategory(groups, "facial-1", ["brow-1"])).toBe("facials");
  });

  it("skips a Book again service the business no longer offers", () => {
    expect(defaultOpenCategory(groups, null, ["gone", "facial-1"])).toBe(
      "facials"
    );
  });

  it("is null when there are no categories", () => {
    expect(defaultOpenCategory([], null)).toBeNull();
  });
});

describe("serviceCountLabel", () => {
  it("uses the singular for one service", () => {
    expect(serviceCountLabel(1)).toBe("1 service");
  });

  it("uses the plural otherwise", () => {
    expect(serviceCountLabel(0)).toBe("0 services");
    expect(serviceCountLabel(3)).toBe("3 services");
  });
});
