import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ImportedWatch } from "@/components/pages/imported-watch";

const UNCONFIRMED = /could not be fully confirmed/iu;
const snapshot = (items: unknown[], complete = true) =>
  JSON.stringify({ complete, items });

describe("ImportedWatch", () => {
  it("lists the alerts in force when the Marine Forecast was issued", () => {
    render(
      <ImportedWatch
        advisories={snapshot([
          {
            colour: "yellow",
            impacts: "Rough seas near the coast.",
            title: "Small craft advisory",
          },
        ])}
      />
    );
    expect(screen.getByText("What to watch")).toBeTruthy();
    expect(
      screen.getByText("Small craft advisory: Rough seas near the coast.")
    ).toBeTruthy();
  });

  it("lists a repeated line once", () => {
    const item = {
      colour: "yellow",
      impacts: "Rough seas.",
      title: "Advisory",
    };
    render(<ImportedWatch advisories={snapshot([item, item])} />);
    expect(screen.getAllByText("Advisory: Rough seas.")).toHaveLength(1);
  });

  it("says a source was unavailable instead of implying nothing is in force", () => {
    render(<ImportedWatch advisories={snapshot([], false)} />);
    expect(screen.getByText(UNCONFIRMED)).toBeTruthy();
  });

  it("renders nothing for an issue with no snapshot or nothing in force", () => {
    const none = render(<ImportedWatch />);
    expect(none.container.innerHTML).toBe("");
    const empty = render(<ImportedWatch advisories={snapshot([])} />);
    expect(empty.container.innerHTML).toBe("");
  });
});
