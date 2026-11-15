// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ServiceMenu } from "./service-menu";

const BOOK_LABEL = /^Book .+ \(opens in a new tab\)$/u;

const booking = {
  href: "https://example.test/book",
  rel: "noopener",
  target: "_blank",
} as const;

describe("ServiceMenu tabs", () => {
  it("moves to the first and last category with Home and End", () => {
    render(<ServiceMenu booking={booking} />);
    const tabs = screen.getAllByRole("tab");
    const first = tabs[0];
    const last = tabs.at(-1);
    if (!(first && last) || tabs.length < 2) throw new Error("need two tabs");

    first.focus();
    fireEvent.keyDown(first, { key: "End" });
    expect(last).toHaveAttribute("aria-selected", "true");
    expect(last).toHaveFocus();

    fireEvent.keyDown(last, { key: "Home" });
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(first).toHaveFocus();
  });

  it("still steps with the arrow keys and wraps", () => {
    render(<ServiceMenu booking={booking} />);
    const tabs = screen.getAllByRole("tab");
    const first = tabs[0];
    const second = tabs[1];
    if (!(first && second)) throw new Error("need two tabs");

    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(second).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(second, { key: "ArrowLeft" });
    expect(first).toHaveAttribute("aria-selected", "true");
  });

  it("names each Book link as opening a new tab", () => {
    render(<ServiceMenu booking={booking} />);
    const links = screen.getAllByRole("link", { hidden: true });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute("aria-label")).toMatch(BOOK_LABEL);
    }
  });
});
