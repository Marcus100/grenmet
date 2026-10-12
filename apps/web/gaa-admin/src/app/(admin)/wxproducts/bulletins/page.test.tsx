import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(url);
  }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import Page from "./page";

it("redirects previous Bulletin bookmarks and keeps editor parameters", async () => {
  await expect(
    Page({
      searchParams: Promise.resolve({
        kind: "cyclone",
        sources: "source-a,source-b",
      }),
    })
  ).rejects.toMatchObject({
    message: "/wxproducts/alerts?kind=cyclone&sources=source-a%2Csource-b",
  });
});
