import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cms-preview", () => ({ fetchPreview: vi.fn() }));

import { fetchPreview } from "@/lib/cms-preview";
import PreviewPage, { metadata } from "./page";

const content = {
  id: "42",
  collection: "stories" as const,
  title: "Season preparation",
  slug: "stories/2026/10/season-preparation",
  kicker: null,
  summary: "Get ready for the season",
  category: null,
  body: "Plain text body.",
  imageUrl: null,
  updatedAt: "2026-10-28T00:00:00.000Z",
  relatedLinks: [],
  linkedProduct: null,
};

async function renderWith(token: string | undefined) {
  const element = await PreviewPage({
    searchParams: Promise.resolve(token === undefined ? {} : { token }),
  });
  return render(element);
}

afterEach(() => {
  vi.mocked(fetchPreview).mockReset();
});

describe("preview page", () => {
  it("is never indexed and never cached", () => {
    expect(metadata.robots).toMatchObject({
      index: false,
      follow: false,
      nocache: true,
    });
    expect(metadata.title).toBe("Preview");
  });

  it("shows a draft as it will read, with a banner saying it is unpublished", async () => {
    vi.mocked(fetchPreview).mockResolvedValue({
      status: "ok",
      content,
      draft: true,
    });
    await renderWith("token.sig");
    expect(fetchPreview).toHaveBeenCalledWith("token.sig");
    expect(
      screen.getByRole("heading", { level: 1, name: "Season preparation" })
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "unpublished draft"
    );
  });

  it("says a published item is published, not a draft", async () => {
    vi.mocked(fetchPreview).mockResolvedValue({
      status: "ok",
      content,
      draft: false,
    });
    await renderWith("token.sig");
    expect(screen.getByRole("status").textContent).toContain("published post");
  });

  it("says an expired or forged link is not valid, and shows no content", async () => {
    vi.mocked(fetchPreview).mockResolvedValue({ status: "invalid" });
    await renderWith("forged.token");
    expect(
      screen.getByRole("heading", { name: "This preview link is not valid" })
    ).toBeTruthy();
    expect(screen.queryByText("Season preparation")).toBeNull();
  });

  it("asks for a new link and never fetches when the token is missing", async () => {
    vi.mocked(fetchPreview).mockResolvedValue({ status: "invalid" });
    await renderWith(undefined);
    expect(fetchPreview).toHaveBeenCalledWith("");
    expect(
      screen.getByRole("heading", { name: "This preview link is not valid" })
    ).toBeTruthy();
  });

  it("says the preview is unavailable when the CMS cannot be reached", async () => {
    vi.mocked(fetchPreview).mockResolvedValue({ status: "unavailable" });
    await renderWith("token.sig");
    expect(screen.getByRole("status").textContent).toContain(
      "cannot be loaded"
    );
  });

  it("says which kinds of post can be previewed when the item is another kind", async () => {
    vi.mocked(fetchPreview).mockResolvedValue({ status: "unsupported" });
    await renderWith("token.sig");
    expect(screen.getByRole("status").textContent).toContain(
      "desk updates, stories and report write-ups"
    );
  });
});
