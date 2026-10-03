import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException }));

import RouteError from "./error";

it("reports the error with its digest and retries on request", () => {
  const retry = vi.fn();
  const error = Object.assign(new Error("An error occurred"), {
    digest: "d1",
  });
  render(<RouteError error={error} retry={retry} />);
  expect(captureException).toHaveBeenCalledWith(error, {
    tags: { digest: "d1" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledOnce();
});
