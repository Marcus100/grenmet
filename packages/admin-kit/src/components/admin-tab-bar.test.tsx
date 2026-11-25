import { SidebarProvider } from "@barrelsgd/ui/components/ui/sidebar";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminNavGroup } from "../lib/navigation";
import { NAVIGATION } from "../test/fixtures";
import { mockPreferences, navigationState, push } from "../test/mocks";
import { AdminShellFrame } from "./admin-shell-frame";
import { AdminTabBar } from "./admin-tab-bar";

const RE_0 = /Agenda/u;

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
  useRouter: () => ({ push }),
}));
vi.mock("@barrelsgd/theme/components/preferences-provider", () =>
  mockPreferences()
);
vi.mock("@barrelsgd/theme/lib/preferences-storage", () => ({
  persistPreference: vi.fn(() => Promise.resolve()),
}));

const FIVE_TABS: AdminNavGroup[] = [
  {
    id: "g",
    items: Array.from({ length: 5 }, (_, i) => ({
      id: `t${i}`,
      tab: true,
      title: `Tab ${i}`,
      url: `/t${i}`,
    })),
  },
];

beforeEach(() => {
  navigationState.pathname = "/agenda";
});

describe("AdminTabBar", () => {
  it("shows at most four destinations plus More", () => {
    render(
      <SidebarProvider>
        <AdminTabBar navigation={FIVE_TABS} />
      </SidebarProvider>
    );
    const bar = screen.getByRole("navigation", { name: "Main" });
    expect(within(bar).getAllByRole("link")).toHaveLength(4);
    expect(
      within(bar).getByRole("button", { name: "More" })
    ).toBeInTheDocument();
    expect(within(bar).queryByText("Tab 4")).toBeNull();
  });

  it("marks the current tab and gives touch-sized targets", () => {
    render(
      <SidebarProvider>
        <AdminTabBar navigation={NAVIGATION} />
      </SidebarProvider>
    );
    const agenda = screen.getByRole("link", { name: RE_0 });
    expect(agenda).toHaveAttribute("aria-current", "page");
    expect(agenda.className).toContain("min-h-14");
    expect(screen.getByRole("button", { name: "More" }).className).toContain(
      "min-h-14"
    );
  });

  it("reads the badge aloud with its label", () => {
    render(
      <SidebarProvider>
        <AdminTabBar navigation={NAVIGATION} />
      </SidebarProvider>
    );
    expect(screen.getByText("(3 waiting to be confirmed)")).toBeInTheDocument();
  });

  it("renders nothing without flagged items", () => {
    render(
      <SidebarProvider>
        <AdminTabBar
          navigation={[
            { id: "g", items: [{ id: "a", title: "A", url: "/a" }] },
          ]}
        />
      </SidebarProvider>
    );
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });

  it("opens the sidebar sheet from More on a phone", async () => {
    window.innerWidth = 400;
    render(
      <AdminShellFrame
        brand={{ href: "/", name: "Studio" }}
        collapsible="icon"
        defaultOpen
        navigation={NAVIGATION}
        user={{
          user: { email: "a@b.c", name: "Ada" },
          signOut: { action: "/auth/logout" },
        }}
        variant="inset"
      >
        <p>Body</p>
      </AdminShellFrame>
    );
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    const sheet = await screen.findByRole("dialog");
    expect(
      within(sheet).getByRole("link", { name: "Reports" })
    ).toBeInTheDocument();
    window.innerWidth = 1024;
  });
});

describe("AdminSidebar brand", () => {
  const props = {
    collapsible: "icon" as const,
    defaultOpen: true,
    navigation: NAVIGATION,
    user: {
      user: { email: "a@b.c", name: "Ada" },
      signOut: { action: "/auth/logout" },
    },
    variant: "inset" as const,
  };

  it("shows the name beside the logo, or only the logo when it is a wordmark", () => {
    const { unmount } = render(
      <AdminShellFrame
        {...props}
        brand={{ href: "/", logo: <i data-testid="mark" />, name: "Studio" }}
      >
        <p>Body</p>
      </AdminShellFrame>
    );
    expect(screen.getByText("Studio")).toBeInTheDocument();
    unmount();
    render(
      <AdminShellFrame
        {...props}
        brand={{
          collapsedLogo: <i data-testid="icon" />,
          hideName: true,
          href: "/",
          logo: <i data-testid="wordmark" />,
          name: "Studio",
        }}
      >
        <p>Body</p>
      </AdminShellFrame>
    );
    expect(screen.queryByText("Studio")).toBeNull();
    expect(screen.getByTestId("wordmark")).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Studio home" })
    ).toBeInTheDocument();
  });
});
