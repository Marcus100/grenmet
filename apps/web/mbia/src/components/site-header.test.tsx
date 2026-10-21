import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import { SiteHeader } from "@/components/site-header";
import { NAV_GROUPS } from "@/lib/nav";

// The mobile sheet is code-split (next/dynamic). Warm its chunk once so a tap
// does not wait on a cold import, which outlasted findByRole's 1 s window
// under a loaded parallel run (#455). Lazy loading itself is still asserted
// below: nothing renders the sheet until the menu is opened.
beforeAll(async () => {
  await import("@/components/mobile-nav-sheet");
});

// First desktop group and its first link, as defined in `lib/nav.ts`.
const TRAVEL_LABEL = "Travel Guide";
const CHECK_IN_LABEL = "Check-in Procedures";

function travelMenu(): HTMLDetailsElement {
  const summary = screen.getByText(TRAVEL_LABEL, { selector: "summary" });
  const details = summary.closest("details");
  if (!details) throw new Error("travel menu is not a <details>");
  return details;
}

describe("SiteHeader desktop menu", () => {
  it("renders each group as a closed disclosure", () => {
    render(<SiteHeader />);
    for (const group of NAV_GROUPS) {
      const summary = screen.getByText(group.label, { selector: "summary" });
      expect(summary.closest("details")).not.toHaveAttribute("open");
    }
  });

  it("closes on Escape from inside the menu, returning focus to the summary", async () => {
    const user = userEvent.setup();
    render(<SiteHeader />);
    const menu = travelMenu();
    const summary = menu.querySelector("summary");
    if (!summary) throw new Error("missing summary");

    // jsdom does not turn Enter/Space on <summary> into a toggle (browsers do,
    // natively), so open with a click and drive everything after it by keyboard.
    summary.focus();
    expect(summary).toHaveFocus();
    fireEvent.click(summary);
    expect(menu).toHaveAttribute("open");

    within(menu).getByRole("link", { name: CHECK_IN_LABEL }).focus();
    await user.keyboard("{Escape}");
    expect(menu).not.toHaveAttribute("open");
    expect(summary).toHaveFocus();
  });

  it("closes when the pointer is pressed outside the open menu", async () => {
    const user = userEvent.setup();
    render(<SiteHeader />);
    const menu = travelMenu();
    await user.click(menu.querySelector("summary") as HTMLElement);
    expect(menu).toHaveAttribute("open");

    await user.click(document.body);
    expect(menu).not.toHaveAttribute("open");
  });

  it("closes after a link inside the menu is followed", async () => {
    const user = userEvent.setup();
    render(<SiteHeader />);
    const menu = travelMenu();
    await user.click(menu.querySelector("summary") as HTMLElement);
    await user.click(within(menu).getByRole("link", { name: CHECK_IN_LABEL }));
    expect(menu).not.toHaveAttribute("open");
  });
});

describe("SiteHeader mobile menu", () => {
  it("opens the sheet on tap, closes on Escape and returns focus to the menu button", async () => {
    const user = userEvent.setup();
    render(<SiteHeader />);
    const trigger = screen.getByRole("button", { name: "Open menu" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", {
      name: "Grenada Airports Authority",
    });
    expect(dialog).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });

  it("closes when a link in the sheet is followed", async () => {
    const user = userEvent.setup();
    render(<SiteHeader />);
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    const dialog = await screen.findByRole("dialog");

    await user.click(within(dialog).getByRole("link", { name: "Contact Us" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("does not load the sheet until the menu is first opened", () => {
    render(<SiteHeader />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
