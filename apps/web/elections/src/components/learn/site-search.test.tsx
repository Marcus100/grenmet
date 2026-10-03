import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteSearch } from "@/components/learn/site-search";

vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());
const SEARCH_LABEL = /Search questions/;
describe("site search interaction", () => {
  it("loads once and offers real links and an empty state without sending queries", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          href: "/learn/counting-and-results",
          title: "Counting results",
          kind: "Guide",
          summary: "Understand turnout",
          keywords: ["turnout"],
        },
      ],
    });
    vi.stubGlobal("fetch", fetcher);
    render(<SiteSearch />);
    await screen.findByText("Enter at least two characters.");
    fireEvent.change(screen.getByLabelText(SEARCH_LABEL), {
      target: { value: "turnout" },
    });
    expect(
      screen.getByRole("link", { name: "Counting results" })
    ).toHaveAttribute("href", "/learn/counting-and-results");
    fireEvent.change(screen.getByLabelText(SEARCH_LABEL), {
      target: { value: "unmatched" },
    });
    expect(
      screen.getByText(
        "No matches. Try a year, surname or a shorter topic such as turnout."
      )
    ).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("lets a failed index load be retried", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetcher);
    render(<SiteSearch />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await screen.findByText("Enter at least two characters.");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
