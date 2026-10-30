import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { grenadaToday } from "@/components/hr/expiry";
import { EmployeeDetailsCard } from "./EmployeeDetailsCard";

describe("employee details", () => {
  it("shows pending personnel fields without invented employment facts", () => {
    render(
      <EmployeeDetailsCard
        employment={{
          department: {
            organisation_id: "gaa",
            code: "gms",
            id: "gms",
            name: "Meteorological Department",
          },
          position: "Senior Technician",
          status: "ACTIVE",
          details_complete: false,
        }}
      />
    );
    expect(screen.getByText("Senior Technician")).toBeInTheDocument();
    expect(screen.getByText(PENDING_DETAILS)).toBeInTheDocument();
    // Ten blank fields now include the last day, shown as an empty value.
    expect(screen.getAllByText("Not recorded")).toHaveLength(10);
  });
  it("shows recorded employee and supervisor information", () => {
    render(
      <EmployeeDetailsCard
        employment={{
          employee_number: "E-001",
          employment_type: "FULL_TIME",
          start_date: "2020-01-01",
          supervisor_name: "Recorded Supervisor",
          continuous_service_date: "2018-01-01",
          probation_completed_date: "2020-06-01",
          service_details_source: "HR confirmation letter",
          details_complete: true,
        }}
      />
    );
    expect(screen.getByText("E-001")).toBeInTheDocument();
    expect(screen.getByText("2018-01-01")).toBeInTheDocument();
    expect(screen.getByText("2020-06-01")).toBeInTheDocument();
    expect(screen.getByText("HR confirmation letter")).toBeInTheDocument();
    expect(screen.getByText("Recorded Supervisor")).toBeInTheDocument();
    expect(screen.queryByText(PENDING_DETAILS)).not.toBeInTheDocument();
  });
});

describe("last day of employment", () => {
  it("shows a future last day in Grenada date words, with no ended note", () => {
    render(
      <EmployeeDetailsCard
        employment={{ end_date: "2099-11-15", status: "ACTIVE" }}
      />
    );
    expect(screen.getByText("Last day")).toBeInTheDocument();
    expect(screen.getByText("15 Nov 2099")).toBeInTheDocument();
    expect(screen.queryByText(ENDED_NOTE)).not.toBeInTheDocument();
    expect(screen.queryByText(TODAY_NOTE)).not.toBeInTheDocument();
  });

  it("shows the start date in the same format as the last day", () => {
    render(
      <EmployeeDetailsCard
        employment={{ start_date: "2020-01-01", status: "ACTIVE" }}
      />
    );
    expect(screen.getByText("Start date")).toBeInTheDocument();
    expect(screen.getByText("1 Jan 2020")).toBeInTheDocument();
    expect(screen.queryByText("2020-01-01")).not.toBeInTheDocument();
  });

  it("says plainly when the last day is today", () => {
    render(
      <EmployeeDetailsCard
        employment={{ end_date: grenadaToday(), status: "ACTIVE" }}
      />
    );
    expect(
      screen.getByText("Last day is today. Access ends at midnight tonight.")
    ).toBeInTheDocument();
  });

  it("notes that a passed last day has ended access, and that the nightly update will set Terminated", () => {
    render(
      <EmployeeDetailsCard
        employment={{ end_date: "2020-01-31", status: "ACTIVE" }}
      />
    );
    expect(screen.getByText("31 Jan 2020")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This last day has passed. Access ended at midnight after 31 Jan 2020. The nightly update then sets the status to Terminated.",
        { exact: false }
      )
    ).toBeInTheDocument();
  });

  it("does not promise a nightly update once the status is already Terminated", () => {
    render(
      <EmployeeDetailsCard
        employment={{ end_date: "2020-01-31", status: "TERMINATED" }}
      />
    );
    expect(
      screen.getByText("This last day has passed.", { exact: false })
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "The nightly update then sets the status to Terminated.",
        {
          exact: false,
        }
      )
    ).not.toBeInTheDocument();
  });
});

const PENDING_DETAILS = /Personnel details still need verification/;
const ENDED_NOTE = /This last day has passed/;
const TODAY_NOTE = /Last day is today/;
