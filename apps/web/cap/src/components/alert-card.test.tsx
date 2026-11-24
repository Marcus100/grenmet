import type { CapAlertPublicView } from "@barrelsgd/api-client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AlertCard } from "@/components/alert-card";
import { toAlertView } from "@/lib/alerts";

const NOW = new Date("2026-10-18T14:00:00Z");
const ENDED = /Ended/u;
const WAS_ORANGE = /Was Orange · Be prepared/u;
const NEWER = /the newer warning/u;
const NOT_STATED = /Severity not stated · High wind/u;
const RED_STRIP = /Red · Take action now/u;
const ORANGE_STRIP = /Orange · Be prepared · High wind/u;

function view(
  top: Record<string, unknown> = {},
  info: Record<string, unknown> = {}
) {
  const result = toAlertView({
    identifier: "w1",
    lifecycle_state: "PUBLISHED",
    msg_type: "Alert",
    sent: "2026-10-18T12:00:00Z",
    status: "Actual",
    updated_at: "2026-10-18T12:00:00Z",
    info: [
      {
        areas: [{ area_desc: "Grenada" }],
        certainty: "Likely",
        description: "Strong wind",
        event: "High wind",
        expires: "2026-10-18T20:00:00Z",
        headline: "High wind warning",
        language: "en",
        severity: "Severe",
        urgency: "Expected",
        ...info,
      },
    ],
    ...top,
  } as unknown as CapAlertPublicView);
  if (!result) {
    throw new Error("no view");
  }
  return result;
}

describe("AlertCard", () => {
  it("opens an active Severe alert with the Orange strip", () => {
    const { container } = render(<AlertCard now={NOW} view={view()} />);
    expect(screen.getByText(ORANGE_STRIP)).toBeInTheDocument();
    expect(container.querySelector(".bg-gm-warning-amber-bg")).not.toBeNull();
    expect(screen.queryByText(ENDED)).toBeNull();
  });

  it("draws an Extreme alert in Red, not Orange", () => {
    const { container } = render(
      <AlertCard now={NOW} view={view({}, { severity: "Extreme" })} />
    );
    expect(screen.getByText(RED_STRIP)).toBeInTheDocument();
    expect(container.querySelector(".bg-gm-warning-red-bg")).not.toBeNull();
    expect(container.querySelector(".bg-gm-warning-amber-bg")).toBeNull();
  });

  it("opens an expired alert with a grey Ended strip and a small colour tag", () => {
    const { container } = render(
      <AlertCard
        now={NOW}
        view={view({}, { expires: "2026-10-18T13:00:00Z" })}
      />
    );
    expect(screen.getByText(ENDED)).toHaveTextContent("Ended ·");
    expect(screen.getByText(WAS_ORANGE)).toBeInTheDocument();
    expect(container.querySelector(".bg-gm-warning-grey-bg")).not.toBeNull();
    // The full-width strip is no longer coloured; only the tag carries amber.
    expect(container.querySelector("p.bg-gm-warning-amber-bg")).toBeNull();
  });

  it("treats a cancelled alert as ended at its recorded time", () => {
    render(
      <AlertCard
        now={NOW}
        view={view({
          expired_at: "2026-10-18T13:30:00Z",
          lifecycle_state: "CANCELLED",
        })}
      />
    );
    expect(screen.getByText(ENDED)).toBeInTheDocument();
    expect(screen.getByText(WAS_ORANGE)).toBeInTheDocument();
  });

  it("treats a replaced alert as ended with a link to its replacement", () => {
    const { container } = render(
      <AlertCard now={NOW} view={view({ replaced_by_identifier: "w2" })} />
    );
    expect(screen.getByText(ENDED)).toBeInTheDocument();
    expect(screen.getByText(NEWER)).toHaveAttribute("href", "/alerts/w2");
    expect(container.querySelector("p.bg-gm-warning-amber-bg")).toBeNull();
  });

  it("shows an unstated severity in grey, claiming no colour", () => {
    const { container } = render(
      <AlertCard now={NOW} view={view({}, { severity: "Unknown" })} />
    );
    expect(screen.getByText(NOT_STATED)).toBeInTheDocument();
    expect(container.querySelector(".bg-gm-warning-grey-bg")).not.toBeNull();
    expect(container.querySelector(".bg-gm-warning-amber-bg")).toBeNull();
    expect(container.querySelector(".bg-gm-warning-yellow-bg")).toBeNull();
  });
});
