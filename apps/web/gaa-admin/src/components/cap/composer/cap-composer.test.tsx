import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CapComposer } from "./cap-composer";

const sections = {
  alerts: <p>Alerts panel</p>,
  editor: <p>Editor panel</p>,
  feeds: <p>Feeds panel</p>,
  map: <p>Map panel</p>,
};

describe("CapComposer", () => {
  it("links to the new warning desk during the parallel run", () => {
    render(<CapComposer {...sections} deskUrl="https://cap.example/desk" />);
    expect(
      screen.getByRole("link", { name: "Try the new desk" })
    ).toHaveAttribute("href", "https://cap.example/desk");
    expect(screen.getByText("Alerts panel")).toBeInTheDocument();
  });

  it("shows no link when no desk address is configured", () => {
    render(<CapComposer {...sections} />);
    expect(screen.queryByRole("link", { name: "Try the new desk" })).toBeNull();
  });
});
