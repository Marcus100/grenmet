const demoMessage = /demo.*subscriptions are not open/i;

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { SubscribeBand } from "./subscribe-band";

afterEach(() => vi.unstubAllGlobals());

it("labels the demo and prevents collecting subscriptions", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  render(<SubscribeBand />);
  expect(screen.getByText(demoMessage)).toBeInTheDocument();
  expect(screen.getByLabelText("Email address")).toBeDisabled();
  const button = screen.getByRole("button", { name: "Subscribe" });
  expect(button).toBeDisabled();
  await userEvent.setup().click(button);
  expect(fetchMock).not.toHaveBeenCalled();
});
