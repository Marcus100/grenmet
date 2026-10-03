import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ElectionPage from "@/app/2026/page";
import CandidatesPage from "@/app/candidates/page";
import ConstituencyPage from "@/app/constituencies/[slug]/page";

vi.mock("server-only", () => ({}));
const CONFIRMATION = /Confirmed to us on 2 October/;
const OWNER_SOURCE = /Confirmed to Elections Grenada by the site owner/;
const REMOVED_INTRO = /Names reported so far, with uncertain entries marked/;

describe("candidate attribution across pages", () => {
  it("shows owner confirmations beside named candidates in the directory", () => {
    render(<CandidatesPage />);
    const name = screen.getByText("Niecal Joseph");
    expect(name.closest("li")).toHaveTextContent(CONFIRMATION);
    expect(screen.getByText(OWNER_SOURCE)).toBeInTheDocument();
  });

  it("uses the specific NDC source on the constituency page", async () => {
    render(
      await ConstituencyPage({
        params: Promise.resolve({ slug: "st-andrew-north-east" }),
      })
    );
    expect(screen.getByText("Niecal Joseph").closest("li")).toHaveTextContent(
      CONFIRMATION
    );
    expect(screen.getByText(OWNER_SOURCE)).toBeInTheDocument();
  });

  it("keeps candidate notes on /2026 without the removed source introduction", () => {
    render(<ElectionPage />);
    expect(screen.queryByText(REMOVED_INTRO)).not.toBeInTheDocument();
    const standing = screen.getByRole("region", { name: "Who is standing" });
    expect(standing).not.toBeNull();
    if (!standing) return;
    expect(
      within(standing).getByText("Niecal Joseph").closest("li")
    ).toHaveTextContent(CONFIRMATION);
    expect(within(standing).queryByText(OWNER_SOURCE)).not.toBeInTheDocument();
  });
});
