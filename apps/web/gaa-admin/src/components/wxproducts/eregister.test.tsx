import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  settings: vi.fn(),
  validate: vi.fn(),
}));

vi.mock("@barrelsgd/api-client", () => ({
  eregisterListRegisterObservations: mocks.list,
  eregisterCreateRegisterObservation: vi.fn(),
  eregisterValidateSynopObservation: mocks.validate,
  eregisterEmailRegisterObservation: vi.fn(),
  eregisterPublishRegisterObservation: vi.fn(),
  eregisterListObservationSends: vi.fn(),
  eregisterAcceptRegisterObservation: vi.fn(),
  eregisterRejectRegisterObservation: vi.fn(),
  eregisterReopenRegisterObservation: vi.fn(),
  eregisterReviewRegisterObservation: vi.fn(),
  eregisterCorrectRegisterObservation: vi.fn(),
  eregisterGetStationSettings: mocks.settings,
  eregisterPutStationSettings: vi.fn(),
}));
vi.mock("@barrelsgd/auth", () => ({
  useSessionUser: () => ({
    full_name: "Test Observer",
    email: "obs@test",
    id: "user-me",
  }),
}));

import { ERegister } from "./eregister";

const UNAVAILABLE_NOTE = /The eRegister service is unavailable/u;
const NO_ACCESS_NOTE = /Ask an administrator for the eRegister observer role/u;
const ISO_START = /^\d{4}-\d{2}-\d{2}T/u;
const DAILY_NOTE = /Daily summaries are not connected/u;

// Sample rows the page used to show as if they were recorded.
const SAMPLE_TEXT = /AAXX 07234|AAXX 07224|Sample data|Recorded/u;

beforeEach(() => {
  mocks.list.mockReset();
  mocks.settings.mockReset();
  mocks.validate.mockReset();
  mocks.settings.mockReturnValue(new Promise(() => undefined));
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

it("names the missing pressure amounts for a station without them", async () => {
  mocks.list.mockResolvedValue({
    data: { observations: [] },
    error: undefined,
  });
  mocks.settings.mockResolvedValue({
    data: {
      pending: ["qfe_offset_hpa"],
      qfe_offset_hpa: null,
      qnh_offset_hpa: 0.1,
      sea_level_offset_hpa: 1,
      station_id: "78958",
      total_correction_hpa: 0,
    },
  });
  render(<ERegister />);

  await waitFor(() =>
    expect(screen.getByTestId("pending-settings-note").textContent).toContain(
      "Pending: the QFE amount"
    )
  );
});

it("shows no pending note for 78958, whose amounts are all set", async () => {
  mocks.list.mockResolvedValue({
    data: { observations: [] },
    error: undefined,
  });
  mocks.settings.mockResolvedValue({
    data: {
      pending: [],
      qfe_offset_hpa: 0.3,
      qnh_offset_hpa: 0.1,
      sea_level_offset_hpa: 1,
      station_id: "78958",
      total_correction_hpa: 0,
    },
  });
  render(<ERegister />);

  await waitFor(() => expect(mocks.settings).toHaveBeenCalled());
  await waitFor(() =>
    expect(screen.getByText("No saved observations yet")).toBeTruthy()
  );
  expect(screen.queryByTestId("pending-settings-note")).toBeNull();
});

it("sends the observation time with the check and drops the checked METAR when a value changes", async () => {
  mocks.list.mockResolvedValue({
    data: { observations: [] },
    error: undefined,
  });
  mocks.validate.mockResolvedValue({
    data: {
      valid: true,
      issues: [],
      expected_metar: "METAR TGPY 301200Z 07015KT 9999 NSC 28/21 Q1013=",
    },
  });
  render(<ERegister />);
  fireEvent.click(screen.getByRole("button", { name: "New observation" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Validate observation" })
  );

  await waitFor(() => expect(mocks.validate).toHaveBeenCalledTimes(1));
  const call = mocks.validate.mock.calls[0]?.[0];
  // Without observed_at the server skips the hour-to-hour history.
  expect(call.body.observed_at).toMatch(ISO_START);
  expect(call.body.workbook).toBeTruthy();
  expect(await screen.findByText("Checked")).toBeTruthy();

  fireEvent.change(screen.getByLabelText("Air Temperature (TTT)"), {
    target: { value: "5" },
  });
  expect(screen.queryByText("Checked")).toBeNull();
});
