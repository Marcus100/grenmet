import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sessionOrNull } from "@/lib/signed-in-visitor";
import { AccountControl } from "./account-control";

vi.mock("@/env", () => ({
  env: { ACCOUNT_APP_URL: "https://account.example.test" },
}));
vi.mock("@/lib/signed-in-visitor", () => ({
  SIGN_OUT_ACTION: "/auth/logout",
  sessionOrNull: vi.fn(),
}));

const SESSION = {
  accessToken: "token",
  email: "ada@example.test",
  fullName: "Ada Lovelace",
  name: "Ada Lovelace",
};

beforeEach(() => {
  vi.mocked(sessionOrNull).mockReset();
});

describe("bookings account control", () => {
  it("shows Sign in to a signed-out visitor, returning to the home page", async () => {
    vi.mocked(sessionOrNull).mockResolvedValue(null);
    render(await AccountControl({}));
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/signin?returnTo=%2F"
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the account menu to a signed-in person", async () => {
    vi.mocked(sessionOrNull).mockResolvedValue(SESSION);
    render(await AccountControl({ className: "fixed" }));
    expect(
      screen.getByRole("button", { name: "Account menu for Ada Lovelace" })
    ).toHaveClass("fixed");
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });

  it("uses the email as the name when the account has none", async () => {
    vi.mocked(sessionOrNull).mockResolvedValue({
      ...SESSION,
      fullName: "",
      name: "ada@example.test",
    });
    render(await AccountControl({}));
    expect(
      screen.getByRole("button", {
        name: "Account menu for ada@example.test",
      })
    ).toBeInTheDocument();
  });
});
