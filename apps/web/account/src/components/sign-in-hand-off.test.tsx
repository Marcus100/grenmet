import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SignInHandOff } from "./sign-in-hand-off";

const START = "/auth/start?returnTo=%2Fbookings";

describe("SignInHandOff", () => {
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
