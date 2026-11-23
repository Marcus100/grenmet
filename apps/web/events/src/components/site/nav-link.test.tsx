import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BottomNav, MobileNav } from "./nav-link";

vi.mock("next/navigation", () => ({ usePathname: () => "/groups" }));

describe("site navigation", () => {
  it("opens a phone menu with every section and marks the current one", async () => {
    render(<MobileNav />);

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    const groups = await screen.findByRole("link", { name: "Groups" });
    expect(groups.getAttribute("aria-current")).toBe("page");
    for (const name of ["Discover", "Calendar", "Network", "Messages"]) {
      expect(screen.getByRole("link", { name })).toBeTruthy();
    }
    fireEvent.click(groups);
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Discover" })).toBeNull()
    );
  });

  it("offers organisers, suggestions and sign-in on the phone menu", async () => {
    render(<MobileNav />);

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    expect(
      (
        await screen.findByRole("link", { name: "For organisers" })
      ).getAttribute("href")
    ).toBe("/dash/events");
    expect(
      screen
        .getByRole("link", { name: "Suggest an event" })
        .getAttribute("href")
    ).toBe("/events/suggest");
    expect(
      screen.getByRole("link", { name: "Sign in" }).getAttribute("href")
    ).toBe("/sign-in");
  });

  it("hides sign-in from a signed-in member on the phone menu", async () => {
    render(<MobileNav signedIn />);

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    expect(
      await screen.findByRole("link", { name: "For organisers" })
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });

  it("keeps the bottom tab bar for the installed app only", () => {
    const { container } = render(<BottomNav />);
    const classes = container.querySelector("nav")?.className.split(" ");
    expect(classes).toContain("hidden");
    expect(classes).toContain("max-md:standalone:block");
  });
});
