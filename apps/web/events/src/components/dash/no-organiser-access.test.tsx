import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getManagedAccess = vi.fn();

vi.mock("@/data/events-api", () => ({
  getManagedAccess: () => getManagedAccess(),
}));
vi.mock("./dash-shell", () => ({
  DashShell: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("./organiser-request-form", () => ({
  OrganiserRequestForm: () => <form aria-label="Request organiser" />,
}));

import { NoOrganiserAccess } from "./no-organiser-access";

describe("NoOrganiserAccess", () => {
  beforeEach(() => getManagedAccess.mockReset());

  it("offers the request form to members with no organiser", async () => {
    getManagedAccess.mockResolvedValue({ kind: "no-organiser" });
    render(await NoOrganiserAccess());
    expect(
      screen.getByRole("heading", { name: "Become an organiser" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("form", { name: "Request organiser" })
    ).toBeInTheDocument();
  });

  it("says Events is switched off, with the next step and no request form", async () => {
    getManagedAccess.mockResolvedValue({ kind: "events-disabled" });
    render(await NoOrganiserAccess());
    expect(
      screen.getByRole("heading", {
        name: "Events is switched off for this organisation",
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Ask Barrels support to switch Events on"
    );
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to events" })).toBeVisible();
  });
});
