import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GmsNews } from "@/components/gms-news";
import { News } from "@/components/news";
import { fetchPublishedContent } from "@/lib/cms";

const MARINE_TITLE = /Marine Bulletin/;

vi.mock("@/lib/cms", () => ({ fetchPublishedContent: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

for (const [name, component] of [
  ["Weather news", News],
  ["Latest from us", GmsNews],
] as const) {
  it(`${name} renders published CMS articles`, async () => {
    vi.mocked(fetchPublishedContent).mockResolvedValue({
      status: "ok",
      articles: [
        {
          id: "1",
          title: "Marine Bulletin",
          slug: "marine-test",
          kind: "article",
          summary: "Marine",
          body: "Bulletin",
          imageUrl: null,
          updatedAt: "2026-09-10T22:24:47Z",
        },
      ],
    });
    render(await component());
    expect(fetchPublishedContent).toHaveBeenCalledWith(
      "article",
      name === "Latest from us" ? "latest" : "news"
    );
    expect(
      screen.getAllByRole("link", { name: MARINE_TITLE })[0]
    ).toHaveAttribute("href", "/news/marine-test");
  });
  it(`${name} distinguishes unavailable content from an empty feed`, async () => {
    vi.mocked(fetchPublishedContent).mockResolvedValue({
      status: "unavailable",
      articles: [],
    });
    render(await component());
    expect(screen.getByRole("status")).toHaveTextContent(
      "News cannot be retrieved"
    );
    expect(
      screen.queryByText("No published articles are available.")
    ).not.toBeInTheDocument();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    cleanup();
    vi.mocked(fetchPublishedContent).mockResolvedValue({
      status: "ok",
      articles: [],
    });
    render(await component());
    expect(
      screen.getByText("No published articles are available.")
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });
}

it("lets Latest visitors copy the article link when native sharing is unavailable", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  vi.mocked(fetchPublishedContent).mockResolvedValue({
    status: "ok",
    articles: [
      {
        id: "1",
        title: "Marine Bulletin",
        slug: "marine-test",
        kind: "article",
        summary: "Marine",
        body: "Bulletin",
        imageUrl: null,
        updatedAt: "2026-09-10T22:24:47Z",
      },
    ],
  });
  render(await GmsNews());
  fireEvent.click(screen.getAllByRole("button", { name: "Share update" })[0]);
  await waitFor(() =>
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("/news/marine-test")
    )
  );
  expect(screen.getByRole("status")).toHaveTextContent("copied");
  vi.unstubAllGlobals();
});
