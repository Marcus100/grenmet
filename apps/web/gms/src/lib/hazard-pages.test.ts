// @vitest-environment node
import { BULLETIN_CATEGORIES } from "@barrelsgd/gms/products";
import { describe, expect, it } from "vitest";
import { PREPARE_PAGE } from "@/lib/hazard-pages";
import { APP_DIR, routesOnDisk, serves } from "@/test/routes";

describe("PREPARE_PAGE", () => {
  const routes = routesOnDisk(APP_DIR);

  it("only names hazards that have a bulletin category", () => {
    for (const hazard of Object.keys(PREPARE_PAGE)) {
      expect(Object.keys(BULLETIN_CATEGORIES)).toContain(hazard);
    }
  });

  it.each(Object.entries(PREPARE_PAGE))(
    "%s links to a page that exists",
    (_hazard, page) => {
      expect(routes.some((route) => serves(route, page.href))).toBe(true);
    }
  );
});
