import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type PredictionSeat,
  PredictionTool,
} from "@/components/make-your-map/prediction-tool";
import { CODES } from "@/data/model";

const OWNER_NOTE = /Owner confirmed; public source pending/;

const seats: PredictionSeat[] = CODES.map(
  (code): PredictionSeat => ({
    code,
    name: `Constituency ${code}`,
    short: code,
    d: "M0,0 L1,0 L1,1 Z",
    dpmStands: code === "D",
    href: `/constituencies/${code}`,
    leanLabel: "Even",
    model: "Solid NNP",
    result2022: "NDC by 8.0 pts",
    sitting: "Member (NDC)",
    history: {
      "2022": { winner: "NDC", margin: 0.08 },
      "2018": { winner: "NNP", margin: 0.2 },
    },
    candidates: code === "D" ? [{ name: "Niecal Joseph", party: "NDC" }] : [],
    notes:
      code === "D" ? { NDC: "Owner confirmed; public source pending" } : {},
  })
);
const props = { seats, land: "", inset: { x0: 0, x1: 1, y0: 0, y1: 1 } };

beforeEach(() => {
  window.history.replaceState(null, "", "/make-your-map");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PredictionTool", () => {
  it("starts from 2022, switches historical presets, and clears to toss-ups", () => {
    render(<PredictionTool {...props} />);
    const rating = screen.getByRole("combobox", {
      name: "Your rating for Constituency A",
    });
    expect(rating).toHaveValue("Likely NDC");
    fireEvent.change(
      screen.getByRole("combobox", { name: "Start from an election" }),
      { target: { value: "2018" } }
    );
    expect(rating).toHaveValue("Solid NNP");
    expect(window.location.hash).toBe(`#map=${"g".repeat(15)}`);
    fireEvent.click(screen.getByRole("button", { name: "All toss-ups" }));
    expect(rating).toHaveValue("Toss-up");
  });

  it("restores shared ratings and updates the link after a change", () => {
    window.history.replaceState(null, "", `#map=${"a".repeat(15)}`);
    render(<PredictionTool {...props} />);
    const rating = screen.getByRole("combobox", {
      name: "Your rating for Constituency A",
    });
    expect(rating).toHaveValue("Solid NDC");
    fireEvent.change(rating, { target: { value: "Lean NNP" } });
    expect(window.location.hash).toBe(`#map=e${"a".repeat(14)}`);
  });

  it.each(["#map=bad", `#map=${"j".repeat(15)}`])(
    "ignores invalid or unavailable-party shared ratings: %s",
    (hash) => {
      window.history.replaceState(null, "", hash);
      render(<PredictionTool {...props} />);
      expect(
        screen.getByRole("combobox", { name: "Your rating for Constituency A" })
      ).toHaveValue("Likely NDC");
    }
  );

  it("copies an encoded map even before any ratings have changed", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<PredictionTool {...props} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Copy link to your map" })
    );
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/make-your-map#map=${"b".repeat(15)}`
      )
    );
    expect(
      await screen.findByRole("button", { name: "Link copied" })
    ).toBeInTheDocument();
  });

  it("offers the address bar when clipboard access fails", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) },
    });
    render(<PredictionTool {...props} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Copy link to your map" })
    );
    expect(
      await screen.findByRole("button", { name: "Copy the address bar" })
    ).toBeInTheDocument();
    expect(window.location.hash).toBe(`#map=${"b".repeat(15)}`);
  });

  it.each([false, true])(
    "scrolls mobile selection into view and respects reduced motion: %s",
    async (reduced) => {
      vi.stubGlobal("innerWidth", 375);
      vi.stubGlobal(
        "matchMedia",
        vi.fn().mockReturnValue({ matches: reduced })
      );
      const scroll = vi.fn();
      Object.defineProperty(Element.prototype, "scrollIntoView", {
        value: scroll,
        configurable: true,
      });
      render(<PredictionTool {...props} />);
      fireEvent.click(
        screen.getByRole("button", { name: "Constituency D: Likely NDC" })
      );
      expect(screen.getByText("Niecal Joseph (NDC)")).toBeInTheDocument();
      expect(screen.getByText(OWNER_NOTE)).toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: "Solid DPM" })
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(scroll).toHaveBeenCalledWith({
          block: "start",
          behavior: reduced ? "auto" : "smooth",
        })
      );
    }
  );
});
