import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException }));

import AdminError from "./error";

const REFERENCE = /Reference:/;

describe("AdminError", () => {
  it("reports the error with its digest and lets the user retry", () => {
    const retry = vi.fn();
    const error = Object.assign(new Error("An error occurred"), {
      digest: "abc123",
    });
    render(<AdminError error={error} retry={retry} />);

    expect(captureException).toHaveBeenCalledWith(error, {
      tags: { digest: "abc123" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Reference: abc123");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("omits the reference line for client errors without a digest", () => {
    render(<AdminError error={new Error("boom")} retry={vi.fn()} />);
    expect(screen.queryByText(REFERENCE)).not.toBeInTheDocument();
  });
});
