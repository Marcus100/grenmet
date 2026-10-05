import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { COVERAGE } from "@/data/coverage";
import { sourceKind } from "@/data/evidence";
import campaignJson from "@/data/source/campaign.json";
import type { CampaignFile } from "@/data/types";

const DOWNLOAD = /Download:/;
const POLICE_POLL = /Special polling day for police officers/;
const WATCH_LINK = /Watch the address on YouTube/;
const GAZETTE_SOURCE = /Official record: Government Gazette/;

vi.mock("server-only", () => ({}));

const campaign = campaignJson as unknown as CampaignFile;

describe("coverage posts", () => {
  it("have unique slugs, a summary, a body and known sources", () => {
    const slugs = COVERAGE.map((post) => post.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const post of COVERAGE) {
      expect(post.dek.length).toBeGreaterThan(0);
      expect(post.body.length).toBeGreaterThan(0);
      expect(post.sources.length).toBeGreaterThan(0);
      for (const source of post.sources)
        if ("id" in source) expect(campaign.sources[source.id]).toBeDefined();
    }
  });

  it("treats our hosted copy of the Gazette as an official record", () => {
    expect(sourceKind(campaign.sources.gazette47)).toBe("official");
  });

  it("renders the article with its sources and the PDF download", async () => {
    const { default: UpdatePage } = await import("./page");
    render(
      await UpdatePage({
        params: Promise.resolve({
          slug: "writs-issued-polling-day-5-november",
        }),
      })
    );
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Grenada votes on 5 November; nomination day is 15 October",
      })
    ).toBeInTheDocument();
    const download = screen.getByRole("link", { name: DOWNLOAD });
    expect(download).toHaveAttribute(
      "href",
      "/documents/official/gazette-2026-no-47-notice-of-writs.pdf"
    );
    expect(download).toHaveAttribute("download");
    expect(
      screen.getByRole("link", { name: GAZETTE_SOURCE })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(20);
    // The first import of the page module is slow under a full parallel run.
  }, 20_000);

  it("reproduces the Prime Minister's address with a link to the video", async () => {
    const { default: UpdatePage } = await import("./page");
    render(
      await UpdatePage({
        params: Promise.resolve({ slug: "mitchell-announces-5-november" }),
      })
    );
    expect(
      screen.getByRole("heading", { name: "Transcript of the address" })
    ).toBeTruthy();
    expect(screen.getByText(POLICE_POLL)).toBeTruthy();
    expect(screen.getByRole("link", { name: WATCH_LINK })).toHaveProperty(
      "href",
      "https://www.youtube.com/watch?v=MhEecDI2qHk"
    );
  });

  it("highlights the important dates and sets the address out as a transcript", async () => {
    const { default: UpdatePage } = await import("./page");
    const { container } = render(
      await UpdatePage({
        params: Promise.resolve({ slug: "mitchell-announces-5-november" }),
      })
    );
    expect(screen.getByRole("heading", { name: "Dates to know" })).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Registration is closed" })
    ).toBeTruthy();
    expect(screen.getByText("Prime Minister Dickon Mitchell")).toBeTruthy();
    const marked = [...container.querySelectorAll("mark")].map(
      (m) => m.textContent
    );
    expect(marked).toContain("November 5th, 2026");
    expect(marked).toContain("2nd November, 2026");
  });

  it("puts the byline above the date", async () => {
    const { default: UpdatePage } = await import("./page");
    render(
      await UpdatePage({
        params: Promise.resolve({ slug: "mitchell-announces-5-november" }),
      })
    );
    const byline = screen.getByText("By Eugine Whint");
    expect(byline.nextElementSibling?.querySelector("time")).not.toBeNull();
  });
});
