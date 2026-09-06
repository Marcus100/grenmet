import type { HrDashboardPublic } from "@barrelsgd/api-client";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HrDashboard } from "./hr-dashboard";

// The dashboard exposes both views behind a Staff / Admin toggle, and the HR
// forms live in the "New request" menu rather than on the board itself. It reads
// the signed-in user only for the personalised greeting, so the hook is mocked.
const mockUser = {
  email: "aiyana@gov.gd",
  full_name: "Aiyana Charles" as string | null,
  is_superuser: false,
};

vi.mock("@barrelsgd/auth", () => ({
  useSessionUser: () => mockUser,
}));

const data: HrDashboardPublic = {
  date: "2026-09-06",
  scope: "GMS",
  can_approve: true,
  vacation_balance: null,
  next_shift: null,
  open_requests: 0,
  active_staff: 2,
  departments: 1,
  shift_types: 2,
  requests: [],
  approvals: [],
  on_duty: [
    {
      id: "schedule-1",
      name: "Scheduled Colleague",
      department: "GMS",
      shift: "Morning",
    },
  ],
  away: [
    {
      id: "schedule-2",
      name: "Away Colleague",
      department: "GMS",
      shift: "Day off",
    },
  ],
};

function switchTo(view: "Staff" | "Admin") {
  fireEvent.click(screen.getByRole("button", { name: view }));
}

describe("HrDashboard", () => {
  it("shows who's on duty by default and who's away when toggled", () => {
    render(<HrDashboard data={data} />);

    // On duty is the default list.
    expect(screen.getByText("Scheduled Colleague")).toBeInTheDocument();
    expect(screen.queryByText("Away Colleague")).not.toBeInTheDocument();

    // Flip the in-card toggle to the away list.
    fireEvent.click(screen.getByRole("button", { name: "Away" }));
    expect(screen.getByText("Away Colleague")).toBeInTheDocument();
    expect(screen.queryByText("Scheduled Colleague")).not.toBeInTheDocument();
  });

  it("keeps forms off the board — they live in the New request menu", () => {
    render(<HrDashboard data={data} />);

    // The forms grid is gone from the dashboard body.
    expect(screen.queryByText("Forms & requests")).not.toBeInTheDocument();
    expect(screen.queryByText("Leave application")).not.toBeInTheDocument();

    // ...and is reachable from the launcher instead.
    fireEvent.click(screen.getByRole("button", { name: "New request" }));
    expect(screen.getByText("Leave application")).toBeInTheDocument();
    expect(screen.getByText("Timesheet")).toBeInTheDocument();
  });

  it("keeps admin-only zones hidden while the staff view is active", () => {
    render(<HrDashboard data={data} />);

    expect(screen.queryByText("Manage")).not.toBeInTheDocument();
    expect(screen.queryByText("Approvals inbox")).not.toBeInTheDocument();
  });

  it("reveals management and approvals when toggled to the admin view", () => {
    render(<HrDashboard data={data} />);
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
    render(<HrDashboard data={data} />);
    switchTo("Admin");
    switchTo("Staff");

    expect(screen.getByText("My requests")).toBeInTheDocument();
    expect(screen.queryByText("Approvals inbox")).not.toBeInTheDocument();
  });

  it("shows missing balances and real empty states without sample records", () => {
    render(<HrDashboard data={{ ...data, on_duty: [], away: [] }} />);
    expect(screen.getByText("Not recorded")).toBeInTheDocument();
    expect(screen.getByText("You have no requests yet.")).toBeInTheDocument();
    expect(
      screen.getByText("No published work shifts for today.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Kwame Noel")).not.toBeInTheDocument();
  });

  it("does not expose management controls to staff without approval permission", () => {
    render(<HrDashboard data={{ ...data, can_approve: false }} />);
    expect(
      screen.queryByRole("button", { name: "Admin" })
    ).not.toBeInTheDocument();
  });
});
