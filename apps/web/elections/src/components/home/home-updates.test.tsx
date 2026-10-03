import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FlagStripe } from "@/components/flag-stripe";
import { ElectionUpdates } from "@/components/home/election-updates";
import { HowToVote } from "@/components/home/how-to-vote";
import { RaceInBrief } from "@/components/home/race-in-brief";
import { SourceLink } from "@/components/source-link";
import resultsJson from "@/data/derived/results";
import { seatOutlook } from "@/data/election-2026";
import { nationalResult } from "@/data/model";
import campaignJson from "@/data/source/campaign.json";
import type { CampaignFile, ResultsFile } from "@/data/types";

const CAMPAIGN_SOURCES = /Campaign sources/;
const FIRST_SOURCE = /First source/;

const UNCERTAIN_COUNT = /named candidates still need public/;
const GBN_SOURCE = /GBN/;
const OWNER_SOURCE = /site owner/;
const OWNER_CONFIRMATION = /Owner confirmation/;

const campaign = campaignJson as unknown as CampaignFile;
const results = resultsJson as unknown as ResultsFile;

describe("homepage updates", () => {
  it("orders posts by time, excludes future events, and links posts to their article", () => {
    render(
      <ElectionUpdates
        coverage={[
          {
            at: "2026-10-02T09:00:00-04:00",
            slug: "morning",
            title: "Morning",
            dek: "First post",
            body: ["First post in full"],
            sources: [],
          },
          {
            at: "2026-10-02T15:00:00-04:00",
            slug: "afternoon",
            title: "Afternoon",
            dek: "Second post",
            body: ["Second post in full"],
            sources: [
              { label: "First source", url: "https://example.com/one" },
            ],
          },
        ]}
        events={[
          {
            date: "2026-10-01",
            text: "Reported candidate",
            src: "owner",
            flag: "unverified",
            note: "Awaiting public confirmation",
          },
          {
            date: "2026-10-04",
            text: "Future rally",
            src: "owner",
            flag: null,
            future: true,
          },
        ]}
        limit={3}
      />
    );
    const items = screen.getAllByRole("article");
    expect(items).toHaveLength(3);
    expect(
      within(items[0]).getByRole("heading", { name: "Afternoon" })
    ).toHaveClass("font-serif");
    expect(items[0]).toHaveTextContent("Second post");
    expect(items[1]).toHaveTextContent("Morning");
    expect(items[1]).not.toHaveTextContent("First post");
    expect(items[2]).toHaveTextContent("Awaiting public confirmation");
    expect(screen.getByRole("link", { name: "Afternoon" })).toHaveAttribute(
      "href",
      "/updates/afternoon"
    );
    expect(screen.queryByText("Future rally")).not.toBeInTheDocument();
    // Sources live on the article and the campaign timeline, not the feed.
    expect(
      screen.queryByRole("link", { name: FIRST_SOURCE })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(CAMPAIGN_SOURCES)).not.toBeInTheDocument();
    expect(screen.queryByText(OWNER_CONFIRMATION)).not.toBeInTheDocument();
  });

  it("lets a post stand for the same-day event whose source it cites", () => {
    render(
      <ElectionUpdates
        coverage={[
          {
            at: "2026-10-02T19:00:00-04:00",
            slug: "dissolved",
            title: "Parliament dissolved",
            dek: "The summary",
            body: ["The full story"],
            sources: [{ id: "owner" }],
          },
        ]}
        events={[
          {
            date: "2026-10-02",
            text: "One-line event",
            src: "owner",
            flag: null,
          },
          {
            date: "2026-10-01",
            text: "Earlier event",
            src: "other",
            flag: null,
          },
        ]}
      />
    );
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.queryByText("One-line event")).not.toBeInTheDocument();
    expect(screen.getByText("Earlier event")).toBeInTheDocument();
  });

  it("shows the lead post's photo unless the page already shows it", () => {
    const post = {
      at: "2026-10-03T14:30:00-04:00",
      slug: "writs",
      title: "Writs issued",
      dek: "Summary",
      body: ["Full story"],
      photo: "parliament" as const,
      sources: [],
    };
    const { unmount } = render(
      <ElectionUpdates coverage={[post]} events={[]} />
    );
    expect(screen.getByRole("img")).toBeInTheDocument();
    unmount();
    render(
      <ElectionUpdates coverage={[post]} events={[]} hidePhoto="parliament" />
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("leads with the featured post, then the rest newest first", () => {
    const post = (at: string, title: string, featured?: boolean) => ({
      at,
      slug: title.toLowerCase(),
      title,
      dek: `${title} summary`,
      body: [title],
      sources: [],
      ...(featured ? { featured } : {}),
    });
    render(
      <ElectionUpdates
        coverage={[
          post("2026-10-03T12:00:00-04:00", "Featured", true),
          post("2026-10-03T19:00:00-04:00", "Newest"),
          post("2026-10-02T19:00:00-04:00", "Oldest"),
        ]}
        events={[]}
      />
    );
    const items = screen.getAllByRole("article");
    expect(
      items.map((item) => within(item).getByRole("heading").textContent)
    ).toEqual(["Featured", "Newest", "Oldest"]);
  });

  it("honours the feed limit", () => {
    render(
      <ElectionUpdates coverage={[]} events={campaign.events} limit={2} />
    );
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("renders nothing when there are no updates", () => {
    const { container } = render(<ElectionUpdates coverage={[]} events={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows sourced party facts and flags provisional candidate totals", () => {
    render(
      <RaceInBrief
        campaign={campaign}
        result2022={nationalResult(results, "2022")}
        seats={seatOutlook(results, campaign)}
      />
    );
    const ndc = screen
      .getByRole("heading", { name: "National Democratic Congress" })
      .closest("li");
    expect(ndc).not.toBeNull();
    if (!ndc) return;
    expect(within(ndc).getByText("15")).toBeInTheDocument();
    expect(within(ndc).getByText(UNCERTAIN_COUNT)).toBeInTheDocument();
    expect(
      screen.queryByText("Seats now: 2022 results", { exact: false })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: GBN_SOURCE })
    ).not.toBeInTheDocument();
  });

  it("routes current voting arrangements to the authority rather than stale instructions", () => {
    render(<HowToVote />);
    expect(
      screen.getByRole("link", { name: "Check with the PEO" })
    ).toHaveAttribute("href", "https://www.peogrenada.org/");
    expect(
      screen.getByRole("link", { name: "Understand registration and voting" })
    ).toHaveAttribute("href", "/learn/registering-and-voting");
  });

  it("names sources without public URLs without creating empty links", () => {
    render(<SourceLink id="owner2oct" sources={campaign.sources} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(OWNER_SOURCE)).toBeInTheDocument();
  });
});

describe("flag stripe", () => {
  it("shows all three flag colours together and hides them from assistive tech", () => {
    render(<FlagStripe />);
    const stripe = screen.getByTestId("flag-stripe");
    expect(stripe).toHaveAttribute("aria-hidden", "true");
    expect(
      Array.from(stripe.children, (c) => c.className.split(" ").at(-1))
    ).toEqual(["bg-el-flag-red", "bg-el-flag-gold", "bg-el-flag-green"]);
  });
});
