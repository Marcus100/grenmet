import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { COVERAGE } from "@/data/coverage";
import { sourceKind } from "@/data/evidence";
import campaignJson from "@/data/source/campaign.json";
import type { CampaignFile } from "@/data/types";

const DOWNLOAD = /Download:/;
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
});
