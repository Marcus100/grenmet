// The account menu lives in @barrelsgd/ui. Its tests run here because this app
// already has the jsdom and Testing Library setup; packages/ui has neither.
import {
  AccountMenu,
  type AccountMenuApp,
  type AccountMenuSignOut,
  type AccountMenuUser,
} from "@barrelsgd/ui/components/account-menu";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

const ACCOUNT_URL = "https://account.example.test";
const TRIGGER_NAME = /Account menu for Ada Lovelace/u;
const LETTER_A = /^A$/u;
const LETTER_Z = /^Z$/u;

interface SignedInOptions {
  apps?: AccountMenuApp[];
  signOut?: AccountMenuSignOut;
  user?: AccountMenuUser;
}

function signedIn(options: SignedInOptions = {}): ReactElement {
  return (
    <AccountMenu
      accountUrl={ACCOUNT_URL}
      apps={options.apps ?? []}
      signOut={options.signOut ?? { href: "/auth/logout" }}
      user={options.user ?? { email: "ada@example.test", name: "Ada Lovelace" }}
    />
  );
}

function trigger(name: RegExp | string = TRIGGER_NAME): HTMLElement {
  return screen.getByRole("button", { name });
}

describe("AccountMenu signed out", () => {
  it("renders only a Sign in link to the given address", () => {
    render(<AccountMenu signInHref="/signin?returnTo=%2F" user={null} />);
    const link = screen.getByRole("link", { name: "Sign in" });
    expect(link).toHaveAttribute("href", "/signin?returnTo=%2F");
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("AccountMenu signed in", () => {
  it("names the avatar button after the person", () => {
    render(signedIn());
    expect(trigger()).toBeInTheDocument();
  });

  it("shows the name, email, the account link and sign out when opened", async () => {
    render(signedIn({ apps: [{ label: "Events", href: "https://e.test" }] }));
    fireEvent.click(trigger());

    const menu = await screen.findByRole("menu");
    expect(menu).toHaveTextContent("Ada Lovelace");
    expect(menu).toHaveTextContent("ada@example.test");
    expect(
      screen.getByRole("menuitem", { name: "Manage your Barrels account" })
    ).toHaveAttribute("href", ACCOUNT_URL);
    expect(screen.getByRole("menuitem", { name: "Events" })).toHaveAttribute(
      "href",
      "https://e.test"
    );
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  });

  it("posts sign-out to the given href", async () => {
    render(signedIn());
    fireEvent.click(trigger());
    const form = (
      await screen.findByRole("menuitem", { name: "Sign out" })
    ).closest("form");
    expect(form).toHaveAttribute("action", "/auth/logout");
    expect(form).toHaveAttribute("method", "post");
  });

  it("takes a Server Action for sign-out", async () => {
    const action = vi.fn();
    render(signedIn({ signOut: { action } }));
    fireEvent.click(trigger());
    const item = await screen.findByRole("menuitem", { name: "Sign out" });
    expect(item.closest("form")).not.toBeNull();
  });

  it("keeps a long email inside the menu (truncated, not wrapping)", async () => {
    const longEmail = `${"a".repeat(120)}@very-long-domain.example.test`;
    render(signedIn({ user: { email: longEmail, name: "Ada Lovelace" } }));
    fireEvent.click(trigger());
    const email = await screen.findByText(longEmail);
    expect(email.className).toContain("truncate");
    expect(email.parentElement?.className).toContain("min-w-0");
  });

  it("uses the first letter of the name for the avatar fallback", () => {
    render(signedIn({ user: { email: "ada@example.test", name: "ada" } }));
    expect(trigger("Account menu for ada")).toHaveTextContent(LETTER_A);
  });

  it("falls back to the first letter of the email when there is no name", () => {
    render(
      signedIn({
        user: { email: "zoe@example.test", name: null },
      })
    );
    expect(
      screen.getByRole("button", { name: "Account menu for zoe@example.test" })
    ).toHaveTextContent(LETTER_Z);
  });

  it("opens from the button and closes on Escape, returning focus to it", async () => {
    render(signedIn());
    const button = trigger();
    button.focus();
    fireEvent.click(button);
    expect(await screen.findByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(button).toHaveFocus());
  });

  it("moves between items with the arrow keys", async () => {
    render(signedIn());
    fireEvent.click(trigger());
    const menu = await screen.findByRole("menu");
    const items = screen.getAllByRole("menuitem");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    // jsdom's focus model is partial: the menu moves focus onto an item.
    expect(items).toContain(document.activeElement);
  });

  it("gives the trigger and the account link a tap target of at least 44px", async () => {
    render(signedIn());
    expect(trigger().className).toContain("h-11");
    expect(trigger().className).toContain("w-11");
    fireEvent.click(trigger());
    const link = await screen.findByRole("menuitem", {
      name: "Manage your Barrels account",
    });
    expect(link.className).toContain("min-h-11");
  });

  it("submits sign-out to the app's own route when Sign out is clicked", async () => {
    const submitted: HTMLFormElement[] = [];
    const record = (event: Event) => {
      // Keep jsdom from trying to navigate; record which form was submitted.
      event.preventDefault();
      submitted.push(event.target as HTMLFormElement);
    };
    document.addEventListener("submit", record);
    try {
      render(signedIn());
      fireEvent.click(trigger());
      fireEvent.click(
        await screen.findByRole("menuitem", { name: "Sign out" })
      );
      await waitFor(() => expect(submitted).toHaveLength(1));
      expect(submitted[0]).toHaveAttribute("action", "/auth/logout");
      expect(submitted[0]).toHaveAttribute("method", "post");
    } finally {
      document.removeEventListener("submit", record);
    }
  });
});
