import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("@barrelsgd/api-client", () => ({
  eregisterListRegisterObservations: mocks.list,
  eregisterCreateRegisterObservation: vi.fn(),
  eregisterValidateSynopObservation: vi.fn(),
  eregisterEmailRegisterObservation: vi.fn(),
  eregisterPublishRegisterObservation: vi.fn(),
  eregisterListObservationSends: vi.fn(),
  eregisterAcceptRegisterObservation: vi.fn(),
  eregisterRejectRegisterObservation: vi.fn(),
  eregisterReopenRegisterObservation: vi.fn(),
}));
vi.mock("@barrelsgd/auth", () => ({
  useSessionUser: () => ({
    full_name: "Test Observer",
    email: "obs@test",
    id: "user-me",
  }),
}));

import { ERegister } from "./eregister";

const UNAVAILABLE_NOTE = /The eRegister service is unavailable/;
const NO_ACCESS_NOTE = /Ask an administrator for the eRegister observer role/;
const DAILY_NOTE = /Daily summaries are not connected/;

// Sample rows the page used to show as if they were recorded.
const SAMPLE_TEXT = /AAXX 07234|AAXX 07224|Sample data|Recorded/;

beforeEach(() => {
  mocks.list.mockReset();
});

it("shows loading placeholders and no sample rows while the read is pending", () => {
  mocks.list.mockReturnValue(new Promise(() => undefined));
  render(<ERegister />);

  expect(screen.getByText("Loading…")).toBeTruthy();
  expect(screen.getByText("Loading SYNOP reports…")).toBeTruthy();
  expect(document.body.textContent).not.toMatch(SAMPLE_TEXT);
});

it("shows an error state, never sample observations, when the register is unavailable", async () => {
  mocks.list.mockResolvedValue({ data: undefined, error: { detail: "down" } });
  render(<ERegister />);

  await waitFor(() => expect(screen.getByText(UNAVAILABLE_NOTE)).toBeTruthy());
  expect(screen.getByText("Unavailable")).toBeTruthy();
  expect(
    screen.getByText(
      "SYNOP reports are unavailable. The register service did not respond.",
      { exact: false }
    )
  ).toBeTruthy();
  expect(document.body.textContent).not.toMatch(SAMPLE_TEXT);
});

it("says to ask for the observer role when the register refuses the user", async () => {
  mocks.list.mockResolvedValue({
    data: undefined,
    error: { detail: "Insufficient permission for this operation" },
    response: { status: 403 },
  });
  render(<ERegister />);

  await waitFor(() => expect(screen.getByText(NO_ACCESS_NOTE)).toBeTruthy());
  expect(screen.getByText("No register access")).toBeTruthy();
  expect(screen.queryByText(UNAVAILABLE_NOTE)).toBeNull();
  expect(document.body.textContent).not.toMatch(SAMPLE_TEXT);
});

it("says no observations are saved when the live read is empty", async () => {
  mocks.list.mockResolvedValue({
    data: { observations: [] },
    error: undefined,
  });
  render(<ERegister />);

  await waitFor(() =>
    expect(screen.getByText("No saved observations yet")).toBeTruthy()
  );
  expect(screen.getByText("No SYNOP reports recorded.")).toBeTruthy();
  expect(document.body.textContent).not.toMatch(SAMPLE_TEXT);
  expect(screen.getByText(DAILY_NOTE)).toBeTruthy();
});
