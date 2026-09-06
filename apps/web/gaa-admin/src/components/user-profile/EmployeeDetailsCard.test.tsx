import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmployeeDetailsCard } from "./EmployeeDetailsCard";

describe("employee details", () => {
  it("shows pending personnel fields without invented employment facts", () => {
    render(
      <EmployeeDetailsCard
        employment={{
          department: { id: "gms", name: "Meteorological Department" },
          position: "Senior Technician",
          status: "ACTIVE",
          details_complete: false,
        }}
      />
    );
    expect(screen.getByText("Senior Technician")).toBeInTheDocument();
    expect(screen.getByText(PENDING_DETAILS)).toBeInTheDocument();
    expect(screen.getAllByText("Not recorded")).toHaveLength(5);
  });
  it("shows recorded employee and supervisor information", () => {
    render(
      <EmployeeDetailsCard
        employment={{
          employee_number: "E-001",
          employment_type: "FULL_TIME",
          start_date: "2020-01-01",
          supervisor_name: "Recorded Supervisor",
          details_complete: true,
        }}
      />
    );
    expect(screen.getByText("E-001")).toBeInTheDocument();
    expect(screen.getByText("Recorded Supervisor")).toBeInTheDocument();
    expect(screen.queryByText(PENDING_DETAILS)).not.toBeInTheDocument();
  });
});

const PENDING_DETAILS = /Personnel details still need verification/;
