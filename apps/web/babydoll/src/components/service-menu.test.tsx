// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ServiceMenu } from "./service-menu";

const BOOK_LABEL = /^Book .+$/u;

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

  it("leaves browser shortcuts with Alt, Ctrl or Cmd alone", () => {
    render(<ServiceMenu booking={booking} />);
    const tabs = screen.getAllByRole("tab");
    const first = tabs[0];
    const last = tabs.at(-1);
    if (!(first && last)) throw new Error("need tabs");

    first.focus();
    fireEvent.keyDown(first, { key: "End", ctrlKey: true });
    fireEvent.keyDown(first, { key: "ArrowRight", altKey: true });
    fireEvent.keyDown(first, { key: "Home", metaKey: true });

    expect(first).toHaveAttribute("aria-selected", "true");
    expect(last).toHaveAttribute("aria-selected", "false");
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

  it("says once that the Book links open a new tab, and keeps each label short", () => {
    const { container } = render(<ServiceMenu booking={booking} />);
    expect(
      screen.getByText("Book links open the booking page in a new tab.")
    ).toHaveClass("sr-only");
    const links = Array.from(container.querySelectorAll("a.book-link"));
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute("aria-label")).toMatch(BOOK_LABEL);
    }
  });
});

describe("ServiceMenu lash note", () => {
  it("tells new clients to book a consultation first, in the lashes panel only", () => {
    render(<ServiceMenu booking={booking} />);
    const notes = screen.getAllByText("New clients: book a consultation first");
    expect(notes).toHaveLength(1);
    expect(notes[0]?.closest("#panel-lashes")).not.toBeNull();
  });
});
