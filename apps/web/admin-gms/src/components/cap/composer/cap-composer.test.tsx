import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CapComposer } from "./cap-composer";

// The four surfaces are server-rendered on the page; here we pass stub nodes to
// verify the tab shell switches between them.
function renderComposer() {
  render(
    <CapComposer
      alerts={<div>Alerts panel</div>}
      editor={<div>Editor panel</div>}
      feeds={<div>Feeds panel</div>}
      map={<div>Map panel</div>}
    />
  );
}

describe("CapComposer", () => {
  it("shows the four CAP tabs and the alerts surface by default", () => {
    renderComposer();

    expect(
      screen.getByRole("heading", { name: "CAP Composer" })
    ).toBeInTheDocument();
    for (const tab of ["Alerts", "Map", "Feeds", "Editor"]) {
      expect(screen.getByRole("tab", { name: tab })).toBeInTheDocument();
    }
    expect(screen.getByText("Alerts panel")).toBeInTheDocument();
  });

  it("switches to the editor surface when its tab is selected", () => {
    renderComposer();

    fireEvent.click(screen.getByRole("tab", { name: "Editor" }));
    expect(screen.getByText("Editor panel")).toBeInTheDocument();
  });
});
