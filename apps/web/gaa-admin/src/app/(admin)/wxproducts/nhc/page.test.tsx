import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ archive: vi.fn(), history: vi.fn() }));
vi.mock("@/db/wxwatch/queries", () => ({
  getArchive: mocks.archive,
  getArchiveHistory: mocks.history,
}));
vi.mock("@/components/wxproducts/product-desk", () => ({
  ProductDesk: ({ title }: { title: string }) => <div>{title} form</div>,
}));
vi.mock("@/components/wxwatch/archive-browser", () => ({
  ArchiveBrowser: ({ query }: { query: string }) => (
    <div>Guidance results: {query}</div>
  ),
}));

import Page from "./page";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.archive.mockResolvedValue({ items: [], has_more: false, offset: 0 });
});
it("keeps the existing outlook editor independent of guidance availability", async () => {
  render(await Page({ searchParams: Promise.resolve({ view: "editor" }) }));
  expect(screen.getByText("Outlook editor form")).toBeInTheDocument();
  expect(mocks.archive).not.toHaveBeenCalled();
});
it("uses the existing route for NHC-only guidance", async () => {
  render(await Page({ searchParams: Promise.resolve({ source: "cimss" }) }));
  expect(mocks.archive.mock.calls[0][0].get("source")).toBe("nhc");
  expect(screen.getByRole("link", { name: "Outlook editor" })).toHaveAttribute(
    "href",
    "/wxproducts/nhc?view=editor"
  );
});
it("keeps the editor link available when guidance fails", async () => {
  mocks.archive.mockRejectedValue(new Error("offline"));
  render(await Page({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "NHC guidance unavailable"
  );
  expect(
    screen.getByRole("link", { name: "Outlook editor" })
  ).toBeInTheDocument();
});
