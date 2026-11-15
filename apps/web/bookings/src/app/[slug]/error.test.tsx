import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BusinessError from "./error";

const CONTACT_BUSINESS = /contact the business directly/u;

describe("business booking error page", () => {
  it("'Try again' calls retry, so the failed fetch runs again", () => {
    const retry = vi.fn();
    render(<BusinessError retry={retry} />);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("says what happened and where to go instead", () => {
    render(<BusinessError retry={vi.fn()} />);
    expect(
      screen.getByRole("heading", { name: "Online booking is taking a break" })
    ).toBeInTheDocument();
    expect(screen.getByText(CONTACT_BUSINESS)).toBeInTheDocument();
  });
});
