// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const listAccountApps = vi.hoisted(() => vi.fn());
vi.mock("@/lib/account", () => ({ requireAccount: vi.fn() }));
vi.mock("@/lib/account-apps", () => ({ listAccountApps }));
vi.mock("@/lib/session", () => ({
  readSessionCookie: vi.fn().mockResolvedValue("account-session"),
}));
vi.mock("./actions", () => ({
  joinAppFromAccount: vi.fn(),
  leaveAppFromAccount: vi.fn(),
}));
vi.mock("@/components/account-layout", () => ({
  AccountLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
  SettingsSection: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
  SettingsRow: ({
    action,
    children,
    description,
    title,
  }: {
    action?: React.ReactNode;
    children?: React.ReactNode;
    description?: React.ReactNode;
    title: string;
  }) => (
    <div data-testid={title}>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
      {children}
    </div>
  ),
  StatusBadge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

import AppsPage from "./page";

async function show(params: Record<string, string> = {}) {
  render(await AppsPage({ searchParams: Promise.resolve(params) }));
}

afterEach(() => vi.clearAllMocks());

describe("/apps", () => {
  it("offers Leave on a joined app and Join on one not joined", async () => {
    listAccountApps.mockResolvedValue([
      { key: "events", label: "Barrels Events", joined: true, can_leave: true },
      { key: "docs", label: "Docs", joined: false, can_leave: true },
    ]);
    await show();
    expect(
      within(screen.getByTestId("Barrels Events")).getByRole("button", {
        name: "Leave",
      })
    ).toBeTruthy();
    expect(
      within(screen.getByTestId("Docs")).getByRole("button", { name: "Join" })
    ).toBeTruthy();
  });

  it("shows no button for staff apps granted by an administrator", async () => {
    listAccountApps.mockResolvedValue([
      { key: "gaa-admin", label: "GAA Admin", joined: true, can_leave: false },
    ]);
    await show();
    const row = screen.getByTestId("GAA Admin");
    expect(within(row).queryByRole("button")).toBeNull();
    expect(
      within(row).getByText("Access is given by an administrator.")
    ).toBeTruthy();
  });

  it("shows a fixed message for a known notice and ignores anything else", async () => {
    listAccountApps.mockResolvedValue([]);
    await show({ notice: "left" });
    expect(screen.getByRole("status").textContent).toContain(
      "You left the app"
    );
    document.body.innerHTML = "";
    await show({ notice: "<script>alert(1)</script>" });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
