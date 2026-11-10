import type { RegisterObservationRead } from "@barrelsgd/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  override: vi.fn(),
}));

vi.mock("@barrelsgd/api-client", () => ({
  eregisterOverrideRegisterObservationBufr: mocks.override,
  useAuthGetEffectiveAccess: () => mocks.access(),
}));

import {
  BufrCheck,
  bufrOverride,
  bufrProblem,
} from "./eregister-bufr-override";

const ME = "user-me";
const OTHER = "user-other";
const ID = "11111111-1111-4111-8111-111111111111";

const REVIEWER = {
  data: { is_superuser: false, permission_keys: ["eregister.qc"] },
};
const SENDER_ONLY = {
  data: { is_superuser: false, permission_keys: ["eregister.send"] },
};
const SUPERUSER = { data: { is_superuser: true, permission_keys: [] } };

const MISMATCH = "air_temperature_k: observation 298.55, BUFR 303.55";
const FAILED_BUFR = {
  base64: "QUJD",
  checks: [],
  errors: [MISMATCH],
  template: "Surface-RA-IV-100",
  valid: false,
};
const OVERRIDE = {
  at: "2026-11-09T10:00:00+00:00",
  by: ME,
  by_name: "Ann Reviewer",
  reason: "Checked against the paper register",
  record_sha256: "abc",
};

