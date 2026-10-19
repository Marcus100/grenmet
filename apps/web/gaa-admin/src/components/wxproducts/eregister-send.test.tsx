import type { ObservationSend } from "@barrelsgd/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  email: vi.fn(),
  list: vi.fn(),
  publish: vi.fn(),
}));

vi.mock("@barrelsgd/api-client", () => ({
  eregisterEmailRegisterObservation: mocks.email,
  eregisterListObservationSends: mocks.list,
  eregisterPublishRegisterObservation: mocks.publish,
}));

import { describeSends, useObservationSends } from "./eregister-send";
import { ERegisterWorkbook } from "./eregister-workbook";

const EMAIL_BUTTON = /Email observation/;
const WIS2_BUTTON = /Send last obs/;
const EMAIL_PROMPT = /Email this observation/;
const WIS2_PROMPT = /through wis2box/;
const REPEAT_PROMPT = /already sent to this target/;
const OBSERVATION = "11111111-1111-4111-8111-111111111111";

function send(overrides: Partial<ObservationSend>): ObservationSend {
  return {
    attempts: 0,
    id: "22222222-2222-4222-8222-222222222222",
    observation_id: OBSERVATION,
    queued_at: "2026-10-18T12:03:10",
    status: "queued",
    target: "email",
    ...overrides,
  };
}

describe("describeSends", () => {
  it("is empty before anything is sent", () => {
    expect(describeSends([])).toBe("");
  });

  it("summarises an email and a WIS2 hand-off in UTC", () => {
    expect(
      describeSends([
        send({ target: "wis2" }),
        send({
          recipients: 3,
          sent_at: "2026-10-18T12:03:40",
          status: "sent",
        }),
      ])
    ).toBe("Emailed 12:03Z to 3 · Queued for WIS2 12:03Z");
  });

  it("reports failures and queued mail", () => {
    expect(
      describeSends([
        send({ recipients: 2 }),
        send({ status: "failed", target: "wis2" }),
      ])
    ).toBe("Email queued 12:03Z to 2 · WIS2 failed 12:03Z");
  });
});

function Harness({
  ensureSaved,
}: {
  ensureSaved: () => Promise<string | null>;
}) {
  const controller = useObservationSends(ensureSaved);
  return (
    <ERegisterWorkbook
      issues={[]}
      metarPreview="TGPY"
      observedAt="2026-10-18T12:00"
      onBack={vi.fn()}
      onSubmit={vi.fn()}
      onValidate={vi.fn()}
      onValidationIssuesChange={vi.fn()}
      onValidationStateChange={vi.fn()}
      onValueChange={vi.fn()}
      saveStatus="idle"
      send={controller}
      station={{
        icao: "TGPY",
        name: "Maurice Bishop International Airport",
        number: "78958",
        observer: "Observer",
        position: "12.0°N · 61.47°W",
      }}
      validationStatus="valid"
      values={{ report_type: "AAXX" }}
    />
  );
}

const ok = (overrides: Partial<ObservationSend>) => ({
  data: send(overrides),
  error: undefined,
});

const emailButton = () => screen.getByRole("button", { name: EMAIL_BUTTON });
const confirmButton = () => screen.getByRole("button", { name: "Confirm" });

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    mock.mockReset();
  }
  mocks.list.mockResolvedValue({ data: { sends: [] }, error: undefined });
});

describe("send actions", () => {
  it("asks before emailing and can be cancelled", () => {
    const ensureSaved = vi.fn();
    render(<Harness ensureSaved={ensureSaved} />);
    fireEvent.click(emailButton());
    expect(screen.getByText(EMAIL_PROMPT)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(EMAIL_PROMPT)).toBeNull();
    expect(ensureSaved).not.toHaveBeenCalled();
    expect(mocks.email).not.toHaveBeenCalled();
  });

  it("saves, emails, shows pending and then the history line", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    mocks.email.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    const ensureSaved = vi.fn().mockResolvedValue(OBSERVATION);
    render(<Harness ensureSaved={ensureSaved} />);
    fireEvent.click(emailButton());
    fireEvent.click(confirmButton());

    await waitFor(() => expect(screen.getByText("Sending…")).toBeTruthy());
    await waitFor(() => expect(mocks.email).toHaveBeenCalledTimes(1));
    expect(mocks.email.mock.calls[0]?.[0]).toMatchObject({
      body: { resend: false },
      path: { observation_id: OBSERVATION },
    });

    const sent = send({
      recipients: 3,
      sent_at: "2026-10-18T12:03:30",
      status: "sent",
    });
    mocks.list.mockResolvedValue({ data: { sends: [sent] }, error: undefined });
    resolve(ok({ recipients: 3, status: "queued" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("Emailed 12:03Z to 3")
    );
    expect(screen.queryByText("Sending…")).toBeNull();
  });

  it("queues for WIS2", async () => {
    mocks.publish.mockResolvedValue(ok({ target: "wis2" }));
    mocks.list.mockResolvedValue({
      data: { sends: [send({ target: "wis2" })] },
      error: undefined,
    });
    render(<Harness ensureSaved={vi.fn().mockResolvedValue(OBSERVATION)} />);
    fireEvent.click(screen.getByRole("button", { name: WIS2_BUTTON }));
    expect(screen.getByText(WIS2_PROMPT)).toBeTruthy();
    fireEvent.click(confirmButton());
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(
        "Queued for WIS2 12:03Z"
      )
    );
    expect(mocks.email).not.toHaveBeenCalled();
  });

  it("shows the server's reason when sending is refused", async () => {
    mocks.email.mockResolvedValue({
      data: undefined,
      error: { detail: "No recipients configured" },
    });
    render(<Harness ensureSaved={vi.fn().mockResolvedValue(OBSERVATION)} />);
    fireEvent.click(emailButton());
    fireEvent.click(confirmButton());
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "No recipients configured"
      )
    );
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
  });

  it("asks again before resending and then sends with resend", async () => {
    mocks.email
      .mockResolvedValueOnce({
        data: undefined,
        error: {
          detail:
            "This observation was already emailed. Send again with resend=true.",
        },
      })
      .mockResolvedValueOnce(ok({ recipients: 2 }));
    render(<Harness ensureSaved={vi.fn().mockResolvedValue(OBSERVATION)} />);
    fireEvent.click(emailButton());
    fireEvent.click(confirmButton());
    await waitFor(() => expect(screen.getByText(REPEAT_PROMPT)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Send again" }));
    await waitFor(() => expect(mocks.email).toHaveBeenCalledTimes(2));
    expect(mocks.email.mock.calls[1]?.[0]).toMatchObject({
      body: { resend: true },
    });
  });

  it("does not send when the workbook cannot be saved", async () => {
    render(<Harness ensureSaved={vi.fn().mockResolvedValue(null)} />);
    fireEvent.click(emailButton());
    fireEvent.click(confirmButton());
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Fix the errors")
    );
    expect(mocks.email).not.toHaveBeenCalled();
  });
});
