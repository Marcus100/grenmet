import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ElectionUpdates } from "@/components/home/election-updates";
import { HowToVote } from "@/components/home/how-to-vote";
import { RaceInBrief } from "@/components/home/race-in-brief";
import { SourceLink } from "@/components/source-link";
import resultsJson from "@/data/derived/results";
import { seatOutlook } from "@/data/election-2026";
import { nationalResult } from "@/data/model";
import campaignJson from "@/data/source/campaign.json";
import type { CampaignFile, ResultsFile } from "@/data/types";

const UNCERTAIN_COUNT = /named candidates still need public/;
const GBN_SOURCE = /GBN/;
const OWNER_SOURCE = /site owner/;

const campaign = campaignJson as unknown as CampaignFile;
const results = resultsJson as unknown as ResultsFile;

describe("homepage updates", () => {
  it("orders posts by time, excludes future events, and retains every source", () => {
    render(
      <ElectionUpdates
        coverage={[
          {
            at: "2026-10-02T09:00:00-04:00",
            title: "Morning",
            body: "First post",
            sources: [],
          },
          {
            at: "2026-10-02T15:00:00-04:00",
            title: "Afternoon",
            body: "Second post",
            sources: [
              { label: "First source", url: "https://example.com/one" },
              { label: "Second source", url: "https://example.com/two" },
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
        sources={{ owner: ["Owner confirmation", ""] }}
      />
    );
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Afternoon");
    expect(items[1]).toHaveTextContent("Morning");
    expect(items[2]).toHaveTextContent("Awaiting public confirmation");
    expect(screen.queryByText("Future rally")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Second source" })).toHaveAttribute(
      "href",
      "https://example.com/two"
    );
    expect(
      screen.queryByRole("link", { name: "Owner confirmation" })
    ).not.toBeInTheDocument();
  });

  it("honours the feed limit", () => {
    render(
      <ElectionUpdates
        coverage={[]}
        events={campaign.events}
        limit={2}
        sources={campaign.sources}
      />
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
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

  it("includes the registration cutoff and official source", () => {
    render(<HowToVote />);
    expect(
      screen.getByText("Register before the election writ is issued.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Parliamentary Elections Office, Registration",
      })
    ).toHaveAttribute("href", "https://www.peogrenada.org/Registration");
  });

  it("names sources without public URLs without creating empty links", () => {
    render(<SourceLink id="owner2oct" sources={campaign.sources} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(OWNER_SOURCE)).toBeInTheDocument();
  });
});