const REASON_LABEL = /Reason \(required/u;
const ACTION = /Send anyway \(reviewer\)/u;
const CONFIRM = /Record override and allow sending/u;
const FAILED_TEXT = /BUFR check failed, so this observation cannot be sent/u;
const OVERRIDDEN_TEXT = /Sent-anyway override by Ann Reviewer/u;

function observation(
  overrides: Partial<RegisterObservationRead>
): RegisterObservationRead {
  return {
    actor_id: OTHER,
    actor_name: "Pat Observer",
    bufr: FAILED_BUFR,
    created_at: "2026-11-09T12:01:00",
    id: ID,
    issues: [],
    kind: "SYNOP",
    observed_at: "2026-11-09T12:00:00",
    state: "accepted",
    station_id: "78958",
    updated_at: "2026-11-09T12:01:00",
    ...overrides,
  } as RegisterObservationRead;
}

beforeEach(() => {
  mocks.access.mockReset();
  mocks.override.mockReset();
  mocks.access.mockReturnValue(REVIEWER);
});

describe("bufrProblem and bufrOverride", () => {
  it("reports nothing when the BUFR check passed or there is no SYNOP record", () => {
    expect(
      bufrProblem(observation({ bufr: { valid: true, errors: [] } }))
    ).toBe(null);
    expect(bufrProblem(observation({ bufr: null }))).toBe(null);
    expect(bufrProblem(observation({ kind: "METAR" }))).toBe(null);
  });

  it("gives the first errors in words, with a fallback when none were stored", () => {
    expect(bufrProblem(observation({}))).toBe(MISMATCH);
    expect(
      bufrProblem(observation({ bufr: { valid: false, errors: [] } }))
    ).toBe("the BUFR check did not pass");
  });

  it("reads the stored override and ignores a malformed one", () => {
    expect(
      bufrOverride(
        observation({ bufr: { ...FAILED_BUFR, override: OVERRIDE } })
      )
    ).toEqual({
      at: OVERRIDE.at,
      by_name: "Ann Reviewer",
      reason: OVERRIDE.reason,
    });
    expect(
      bufrOverride(observation({ bufr: { ...FAILED_BUFR, override: "yes" } }))
    ).toBe(null);
  });
});

describe("BufrCheck", () => {
  it("renders nothing when the BUFR check passed", () => {
    const { container } = render(
      <BufrCheck
        observation={observation({ bufr: { valid: true, errors: [] } })}
        onOverridden={vi.fn()}
        userId={ME}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the reason for a failed check", () => {
    render(
      <BufrCheck
        observation={observation({})}
        onOverridden={vi.fn()}
        userId={ME}
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent(FAILED_TEXT);
    expect(screen.getByRole("status")).toHaveTextContent(MISMATCH);
  });

  it("offers the override to a QC reviewer who is not the observer", () => {
    render(
      <BufrCheck
        observation={observation({})}
        onOverridden={vi.fn()}
        userId={ME}
      />
    );
    expect(screen.getByRole("button", { name: ACTION })).toBeInTheDocument();
  });

  it("offers it to a superuser", () => {
    mocks.access.mockReturnValue(SUPERUSER);
    render(
      <BufrCheck
        observation={observation({})}
        onOverridden={vi.fn()}
        userId={ME}
      />
    );
    expect(screen.getByRole("button", { name: ACTION })).toBeInTheDocument();
  });

  it("hides it from the observer, even with QC", () => {
    render(
      <BufrCheck
        observation={observation({ actor_id: ME })}
        onOverridden={vi.fn()}
        userId={ME}
      />
    );
    expect(screen.queryByRole("button", { name: ACTION })).toBeNull();
  });

  it("hides it from staff without the QC permission", () => {
    mocks.access.mockReturnValue(SENDER_ONLY);
    render(
      <BufrCheck
        observation={observation({})}
        onOverridden={vi.fn()}
        userId={ME}
      />
    );
    expect(screen.queryByRole("button", { name: ACTION })).toBeNull();
  });

  it("keeps the confirm button disabled until the reason is 10 characters", () => {
    render(
      <BufrCheck
        observation={observation({})}
        onOverridden={vi.fn()}
        userId={ME}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: ACTION }));
    const confirm = screen.getByRole("button", { name: CONFIRM });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(REASON_LABEL), {
      target: { value: "too short" },
    });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(REASON_LABEL), {
      target: { value: "Checked against the paper register" },
    });
    expect(confirm).toBeEnabled();
  });

  it("records the override with the trimmed reason and reports the updated row", async () => {
    const updated = observation({
      bufr: { ...FAILED_BUFR, override: OVERRIDE },
    });
    mocks.override.mockResolvedValue({ data: updated, error: undefined });
    const onOverridden = vi.fn();
    render(
      <BufrCheck
        observation={observation({})}
        onOverridden={onOverridden}
        userId={ME}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: ACTION }));
    fireEvent.change(screen.getByLabelText(REASON_LABEL), {
      target: { value: "  Checked against the paper register  " },
    });
    fireEvent.click(screen.getByRole("button", { name: CONFIRM }));
    await waitFor(() => expect(onOverridden).toHaveBeenCalledWith(updated));
    expect(mocks.override).toHaveBeenCalledWith({
      body: { reason: "Checked against the paper register" },
      path: { observation_id: ID },
      throwOnError: false,
    });
  });

  it("shows who, when and why for a recorded override, and no action", () => {
    render(
      <BufrCheck
        observation={observation({
          bufr: { ...FAILED_BUFR, override: OVERRIDE },
        })}
        onOverridden={vi.fn()}
        userId={ME}
      />
    );
    expect(screen.getByText(OVERRIDDEN_TEXT)).toHaveTextContent(
      "2026-11-09 10:00 UTC: Checked against the paper register"
    );
    expect(screen.queryByRole("button", { name: ACTION })).toBeNull();
  });

  it("explains a refusal from the server", async () => {
    mocks.override.mockResolvedValue({
      error: { detail: "The observer cannot override the BUFR check" },
      response: { status: 403 },
    });
    render(
      <BufrCheck
        observation={observation({})}
        onOverridden={vi.fn()}
        userId={ME}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: ACTION }));
    fireEvent.change(screen.getByLabelText(REASON_LABEL), {
      target: { value: "Checked against the paper register" },
    });
    fireEvent.click(screen.getByRole("button", { name: CONFIRM }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The observer cannot override the BUFR check"
    );
  });
});
