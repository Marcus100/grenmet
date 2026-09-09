import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveRefresh } from "./live-refresh";

const refresh = vi.fn();
// One stable router object, as the real useRouter returns — a fresh object per
// render would restart the interval on every state update.
const router = { refresh };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeEach(() => {
  refresh.mockClear();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("LiveRefresh", () => {
  it("re-fetches on the interval and stops when paused", () => {
    render(<LiveRefresh intervalMs={1000} />);

    advance(2100);
    expect(refresh).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "Pause auto-refresh" }));
    advance(5000);
    expect(refresh).toHaveBeenCalledTimes(2);

    fireEvent.click(
      screen.getByRole("button", { name: "Resume auto-refresh" })
    );
    advance(1100);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("skips the interval while the tab is hidden, but still refreshes on demand", () => {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    render(<LiveRefresh intervalMs={1000} />);

    advance(3100);
    expect(refresh).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Refresh now" }));
    expect(refresh).toHaveBeenCalledTimes(1);
    hidden.mockRestore();
  });

  it("reports the age of the data it is showing", () => {
    render(<LiveRefresh intervalMs={60_000} />);

    advance(0);
    expect(screen.getByText("Updated just now")).toBeInTheDocument();

    advance(12_000);
    expect(screen.getByText("Updated 12s ago")).toBeInTheDocument();
  });
});
