import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteSearch } from "@/components/site-search";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const RADAR = /^Radar/;
const SARGASSUM = /Sargassum season/;

beforeEach(() => {
  // cmdk measures and scrolls its list; jsdom has neither API.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
  );
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        articles: [
          {
            title: "Sargassum season",
            summary: "What to expect",
            href: "/explore/news/sargassum-season",
            section: "Stories",
          },
        ],
      })
    )
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
});

describe("SiteSearch", () => {
  it("opens with the / key and goes to the chosen page", async () => {
    const user = userEvent.setup();
    render(<SiteSearch />);

    await user.keyboard("/");
    const input = await screen.findByRole("combobox", {
      name: "Search the GMS website",
    });
    await user.type(input, "radar");

    await user.click(await screen.findByRole("option", { name: RADAR }));
    expect(push).toHaveBeenCalledWith("/weather/radar");
  });

  it("searches published articles too", async () => {
    const user = userEvent.setup();
    render(<SiteSearch />);
    await user.click(screen.getByRole("button", { name: "Search the site" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/search"));

    await user.type(
      await screen.findByRole("combobox", { name: "Search the GMS website" }),
      "sargassum season"
    );
    expect(
      await screen.findByRole("option", { name: SARGASSUM })
    ).toBeInTheDocument();
  });

  it("still searches pages when the article feed fails", async () => {
    // Replaces only fetch; ResizeObserver from beforeEach stays stubbed.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline")))
    );
    const user = userEvent.setup();
    render(<SiteSearch />);
    await user.click(screen.getByRole("button", { name: "Search the site" }));
    await user.type(
      await screen.findByRole("combobox", { name: "Search the GMS website" }),
      "radar"
    );
    expect(
      await screen.findByRole("option", { name: RADAR })
    ).toBeInTheDocument();
  });
});
