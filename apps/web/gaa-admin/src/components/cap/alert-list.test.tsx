import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CapAlert } from "@/lib/cap-api";
import { AlertList } from "./alert-list";

// Guards the optionality introduced when the cap UI moved onto the generated
// CapAlertPublic/CapInfoPublic types (info?, severity? are optional there).
function makeAlert(overrides: Partial<CapAlert> = {}): CapAlert {
  return {
    id: "alert_1",
    identifier: "GD-2026-001",
    sender: "cap@weather.gd",
    sent: "2026-07-06T00:00:00Z",
    status: "Actual",
    msg_type: "Alert",
    scope: "Public",
    lifecycle_state: "PUBLISHED",
    created_by_user_id: "user_1",
    created_at: "2026-07-06T00:00:00Z",
    updated_at: "2026-07-06T00:00:00Z",
    ...overrides,
  };
}

describe("AlertList", () => {
  it("renders the headline and severity from the primary info block", () => {
    render(
      <AlertList
        alerts={[
          makeAlert({
            info: [
              {
                id: "info_1",
                sequence: 0,
                event: "Heavy Rainfall",
                headline: "Heavy rainfall warning",
                description: "Rain expected across Grenada.",
                severity: "Severe",
              },
            ],
          }),
        ]}
        emptyLabel="none"
      />
    );

    expect(screen.getByText("Heavy rainfall warning")).toBeInTheDocument();
    expect(screen.getByText("Severe")).toBeInTheDocument();
  });

  it("falls back to the identifier and omits the badge when info is missing", () => {
    render(<AlertList alerts={[makeAlert()]} emptyLabel="none" />);

    expect(screen.getByText("GD-2026-001")).toBeInTheDocument();
    expect(screen.queryByText("Severe")).not.toBeInTheDocument();
  });

  it("shows the empty label when there are no alerts", () => {
    render(<AlertList alerts={[]} emptyLabel="No alerts here" />);

    expect(screen.getByText("No alerts here")).toBeInTheDocument();
  });
});
