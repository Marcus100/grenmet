import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ value: "/studio/sea-salt/agenda" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

import { StudioNav } from "./studio-nav";

describe("studio nav", () => {
  it("shows Settings to members, who cannot create bookings", () => {
    render(<StudioNav orgSlug="sea-salt" />);
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/studio/sea-salt/settings"
    );
    expect(
      screen.queryByRole("link", { name: "New booking" })
    ).not.toBeInTheDocument();
  });

  it("links Services and People for members too, next to Settings", () => {
    pathname.value = "/studio/sea-salt/agenda";
    render(<StudioNav orgSlug="sea-salt" />);
    expect(screen.getByRole("link", { name: "Services" })).toHaveAttribute(
      "href",
      "/studio/sea-salt/services"
    );
    expect(screen.getByRole("link", { name: "People" })).toHaveAttribute(
      "href",
      "/studio/sea-salt/people"
    );
  });

  it("marks People as the current page on its own address", () => {
    pathname.value = "/studio/sea-salt/people";
    render(<StudioNav orgSlug="sea-salt" />);
    expect(screen.getByRole("link", { name: "People" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "Settings" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("marks Settings as the current page", () => {
    pathname.value = "/studio/sea-salt/settings";
    render(<StudioNav canCreate orgSlug="sea-salt" />);
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "Agenda" })).not.toHaveAttribute(
      "aria-current"
    );
  });
});
