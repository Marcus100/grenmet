import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AccountSlot } from "./account-slot";

vi.mock("@barrelsgd/ui/components/account-button", () => ({
  AccountButton: ({ appLabel }: { readonly appLabel: string }) => (
    <button type="button">{appLabel}</button>
  ),
}));

afterEach(cleanup);

it("loads the account button on demand and renders it with the app label", async () => {
  render(<AccountSlot appLabel="Sign in" />);
  expect(
    await screen.findByRole("button", { name: "Sign in" })
  ).toBeInTheDocument();
});
