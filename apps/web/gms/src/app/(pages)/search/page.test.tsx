import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPublishedContent } from "@/lib/cms";
import SearchPage from "./page";

vi.mock("@/lib/cms", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cms")>()),
  fetchPublishedContent: vi.fn(),
}));

async function renderSearch(q: string | string[] | undefined) {
  const element = await SearchPage({
    searchParams: Promise.resolve({ q }),
  });
  render(element);
}

describe("/search", () => {
  beforeEach(() => {
    vi.mocked(fetchPublishedContent).mockResolvedValue({
      status: "unavailable",
      articles: [],
    });
  });

  it("asks for a word when there is no query", async () => {
    await renderSearch(undefined);
    expect(
      screen.getByText(
        "Type a word, such as “radar” or “marine”, to find a page."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("lists the pages that match the query, using the site search ranking", async () => {
    await renderSearch("radar");
    const results = screen.getByRole("heading", {
      name: "Results for “radar”",
    });
    expect(results).toBeInTheDocument();
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("link").length).toBeGreaterThan(0);
  });

  it("says plainly when no page matches, and links the sitemap", async () => {
    await renderSearch("zzqxnothing");
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("No pages match “zzqxnothing”.");
    expect(
      within(status).getByRole("link", { name: "sitemap" })
    ).toHaveAttribute("href", "/sitemap");
  });

  it("reads the first value when the query repeats in the address", async () => {
    await renderSearch(["radar", "marine"]);
    expect(
      screen.getByRole("heading", { name: "Results for “radar”" })
    ).toBeInTheDocument();
  });

  it("keeps the query in the search box so it can be refined", async () => {
    await renderSearch("radar");
    expect(
      screen.getByRole("searchbox", { name: "Search the site" })
    ).toHaveValue("radar");
  });
});
