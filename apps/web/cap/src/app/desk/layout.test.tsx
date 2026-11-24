import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { staffGate } from "@/test/desk-gate.fixture";

const gate = vi.hoisted(() => ({ getDeskGate: vi.fn() }));
vi.mock("@/lib/desk/gate", () => gate);
vi.mock("@/components/desk/api-client", () => ({ DeskApiClient: () => null }));

import DeskLayout from "./layout";

const NAV_LINK_MIN_HEIGHT = "min-h-11";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("desk navigation touch targets", () => {
  it("gives every desk nav link a 44px minimum height", async () => {
    gate.getDeskGate.mockResolvedValue(staffGate());
    render(await DeskLayout({ children: null }));
    const nav = screen.getByRole("navigation", { name: "Desk" });
    const links = nav.querySelectorAll("a");
    expect(links.length).toBeGreaterThanOrEqual(4);
    for (const link of links) {
      expect(link.classList.contains(NAV_LINK_MIN_HEIGHT)).toBe(true);
    }
  });

  it("keeps the links in a wrapping row, so narrow screens wrap rather than overflow", async () => {
    gate.getDeskGate.mockResolvedValue(staffGate());
    render(await DeskLayout({ children: null }));
    const nav = screen.getByRole("navigation", { name: "Desk" });
    expect(nav.classList.contains("flex-wrap")).toBe(true);
    expect(nav.classList.contains("min-w-0")).toBe(true);
  });

  it("gives the Log out button a 44px target", async () => {
    gate.getDeskGate.mockResolvedValue(staffGate());
    render(await DeskLayout({ children: null }));
    const logout = screen.getByRole("button", { name: "Log out" });
    expect(logout.classList.contains("min-h-11")).toBe(true);
    expect(logout.classList.contains("inline-flex")).toBe(true);
  });

  it("renders no nav when the account is not staff", async () => {
    gate.getDeskGate.mockResolvedValue({ status: "signed-out" });
    render(await DeskLayout({ children: null }));
    expect(screen.queryByRole("navigation", { name: "Desk" })).toBeNull();
  });
});
