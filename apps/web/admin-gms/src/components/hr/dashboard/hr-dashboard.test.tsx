import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HrDashboard } from "./hr-dashboard";

// The dashboard exposes both views behind a Staff / Admin toggle, and the HR
// forms live in the "New request" menu rather than on the board itself. It reads
// the signed-in user only for the personalised greeting, so the hook is mocked.
const mockUser = {
  email: "aiyana@gov.gd",
  full_name: "Aiyana Charles" as string | null,
  is_superuser: false,
};

vi.mock("@grenmet/auth", () => ({
  useSessionUser: () => mockUser,
}));

function switchTo(view: "Staff" | "Admin") {
  fireEvent.click(screen.getByRole("button", { name: view }));
}

describe("HrDashboard", () => {
  beforeEach(() => {
    mockUser.full_name = "Aiyana Charles";
  });

  it("defaults to the staff view and greets the member by first name", () => {
    render(<HrDashboard />);

    expect(
      screen.getByRole("heading", { name: "Welcome back, Aiyana" })
    ).toBeInTheDocument();
    expect(screen.getByText("Attendance today")).toBeInTheDocument();
    expect(screen.getByText("Recent activity")).toBeInTheDocument();
    expect(screen.getByText("My requests")).toBeInTheDocument();
    expect(screen.getByText("Organisation")).toBeInTheDocument();
  });

  it("shows who's on duty by default and who's away when toggled", () => {
    render(<HrDashboard />);

    // On duty is the default list.
    expect(screen.getByText("Kwame Noel")).toBeInTheDocument();
    expect(screen.queryByText("Dwight Phillip")).not.toBeInTheDocument();

    // Flip the in-card toggle to the away list.
    fireEvent.click(screen.getByRole("button", { name: "Away" }));
    expect(screen.getByText("Dwight Phillip")).toBeInTheDocument();
    expect(screen.queryByText("Kwame Noel")).not.toBeInTheDocument();
  });

  it("keeps forms off the board — they live in the New request menu", () => {
    render(<HrDashboard />);

    // The forms grid is gone from the dashboard body.
    expect(screen.queryByText("Forms & requests")).not.toBeInTheDocument();
    expect(screen.queryByText("Leave application")).not.toBeInTheDocument();

    // ...and is reachable from the launcher instead.
    fireEvent.click(screen.getByRole("button", { name: "New request" }));
    expect(screen.getByText("Leave application")).toBeInTheDocument();
    expect(screen.getByText("Timesheet")).toBeInTheDocument();
  });

  it("keeps admin-only zones hidden while the staff view is active", () => {
    render(<HrDashboard />);

    expect(screen.queryByText("Manage")).not.toBeInTheDocument();
    expect(screen.queryByText("Approvals inbox")).not.toBeInTheDocument();
  });

  it("reveals management and approvals when toggled to the admin view", () => {
    render(<HrDashboard />);
    switchTo("Admin");

    expect(
      screen.getByRole("heading", { name: "HR overview" })
    ).toBeInTheDocument();
    expect(screen.getByText("Manage")).toBeInTheDocument();
    expect(screen.getByText("Approvals inbox")).toBeInTheDocument();
    // The personal "My requests" rail is swapped out for approvals.
    expect(screen.queryByText("My requests")).not.toBeInTheDocument();
  });

  it("returns to the staff view when toggled back", () => {
    render(<HrDashboard />);
    switchTo("Admin");
    switchTo("Staff");

    expect(screen.getByText("My requests")).toBeInTheDocument();
    expect(screen.queryByText("Approvals inbox")).not.toBeInTheDocument();
  });

  it("falls back gracefully when the user has no full name", () => {
    mockUser.full_name = null;
    render(<HrDashboard />);

    expect(
      screen.getByRole("heading", { name: "Welcome back" })
    ).toBeInTheDocument();
  });
});
