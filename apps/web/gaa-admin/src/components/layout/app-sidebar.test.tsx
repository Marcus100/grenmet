import { SidebarProvider } from "@barrelsgd/ui/components/ui/sidebar";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppSidebar } from "./app-sidebar";
import type { NavUserData } from "./nav-user";

vi.mock("@barrelsgd/theme/components/preferences-provider", () => ({
  usePreferencesStore: (
    selector: (state: Record<string, unknown>) => unknown
  ) =>
    selector({
      isSynced: false,
      sidebarCollapsible: "icon",
      sidebarVariant: "inset",
    }),
}));
vi.mock("@barrelsgd/gms/components/logo", () => ({ Logo: () => null }));
vi.mock("./nav-main", () => ({ NavMain: () => null }));
vi.mock("./nav-user", () => ({ NavUser: () => null }));

const USER = {
  email: "staff@example.com",
  name: "Staff Member",
} as unknown as NavUserData;

describe("AppSidebar", () => {
  it("names the logo link, so a screen reader does not announce a bare letter", () => {
    render(
      <SidebarProvider>
        <AppSidebar user={USER} />
      </SidebarProvider>
    );
    const home = screen.getByRole("link", { name: "GAA Admin home" });
    expect(home.getAttribute("href")).toBe("/");
  });
});
