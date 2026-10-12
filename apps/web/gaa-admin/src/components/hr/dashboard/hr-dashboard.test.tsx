import type { HrDashboardPublic } from "@barrelsgd/api-client";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HrDashboard } from "./hr-dashboard";

// Home is one role-aware page: no Staff / Admin toggle, and the approvals
// callout appears only for people who can approve. The signed-in user feeds
// the greeting, so the hook is mocked.
const OTHER_FORMS = /Other forms/;
const OPEN_APPROVALS = /Open approvals/;
const NEEDS_APPROVAL = /needs your approval/;

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
  vacation_balance: "18.0",
  next_shift: "Thu 9 Oct · Day",
  open_requests: 2,
  active_staff: 2,
  departments: 1,
  shift_types: 2,
  requests: [
    {
      id: "req-1",
      title: "Vacation leave · 20–24 Oct",
      status: "SUBMITTED",
      updated_at: "2026-10-03T10:00:00Z",
    },
    {
      id: "req-2",
      title: "Sick leave · 1–2 Oct",
      status: "APPROVED",
      updated_at: "2026-10-03T10:00:00Z",
    },
  ],
  approvals: [
    {
      id: "appr-1",
      name: "M. Phillip",
      kind: "Vacation leave",
      submitted_at: "2026-10-05T10:00:00Z",
    },
  ],
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

describe("HrDashboard", () => {
  it("greets the user and offers one primary Request leave action", () => {
    render(<HrDashboard data={data} />);

    expect(
      screen.getByRole("heading", { name: "Welcome back, Aiyana" })
    ).toBeInTheDocument();
    expect(screen.getByText("Sunday, 6 September")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request leave" })).toHaveAttribute(
      "href",
      "/hr/leave"
    );
  });

  it("shows balance, next shift and a timesheet link at a glance", () => {
    render(<HrDashboard data={data} />);

    expect(screen.getByText("18.0")).toBeInTheDocument();
    expect(screen.getByText("Thu 9 Oct · Day")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review hours" })).toHaveAttribute(
      "href",
      "/hr/timesheet"
    );
  });

  it("lists the user's requests with their status", () => {
    render(<HrDashboard data={data} />);

    expect(screen.getByText("Vacation leave · 20–24 Oct")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });

  it("shows who's on duty by default and who's away when toggled", () => {
    render(<HrDashboard data={data} />);

    expect(screen.getByText("Scheduled Colleague")).toBeInTheDocument();
    expect(screen.queryByText("Away Colleague")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Away" }));
    expect(screen.getByText("Away Colleague")).toBeInTheDocument();
    expect(screen.queryByText("Scheduled Colleague")).not.toBeInTheDocument();
  });

  it("keeps other forms in the launcher, without a second Leave entry", () => {
    render(<HrDashboard data={data} />);

    expect(screen.queryByText("Shift exchange")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: OTHER_FORMS }));
    expect(screen.getByText("Shift exchange")).toBeInTheDocument();
    expect(screen.getByText("Daily status report")).toBeInTheDocument();
    expect(screen.queryByText("Leave application")).not.toBeInTheDocument();
  });

  it("replaces the Staff / Admin toggle with an approvals callout for approvers", () => {
    render(<HrDashboard data={data} />);

    expect(
      screen.queryByRole("button", { name: "Admin" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("1 request needs your approval")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: OPEN_APPROVALS })).toHaveAttribute(
      "href",
      "/hr/approvals"
    );
  });

  it("hides the approvals callout from staff who cannot approve", () => {
    render(<HrDashboard data={{ ...data, can_approve: false }} />);
    expect(screen.queryByText(NEEDS_APPROVAL)).not.toBeInTheDocument();
    expect(screen.queryByText(OPEN_APPROVALS)).not.toBeInTheDocument();
  });

  it("shows missing balances and real empty states without sample records", () => {
    render(
      <HrDashboard
        data={{
          ...data,
          vacation_balance: null,
          next_shift: null,
          requests: [],
          on_duty: [],
          away: [],
        }}
      />
    );
    expect(screen.getByText("Not recorded")).toBeInTheDocument();
    expect(screen.getByText("Not scheduled")).toBeInTheDocument();
    expect(screen.getByText("You have no requests yet.")).toBeInTheDocument();
    expect(
      screen.getByText("No published work shifts for today.")
    ).toBeInTheDocument();
  });
});
