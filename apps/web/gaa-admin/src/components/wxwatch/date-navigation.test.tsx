import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTodayUTC } from "@/lib/wxwatch/utils";
import { DateNavigation } from "./date-navigation";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

afterEach(cleanup);
beforeEach(() => push.mockClear());

describe("wxwatch date navigation", () => {
  it("steps whole UTC days and stops at today", async () => {
    const user = userEvent.setup();
    render(<DateNavigation currentDate={new Date("2026-09-01T00:00:00Z")} />);

    await user.click(screen.getByRole("button", { name: "Previous day" }));
    expect(push).toHaveBeenCalledWith("/wxwatch/2026/08/31");

    await user.click(screen.getByRole("button", { name: "Next day" }));
    expect(push).toHaveBeenCalledWith("/wxwatch/2026/09/02");

    cleanup();
    render(<DateNavigation currentDate={getTodayUTC()} />);
    expect(screen.getByRole("button", { name: "Next day" })).toBeDisabled();
  });

  it("navigates to the day picked in the calendar", async () => {
    const user = userEvent.setup();
    render(<DateNavigation currentDate={new Date("2026-09-09T00:00:00Z")} />);

    await user.click(screen.getByRole("button", { name: "09 Sept 2026" }));
    const day = await screen.findByRole("button", {
      name: "Friday, September 4th, 2026",
    });
    await user.click(day);

    expect(push).toHaveBeenCalledWith("/wxwatch/2026/09/04");
  });
});
