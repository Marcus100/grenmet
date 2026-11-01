// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ activateAccount: vi.fn() }));

import { ActivationForm } from "./activation-form";

const EXPIRES_TEXT = /expires within 24 hours/;
const STAFF_TEXT = /administrator has confirmed your identity/;
afterEach(cleanup);
it("reads the fragment without sending the secret in the page URL and removes it from history", async () => {
  window.history.replaceState(
    null,
    "",
    "/activate#token=private-onboarding-token"
  );
  render(
    <StrictMode>
      <ActivationForm />
    </StrictMode>
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Activate account" })
    ).toBeInTheDocument()
  );
  expect(window.location.hash).toBe("");
  expect(document.querySelector('input[name="token"]')).toHaveValue(
    "private-onboarding-token"
  );
  expect(screen.getByLabelText("Your password")).toHaveAttribute(
    "autocomplete",
    "new-password"
  );
});
it("explains missing activation links", async () => {
  window.history.replaceState(null, "", "/activate");
  render(
    <StrictMode>
      <ActivationForm />
    </StrictMode>
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "complete activation link"
  );
  expect(
    screen.queryByRole("button", { name: "Activate account" })
  ).not.toBeInTheDocument();
});

it("gives a sign-in setup link its own plain wording", async () => {
  window.history.replaceState(
    null,
    "",
    "/activate#token=private-setup-token&purpose=sign-in-setup"
  );
  render(
    <StrictMode>
      <ActivationForm />
    </StrictMode>
  );
  expect(
    await screen.findByRole("button", { name: "Save password" })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Choose your password" })
  ).toBeInTheDocument();
  expect(screen.getByText(EXPIRES_TEXT)).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Activate account" })
  ).not.toBeInTheDocument();
  expect(screen.queryByText(STAFF_TEXT)).not.toBeInTheDocument();
});
