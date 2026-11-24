import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Election2026Page from "@/app/2026/page";
import ConstituencyPage from "@/app/constituencies/[slug]/page";
import FrontPage from "@/app/page";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));

const WINS_14 = /National Democratic Congress wins 14 of 15 seats/u;
const PEO_LINK = /Parliamentary Elections Office results/u;
const MARGIN_IN_VOTES = /by [\d,]+ votes?/u;

describe("declared front page", () => {
  it("leads with the provisional result, not the campaign", () => {
    const { container } = render(<FrontPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
      "Provisional results"
    );
    expect(screen.getByText(WINS_14)).toBeInTheDocument();
    expect(container.textContent).toContain("63.4%");
    expect(container.textContent).toContain(
      "Provisional results from the Parliamentary Elections Office, 23 November 2026"
    );
    expect(
      screen
        .getAllByRole("link", {
          name: PEO_LINK,
        })
        .some((a) => a.getAttribute("href") === "https://elections.gd/2026/")
    ).toBe(true);
    expect(container.textContent).not.toContain("Grenada votes");
    expect(container.textContent).not.toContain("Follow the campaign");
  });
});

describe("2026 page", () => {
  it("lists the winner of each of the 15 constituencies with margins in votes", () => {
    const { container } = render(<Election2026Page />);
    const table = container.querySelector("#results-title")?.closest("section");
    expect(table?.querySelectorAll("tbody tr")).toHaveLength(15);
    expect(table?.textContent).toMatch(MARGIN_IN_VOTES);
  });
});

describe("constituency page", () => {
  it("shows the 2026 result first, above the earlier selections", async () => {
    const page = await ConstituencyPage({
      params: Promise.resolve({ slug: "st-george-north-west" }),
    });
    const { container } = render(page);
    const sections = [...container.querySelectorAll("section")].map((s) =>
      s.getAttribute("aria-labelledby")
    );
    expect(sections.indexOf("result-2026-title")).toBeGreaterThan(-1);
    expect(sections.indexOf("result-2026-title")).toBeLessThan(
      sections.indexOf("standing-title")
    );
    const result = container
      .querySelector("#result-2026-title")
      ?.closest("section");
    expect(result?.textContent).toContain("won by");
    expect(result?.textContent).toContain("New National Party");
    expect(result?.textContent).toContain("provisional");
    expect(result?.textContent).toMatch(MARGIN_IN_VOTES);
  });
});
