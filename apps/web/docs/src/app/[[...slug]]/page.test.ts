import { describe, expect, it, vi } from "vitest";

vi.mock("content-collections", () => ({
  allHurricanepages: [
    { _meta: { path: "index" }, title: "Home", body: "" },
    { _meta: { path: "appendix/mbia-vehicles" }, title: "Vehicles", body: "" },
  ],
}));
vi.mock("@/components/MdxContent", () => ({ MdxContent: () => null }));

const page = await import("./page");

describe("docs catch-all route", () => {
  it("serves only the content pages, so Next answers any other path with a server-rendered 404", () => {
    expect(page.dynamicParams).toBe(false);
  });

  it("generates every content page, the home page included", () => {
    expect(page.generateStaticParams()).toEqual([
      { slug: undefined },
      { slug: ["appendix", "mbia-vehicles"] },
    ]);
  });
});
