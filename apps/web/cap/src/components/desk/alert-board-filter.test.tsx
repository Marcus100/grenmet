import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import type { BoardSection } from "@/lib/desk/board-filter";
import { deskAlert, deskInfo } from "@/test/desk-alert.fixture";
import { AlertBoardFilter } from "./alert-board-filter";

const DRAFT = deskAlert({
  id: "aaaaaaaa-2222-4333-8444-555555555555",
  identifier: "gms-rain-001",
  info: [deskInfo({ headline: "Heavy rain for St Mark" })],
});
const LIVE = deskAlert({
  id: "bbbbbbbb-2222-4333-8444-555555555555",
  identifier: "gms-wind-002",
  info: [deskInfo({ headline: "Strong wind for St David" })],
  lifecycle_state: "PUBLISHED",
});

function board(
  overrides: Partial<Record<string, BoardSection["alerts"]>> = {}
): BoardSection[] {
  return [
    {
      alerts: overrides.DRAFT ?? [DRAFT],
      empty: "No drafts.",
      state: "DRAFT",
      title: "Drafts",
    },
    {
      alerts: overrides.SUBMITTED ?? [],
      empty: "Nothing is waiting for approval.",
      state: "SUBMITTED",
      title: "Awaiting approval",
    },
    {
      alerts: overrides.APPROVED ?? [],
      empty: "Nothing approved and waiting.",
      state: "APPROVED",
      title: "Approved, not yet published",
    },
    {
      alerts: overrides.PUBLISHED ?? [LIVE],
      empty: "No published alerts are in force.",
      state: "PUBLISHED",
      title: "In force",
    },
  ];
}

const SHOW_ALL = /Show every stage/;
const SEARCH = /Search headline or identifier/;

describe("AlertBoardFilter", () => {
  it("shows every stage, empty ones too, under All", () => {
    render(<AlertBoardFilter sections={board()} />);
    expect(
      screen.getByRole("heading", { name: "Drafts (1)" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Awaiting approval (0)" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Nothing is waiting for approval.")
    ).toBeInTheDocument();
  });

  it("shows how many alerts each stage holds on its chip", () => {
    render(<AlertBoardFilter sections={board()} />);
    expect(
      screen.getByRole("button", { name: "Drafts (1)" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "In force (1)" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Awaiting approval (0)" })
    ).toBeInTheDocument();
  });

  it("narrows to one stage when its chip is chosen, and says so", () => {
    render(<AlertBoardFilter sections={board()} />);
    fireEvent.click(screen.getByRole("button", { name: "Drafts (1)" }));
    expect(
      screen.getByRole("heading", { name: "Drafts (1)" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "In force (1)" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Showing Drafts only."
    );
    expect(screen.getByRole("button", { name: "Drafts (1)" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("restores every stage from the show-all link", () => {
    render(<AlertBoardFilter sections={board()} />);
    fireEvent.click(screen.getByRole("button", { name: "Drafts (1)" }));
    fireEvent.click(screen.getByRole("button", { name: SHOW_ALL }));
    expect(
      screen.getByRole("heading", { name: "In force (1)" })
    ).toBeInTheDocument();
  });

  it("searches headlines and identifiers and keeps each stage heading", () => {
    render(<AlertBoardFilter sections={board()} />);
    fireEvent.change(screen.getByLabelText(SEARCH), {
      target: { value: "wind" },
    });
    expect(screen.getByText("Strong wind for St David")).toBeInTheDocument();
    expect(screen.queryByText("Heavy rain for St Mark")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Drafts (0)" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("No alerts in this stage match the search.")
    ).toBeInTheDocument();
  });

  it("says a stage is empty when there is nothing to search", () => {
    render(<AlertBoardFilter sections={board({ DRAFT: [] })} />);
    expect(screen.getByText("No drafts.")).toBeInTheDocument();
  });

  it("keeps the empty message for a stage with nothing in it", () => {
    render(<AlertBoardFilter sections={board({ DRAFT: [] })} />);
    fireEvent.change(screen.getByLabelText(SEARCH), {
      target: { value: "rain" },
    });
    expect(screen.getByText("No drafts.")).toBeInTheDocument();
  });
});
