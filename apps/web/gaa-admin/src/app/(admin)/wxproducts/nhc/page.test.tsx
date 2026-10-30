import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const EDITOR_LINK = /editor|Alerts/iu;
const mocks = vi.hoisted(() => ({
  editions: vi.fn(),
  redirect: vi.fn(),
  reportError: vi.fn(),
}));
vi.mock("@/db/wxwatch/queries", () => ({ getNhcEditions: mocks.editions }));
vi.mock("@/lib/report-error", () => ({ reportError: mocks.reportError }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/components/wxproducts/nhc-workspace", () => ({
  NhcWorkspace: ({
    query,
    loadError,
  }: {
    query: string;
    loadError: string;
  }) => (
    <div>
      {loadError ? <p role="alert">{loadError}</p> : null}Guidance results:{" "}
      {query}
    </div>
  ),
}));

import Page from "./page";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.editions.mockResolvedValue({ items: [], has_more: false, offset: 0 });
  mocks.redirect.mockImplementation((url: string) => {
    throw new Error(`Redirect: ${url}`);
  });
});
it("redirects the old editor link to Alerts without loading guidance", async () => {
  await expect(
    Page({
      searchParams: Promise.resolve({
        view: "editor",
        sources: "source-a,source-b",
      }),
    })
  ).rejects.toMatchObject({
    message:
      "Redirect: /wxproducts/alerts?kind=outlook&sources=source-a%2Csource-b",
  });
  expect(mocks.editions).not.toHaveBeenCalled();
});
it("preserves cyclone or marine selection on an old editor URL", async () => {
  await expect(
    Page({ searchParams: Promise.resolve({ view: "editor", kind: "cyclone" }) })
  ).rejects.toMatchObject({
    message: "Redirect: /wxproducts/alerts?kind=cyclone",
  });
});
it("displays guidance filters without an editor link", async () => {
  render(
    await Page({
      searchParams: Promise.resolve({
        family: "marine",
        storm: "al012026",
        sources: "source-a",
      }),
    })
  );
  expect(mocks.editions.mock.calls[0]?.[0]?.get("family")).toBe("marine");
  expect(mocks.editions.mock.calls[0]?.[0]?.get("storm")).toBe("al012026");
  expect(
    screen.queryByRole("link", { name: EDITOR_LINK })
  ).not.toBeInTheDocument();
});
it("displays guidance failure without an editor link", async () => {
  mocks.editions.mockRejectedValue(new Error("offline"));
  render(await Page({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "NHC guidance unavailable"
  );
  expect(
    screen.queryByRole("link", { name: EDITOR_LINK })
  ).not.toBeInTheDocument();
  expect(mocks.reportError).toHaveBeenCalled();
});
