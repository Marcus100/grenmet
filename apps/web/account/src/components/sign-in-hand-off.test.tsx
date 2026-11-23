import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignInHandOff } from "./sign-in-hand-off";

const START = "/auth/start?returnTo=%2Fbookings";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SignInHandOff", () => {
  it("moves the browser to the sign-in hop with location.replace", () => {
    // jsdom makes window.location.replace non-configurable, so the location
    // object is stubbed for this test and the component reads the stub.
    const replace = vi.fn();
    vi.stubGlobal("location", { ...window.location, replace });

    render(<SignInHandOff href={START} />);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(START);
    vi.unstubAllGlobals();
  });

  it("explains the hop instead of showing a blank page", () => {
    render(<SignInHandOff href={START} />);

    expect(
      screen.getByRole("heading", { name: "Taking you to sign in" })
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "You will come back to this page once you are signed in."
    );
  });

  it("keeps a link to the sign-in hop for when the move does not happen", () => {
    render(<SignInHandOff href={START} />);

    expect(
      screen.getByRole("link", { name: "Continue to sign in" })
    ).toHaveAttribute("href", START);
  });
});
