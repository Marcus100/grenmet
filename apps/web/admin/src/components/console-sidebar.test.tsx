import { SidebarProvider } from "@barrelsgd/ui/components/ui/sidebar";
import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { CONSOLE_NAV, isNavItemActive } from "./console-nav";
import { ConsoleSidebar } from "./console-sidebar";

const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

// jsdom has no matchMedia; the shared sidebar asks it whether this is a phone.
beforeAll(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    }))
  );
});

function renderSidebar(path: string) {
  pathname.current = path;
  return render(
    <SidebarProvider>
      <ConsoleSidebar email="staff@barrels.gd" name="Staff Person" />
    </SidebarProvider>
  );
}

describe("isNavItemActive", () => {
  it("matches Overview only on the root", () => {
    expect(isNavItemActive("/", "/")).toBe(true);
    expect(isNavItemActive("/invoices", "/")).toBe(false);
  });

  it("matches a section and its sub-pages but not a prefix lookalike", () => {
    expect(isNavItemActive("/invoices", "/invoices")).toBe(true);
    expect(isNavItemActive("/invoices/42", "/invoices")).toBe(true);
    expect(isNavItemActive("/invoices-old", "/invoices")).toBe(false);
  });
});

describe("ConsoleSidebar", () => {
  it("links every console section", () => {
    renderSidebar("/");
    const nav = screen.getByRole("navigation", { name: "Console" });
    const hrefs = within(nav)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(
      CONSOLE_NAV.flatMap((group) => group.items.map((item) => item.href))
    );
  });

  it("marks the current section, including on a sub-page", () => {
    renderSidebar("/organisations/abc");
    const nav = screen.getByRole("navigation", { name: "Console" });
    const current = within(nav).getByRole("link", { current: "page" });
    expect(current).toHaveAttribute("href", "/organisations");
  });

  it("shows who is signed in", () => {
    renderSidebar("/");
    expect(screen.getByText("staff@barrels.gd")).toBeInTheDocument();
    expect(screen.getByText("Staff Person")).toBeInTheDocument();
  });
});
