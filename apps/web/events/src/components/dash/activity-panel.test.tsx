import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ActivityPanel,
  describeAction,
  describeFields,
} from "./activity-panel";

describe("ActivityPanel", () => {
  it("says so when nothing has been recorded", () => {
    render(<ActivityPanel entries={[]} />);
    expect(screen.getByText("No changes recorded.")).toBeInTheDocument();
  });

  it("lists actions with who, when and which fields changed", () => {
    render(
      <ActivityPanel
        entries={[
          {
            id: "1",
            action: "listing.updated",
            actorName: "Harbour Host",
            changed: ["title", "starts_at"],
            createdAt: "2026-10-20T20:00:00Z",
          },
          {
            id: "2",
            action: "listing.published",
            actorName: null,
            changed: ["status"],
            createdAt: "2026-10-19T20:00:00Z",
          },
        ]}
      />
    );
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Edited the event by Harbour Host");
    expect(items[0]).toHaveTextContent("title, start");
    expect(items[1]).toHaveTextContent("Published the event by an organiser");
    expect(items[1]).not.toHaveTextContent("status");
  });

  it("falls back for unknown actions", () => {
    expect(describeAction("listing.mystery")).toBe("Changed the event");
    expect(describeFields(["ends_at", "venue"])).toBe("end, venue");
  });
});
