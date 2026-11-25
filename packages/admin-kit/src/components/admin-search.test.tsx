import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NAVIGATION } from "../test/fixtures";
import { push } from "../test/mocks";
import { AdminSearch } from "./admin-search";

const RE_0 = /Search/u;

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push }),
}));

beforeEach(() => {
  push.mockClear();
});

describe("AdminSearch", () => {
  it("opens with Ctrl+K and lists every navigation destination", async () => {
    render(<AdminSearch navigation={NAVIGATION} />);
    await userEvent.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Search" });
    expect(dialog).toBeInTheDocument();
    for (const name of [
      "Home",
      "Agenda",
      "People",
      "Reports",
      "General",
      "Billing",
    ]) {
      expect(screen.getByRole("option", { name })).toBeInTheDocument();
    }
  });

  it("opens from the button too", async () => {
    render(<AdminSearch navigation={NAVIGATION} />);
    await userEvent.click(screen.getByRole("button", { name: RE_0 }));
    expect(
      await screen.findByRole("dialog", { name: "Search" })
    ).toBeInTheDocument();
  });

  it("narrows the list as you type and says when nothing matches", async () => {
    render(<AdminSearch navigation={NAVIGATION} />);
    await userEvent.click(screen.getByRole("button", { name: RE_0 }));
    await userEvent.type(await screen.findByRole("combobox"), "bill");
    expect(screen.getByRole("option", { name: "Billing" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "People" })).toBeNull();
    await userEvent.clear(screen.getByRole("combobox"));
    await userEvent.type(screen.getByRole("combobox"), "zzzz");
    expect(screen.getByText("No pages match that search.")).toBeInTheDocument();
  });

  it("navigates to the chosen page", async () => {
    render(<AdminSearch navigation={NAVIGATION} />);
    await userEvent.click(screen.getByRole("button", { name: RE_0 }));
    await userEvent.click(
      await screen.findByRole("option", { name: "Reports" })
    );
    expect(push).toHaveBeenCalledWith("/reports");
  });

  it("includes extra entries that are not in the sidebar", async () => {
    render(
      <AdminSearch
        extraEntries={[
          { group: "Setup", id: "setup", label: "Setup wizard", url: "/setup" },
        ]}
        navigation={NAVIGATION}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: RE_0 }));
    await userEvent.click(
      await screen.findByRole("option", { name: "Setup wizard" })
    );
    expect(push).toHaveBeenCalledWith("/setup");
  });

  it("opens new-tab entries in a new window", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(
      <AdminSearch
        navigation={[
          {
            id: "g",
            items: [
              {
                id: "docs",
                newTab: true,
                title: "Docs",
                url: "https://example.com/docs",
              },
            ],
          },
        ]}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: RE_0 }));
    await userEvent.click(await screen.findByRole("option", { name: "Docs" }));
    expect(open).toHaveBeenCalledWith(
      "https://example.com/docs",
      "_blank",
      "noopener,noreferrer"
    );
    expect(push).not.toHaveBeenCalled();
    open.mockRestore();
  });
});

describe("AdminSearch disabled entries", () => {
  it("does not navigate to a disabled item", async () => {
    render(
      <AdminSearch
        navigation={[
          {
            id: "g",
            items: [
              { disabled: true, id: "p", title: "Payroll", url: "/payroll" },
            ],
          },
        ]}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: RE_0 }));
    const option = await screen.findByRole("option", { name: "Payroll" });
    expect(option).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(option);
    expect(push).not.toHaveBeenCalled();
  });
});
