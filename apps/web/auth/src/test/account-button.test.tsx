// @vitest-environment jsdom
import { AccountButton } from "@barrelsgd/ui/components/account-button";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/forecast/today" }));

function respond(body: unknown) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json(body) as Response);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AccountButton", () => {
  it("offers Sign in that comes back to the current page", async () => {
    respond({ signedIn: false });
    render(<AccountButton appLabel="Grenada Meteorological Service" />);
    const link = await screen.findByRole("link", { name: "Sign in" });
    expect(link.getAttribute("href")).toBe(
      "/auth/start?returnTo=%2Fforecast%2Ftoday"
    );
  });

  it("names the account and says once which account signed in", async () => {
    respond({
      signedIn: true,
      name: "Kezia Mitchell",
      email: "kezia@example.com",
      accountUrl: "https://auth.barrels.gd",
      notice: true,
    });
    render(<AccountButton appLabel="Grenada Meteorological Service" />);
    expect(
      await screen.findByRole("button", { name: "Account: Kezia Mitchell" })
    ).toBeTruthy();
    const notice = screen.getByRole("status");
    expect(notice.textContent).toContain(
      "signed in to Grenada Meteorological Service with your Barrels account"
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("treats an unreachable status route as signed out", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    render(<AccountButton appLabel="Signal" />);
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy()
    );
  });
});
