import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HouseStrip } from "@/components/home/house-strip";
import resultsJson from "@/data/derived/results";
import { seatOutlook } from "@/data/election-2026";
import campaignJson from "@/data/source/campaign.json";
import type { CampaignFile, ResultsFile } from "@/data/types";

const results = resultsJson as unknown as ResultsFile;
const campaign = campaignJson as unknown as CampaignFile;

describe("HouseStrip", () => {
  it("names every letter and links each square to its constituency", () => {
    render(<HouseStrip seats={seatOutlook(results, campaign)} />);
    expect(
      screen.getByText("Which constituency is each letter?")
    ).toBeInTheDocument();
    // Names come from the reference data: J and G are easy to confuse.
    expect(
      screen.getByRole("link", { name: "St. George North West" })
    ).toHaveAttribute("href", "/constituencies/st-george-north-west");
    expect(
      screen.getByRole("link", { name: "Town of St. George" })
    ).toHaveAttribute("href", "/constituencies/town-of-st-george");
    expect(screen.getAllByRole("img")).toHaveLength(15);
  });
});
