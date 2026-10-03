import { captureException } from "@sentry/nextjs";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import RouteError from "./error";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("reports unexpected errors and lets the reader retry", async () => {
  const error = new Error("Unavailable");
  const retry = vi.fn();
  render(<RouteError error={error} retry={retry} />);
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(captureException).toHaveBeenCalledWith(error, expect.any(Object));
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledOnce();
});
