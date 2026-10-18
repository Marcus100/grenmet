// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const listMyTickets = vi.hoisted(() => vi.fn());
vi.mock("@/lib/account", () => ({
  requireAccount: vi.fn().mockResolvedValue({ access_token: "access" }),
}));
vi.mock("@/lib/account-rewards", () => ({ listMyTickets }));
vi.mock("@/lib/app-links", () => ({
  getAppHrefs: () => ({ events: "https://events.example" }),
}));
vi.mock("@/components/account-layout", () => ({
  AccountLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
  SettingsSection: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
  SettingsRow: ({
    children,
    description,
    title,
  }: {
    children?: React.ReactNode;
    description?: React.ReactNode;
    title: string;
  }) => (
    <div>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  ),
  StatusBadge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

import TicketsPage from "./page";

function ticket(overrides: Record<string, unknown> = {}) {
  return {
    admitted_at: null,
    can_cancel: true,
    code: "ABCDEF",
    ends_at: "2026-11-01T02:00:00Z",
    id: "t1",
    listing_slug: "sunset-fete",
    listing_title: "Sunset fete",
    parish: "st-george",
    starts_at: "2026-11-01T00:00:00Z",
    status: "valid",
    tier_name: "General",
    venue: "Stadium",
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("TicketsPage", () => {
  it("links to Events when there are no tickets", async () => {
    listMyTickets.mockResolvedValue([]);
    render(await TicketsPage());
    expect(
      screen.getByText("no tickets yet", { exact: false })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find an event" })).toHaveAttribute(
      "href",
      "https://events.example"
    );
  });

  it("shows each ticket with its state", async () => {
    listMyTickets.mockResolvedValue([
      ticket(),
      ticket({ admitted_at: "2026-11-01T00:30:00Z", id: "t2" }),
      ticket({ id: "t3", status: "cancelled" }),
    ]);
    render(await TicketsPage());
    expect(screen.getAllByText("Sunset fete")).toHaveLength(3);
    expect(screen.getByText("Admitted")).toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });
});
