import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  correct: vi.fn(),
  create: vi.fn(),
  sends: vi.fn(),
  list: vi.fn(),
  settings: vi.fn(),
  validate: vi.fn(),
}));

vi.mock("@barrelsgd/api-client", () => ({
  eregisterListRegisterObservations: mocks.list,
  eregisterCreateRegisterObservation: mocks.create,
  eregisterValidateSynopObservation: mocks.validate,
  eregisterEmailRegisterObservation: vi.fn(),
  eregisterPublishRegisterObservation: vi.fn(),
  eregisterListObservationSends: mocks.sends,
  eregisterAcceptRegisterObservation: mocks.accept,
  eregisterRejectRegisterObservation: vi.fn(),
  eregisterReopenRegisterObservation: vi.fn(),
  eregisterReviewRegisterObservation: vi.fn(),
  eregisterCorrectRegisterObservation: mocks.correct,
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

const QUEUED = {
  id: "s1",
  queued_at: "2026-11-08T12:00:00Z",
  recipients: 2,
  status: "queued",
  target: "wis2",
};

beforeEach(() => {
  mocks.list.mockReset();
  mocks.settings.mockReset();
  mocks.validate.mockReset();
  mocks.create.mockReset();
  mocks.accept.mockReset();
  mocks.correct.mockReset();
  mocks.sends.mockReset();
  mocks.sends.mockResolvedValue({ data: { sends: [QUEUED] } });
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

// Save and approve on the entry screen.
const SAVED = {
  body: {},
  id: "obs-1",
  kind: "SYNOP",
  observed_at: "2026-11-08T12:00:00Z",
  state: "draft",
};
const ACCEPTED = { ...SAVED, state: "accepted" };
const APPROVED_TEXT = /Approved\. Queued for WIS2/u;
const ONE_NOTE = /1 note/u;
const FIX_ERRORS = /Not approved: fix the errors/u;
const NO_APPROVAL_ACCESS = /Saved as a draft, but you do not have access/u;
const SEND_FAILED =
  /Approved, but a send was not queued: WIS2 is not configured/u;
const NOT_CERTAIN = /not certain whether it was approved/u;
const SAVED_AS_DRAFT = /Not approved\. It is saved as a draft/u;

async function openEntryForm(held: object[] = []) {
  mocks.list.mockResolvedValue({ data: { observations: held } });
  render(<ERegister />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "New observation" })).toBeTruthy()
  );
  fireEvent.click(screen.getByRole("button", { name: "New observation" }));
}

function checked(issues: object[], valid = true) {
  mocks.validate.mockResolvedValue({ data: { issues, valid } });
}

function approve() {
  fireEvent.click(screen.getByRole("button", { name: "Save and approve" }));
}

it("saves and approves in one step when there are no notes", async () => {
  checked([]);
  mocks.create.mockResolvedValue({ data: SAVED });
  mocks.accept.mockResolvedValue({ data: ACCEPTED });
  await openEntryForm();

  approve();

  await waitFor(() => expect(screen.getByText(APPROVED_TEXT)).toBeTruthy());
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.accept).toHaveBeenCalledWith(
    expect.objectContaining({ path: { observation_id: "obs-1" } })
  );
  expect(screen.queryByRole("alertdialog")).toBeNull();
});

it("says so when approved but a send could not be queued", async () => {
  checked([]);
  mocks.create.mockResolvedValue({ data: SAVED });
  mocks.accept.mockResolvedValue({ data: ACCEPTED });
  mocks.sends.mockResolvedValue({
    data: {
      sends: [
        {
          ...QUEUED,
          last_error: "WIS2 is not configured",
          status: "failed",
        },
      ],
    },
  });
  await openEntryForm();

  approve();

  await waitFor(() => expect(screen.getByText(SEND_FAILED)).toBeTruthy());
});

it("asks the observer to confirm when the checks have notes, and waits", async () => {
  checked([
    {
      code: "gust_below_mean",
      field: "wind_gust",
      message: "Gust below the mean wind",
      severity: "warning",
    },
  ]);
  mocks.create.mockResolvedValue({ data: SAVED });
  mocks.accept.mockResolvedValue({ data: ACCEPTED });
  await openEntryForm();

  approve();

  const dialog = await screen.findByRole("alertdialog");
  expect(dialog.textContent).toMatch(ONE_NOTE);
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.accept).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Approve anyway" }));
  await waitFor(() => expect(screen.getByText(APPROVED_TEXT)).toBeTruthy());
  expect(mocks.accept).toHaveBeenCalledTimes(1);
});

