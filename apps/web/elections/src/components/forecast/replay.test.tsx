import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Replay } from "@/components/forecast/replay";
import type { ReplayInputs } from "@/data/outlook";

vi.mock("@/data/outlook", () => ({
  countingOrder: (divisions: string[]) => divisions,
  replayEstimate: () => ({
    ndcMajority: 0.5,
    swing: 0,
    swingSd: 0.1,
    median: 8,
    lo: 4,
    hi: 12,
    seatChance: { N: 0.5 },
  }),
}));

const inputs: ReplayInputs = {
  sC: 0.1,
  sE: 0.1,
  sN: 0.1,
  divisions: [
    {
      code: "N",
      division: "N01",
      place: "First",
      ndc: 9,
      nnp: 1,
      base: 0.5,
      weight: 10,
    },
    {
      code: "N",
      division: "N02",
      place: "Second",
      ndc: 100,
      nnp: 900,
      base: 0.5,
      weight: 1000,
    },
    {
      code: "A",
      division: "A01",
      place: "Missing boundary",
      ndc: 7,
      nnp: 7,
      base: 0.5,
      weight: 14,
    },
  ],
};
const N01_LABEL = /N01 · First: partial count/u;
const N02_LABEL = /N02 · Second: partial count/u;
const MISSING_LABEL = /Boundary unavailable for A01/u;
const MISSING_RESULT = /A01 · Missing boundary \(Carriacou\): NDC 7, NNP 7/u;

function setup(
  divisionPaths: Record<string, string> = {
    N01: "M0,0L1,0L1,1Z",
    N02: "M1,0L2,0L2,1Z",
  }
) {
  render(
    <Replay
      constituencyPaths={{ N: "M0,0L2,0L2,1Z", A: "M3,0L4,0L4,1Z" }}
      divisionPaths={divisionPaths}
      inputs={inputs}
      inset={{ x0: 3, x1: 4, y0: 0, y1: 1 }}
      land="M0,0L4,0L4,1Z"
      names={{ N: "St. Mark", A: "Carriacou" }}
    />
  );
}

describe("Replay map levels", () => {
  it("defaults to neutral constituencies and sums counted votes rather than averaging division shares", () => {
    setup();
    expect(
      screen.getByRole("button", { name: "Constituencies" })
    ).toHaveAttribute("aria-pressed", "true");
    const map = screen.getByRole("img", {
      name: "Partial count by constituency",
    });
    const path = map.querySelector('path[aria-label^="St. Mark:"]');
    expect(path).toHaveAttribute("fill", "var(--el-land)");
    fireEvent.click(screen.getByRole("button", { name: "Next division" }));
    expect(path).toHaveAttribute("fill", "var(--el-ndc)");
    expect(path).toHaveAccessibleName(
      "St. Mark: partial count · 1 of 2 divisions reported · NDC 9, NNP 1"
    );
    fireEvent.click(screen.getByRole("button", { name: "Next division" }));
    expect(path).toHaveAttribute("fill", "var(--el-nnp)");
    expect(path).toHaveAccessibleName(
      "St. Mark: partial count · 2 of 2 divisions reported · NDC 109, NNP 901"
    );
    expect(
      screen.getByText("Partial count: 2 of 3 divisions reported.", {
        exact: false,
      })
    ).toBeInTheDocument();
  });

  it("retains each division's own lead and keeps missing-boundary records readable", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Skip to end" }));
    fireEvent.click(screen.getByRole("button", { name: "Polling divisions" }));
    const map = screen.getByRole("img", {
      name: "Partial count by polling division",
    });
    expect(within(map).getByLabelText(N01_LABEL)).toHaveAttribute(
      "fill",
      "var(--el-ndc)"
    );
    expect(within(map).getByLabelText(N02_LABEL)).toHaveAttribute(
      "fill",
      "var(--el-nnp)"
    );
    expect(map.querySelectorAll("path[aria-label]")).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent(MISSING_LABEL);
    fireEvent.click(screen.getByText("Reported division vote totals"));
    expect(screen.getByText(MISSING_RESULT)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Constituencies" }));
    expect(
      screen
        .getByRole("img", { name: "Partial count by constituency" })
        .querySelector('path[aria-label^="Carriacou:"]')
    ).toHaveAttribute("fill", "var(--el-land)");
  });

  it("falls back explicitly when division geometry is unavailable", () => {
    setup({});
    expect(
      screen.getByRole("button", { name: "Polling divisions" })
    ).toBeDisabled();
    expect(
      screen.getByText(
        "Located polling-division geometry is unavailable for this count. Showing constituencies."
      )
    ).toBeInTheDocument();
  });
});