it("going back from the confirmation approves nothing", async () => {
  checked([
    { code: "c", field: "wind_gust", message: "A note", severity: "warning" },
  ]);
  await openEntryForm();

  approve();
  await screen.findByRole("alertdialog");
  fireEvent.click(screen.getByRole("button", { name: "Go back" }));

  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.accept).not.toHaveBeenCalled();
});

it("closes the confirmation when the values change, so the notes seen are the notes approved", async () => {
  checked([
    { code: "c", field: "wind_gust", message: "A note", severity: "warning" },
  ]);
  await openEntryForm();

  approve();
  await screen.findByRole("alertdialog");
  const firstInput = screen.getAllByRole("textbox").at(0);
  expect(firstInput).toBeTruthy();
  if (firstInput) fireEvent.change(firstInput, { target: { value: "99" } });

  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(mocks.accept).not.toHaveBeenCalled();
});

it("does not save or approve while the checks have errors", async () => {
  checked(
    [{ code: "c", field: "wind_dir", message: "Bad", severity: "error" }],
    false
  );
  await openEntryForm();

  approve();

  await waitFor(() => expect(screen.getByText(FIX_ERRORS)).toBeTruthy());
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.accept).not.toHaveBeenCalled();
});

it("says so when the draft is saved but the person may not approve", async () => {
  checked([]);
  mocks.create.mockResolvedValue({ data: SAVED });
  mocks.accept.mockResolvedValue({
    error: { detail: "forbidden" },
    response: { status: 403 },
  });
  await openEntryForm();

  approve();

  await waitFor(() =>
    expect(screen.getByText(NO_APPROVAL_ACCESS)).toBeTruthy()
  );
});

it("a second click while approving makes one approval", async () => {
  checked([]);
  mocks.create.mockResolvedValue({ data: SAVED });
  mocks.accept.mockResolvedValue({ data: ACCEPTED });
  await openEntryForm();

  const button = screen.getByRole("button", { name: "Save and approve" });
  fireEvent.click(button);
  fireEvent.click(button);

  await waitFor(() => expect(screen.getByText(APPROVED_TEXT)).toBeTruthy());
  expect(mocks.accept).toHaveBeenCalledTimes(1);
});

it("treats an unclear accept as approved when the register says so, and never saves a correction on retry", async () => {
  checked([]);
  mocks.create.mockResolvedValue({ data: SAVED });
  mocks.accept.mockResolvedValue({
    error: { detail: "Cannot accept an observation that is accepted" },
    response: { status: 409 },
  });
  await openEntryForm([ACCEPTED]);

  approve();

  await waitFor(() => expect(screen.getByText(APPROVED_TEXT)).toBeTruthy());
  approve();
  await waitFor(() => expect(mocks.sends).toHaveBeenCalledTimes(2));
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.correct).not.toHaveBeenCalled();
  expect(mocks.accept).toHaveBeenCalledTimes(1);
});

it("never leaves the form stuck on Approving when a call throws", async () => {
  checked([]);
  mocks.create.mockResolvedValue({ data: SAVED });
  mocks.accept.mockRejectedValue(new Error("network"));
  await openEntryForm([SAVED]);

  approve();

  await waitFor(() => expect(screen.getByText(SAVED_AS_DRAFT)).toBeTruthy());
  expect(
    (
      screen.getByRole("button", {
        name: "Save and approve",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(false);
});

it("says the outcome is uncertain when even the checks throw", async () => {
  mocks.validate.mockRejectedValue(new Error("network"));
  await openEntryForm();

  approve();

  await waitFor(() => expect(screen.getByText(NOT_CERTAIN)).toBeTruthy());
});

it("saving the draft again after approving does not touch the approved observation", async () => {
  checked([]);
  mocks.create.mockResolvedValue({ data: SAVED });
  mocks.accept.mockResolvedValue({ data: ACCEPTED });
  await openEntryForm();

  approve();
  await waitFor(() => expect(screen.getByText(APPROVED_TEXT)).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

  await waitFor(() => expect(screen.getByText(APPROVED_TEXT)).toBeTruthy());
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.correct).not.toHaveBeenCalled();
});

it("approves the correction when the hour already has an observation", async () => {
  checked([]);
  mocks.create.mockResolvedValue({
    error: { detail: "exists" },
    response: { status: 409 },
  });
  const correction = { ...SAVED, id: "obs-2" };
  mocks.correct.mockResolvedValue({ data: correction });
  mocks.accept.mockResolvedValue({
    data: { ...correction, state: "accepted" },
  });
  await openEntryForm([ACCEPTED]);

  approve();

  await waitFor(() => expect(screen.getByText(APPROVED_TEXT)).toBeTruthy());
  expect(mocks.correct).toHaveBeenCalledTimes(1);
  expect(mocks.accept).toHaveBeenCalledWith(
    expect.objectContaining({ path: { observation_id: "obs-2" } })
  );
});
