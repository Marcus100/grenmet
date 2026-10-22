import type { BookingStorefront } from "@barrelsgd/api-client";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Outcome } from "../lib/booking-errors";
import type {
  Booked,
  BookingFlowActions,
  EmailCodeSent,
  EmailProof,
} from "../lib/booking-types";
import { BookingFlow } from "./booking-flow";

const loadSlots = vi.fn<BookingFlowActions["loadSlots"]>();
const submitBooking = vi.fn<BookingFlowActions["submitBooking"]>();
const requestEmailCode = vi.fn<BookingFlowActions["requestEmailCode"]>();
const confirmEmailCode = vi.fn<BookingFlowActions["confirmEmailCode"]>();
const actions: BookingFlowActions = {
  confirmEmailCode,
  loadSlots,
  requestEmailCode,
  submitBooking,
};

const DEPOSIT_ID = "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f6c10";
const FREE_ID = "7a1b0a52-7c12-4c53-9e0f-9d8f2b2f6c11";
const TUE = "2027-01-05T13:30:00Z";
const WED = "2027-01-06T13:30:00Z";
const EMAIL = "ada@example.com";
const SEND = "Email me a verification code";
const BOOK = "Request my booking";
const STILL_LOADING = /Verification is still loading/;
const SENT_TO = /We emailed a 6-digit code to/;
const VERIFIED = /Your email is verified/;
const NO_CODE = /No email code is needed/;
const RESEND_IN = /Resend code in \d+s/;
const RESEND_NOW = /^Resend code$/;
const NEW_CODE = /We sent you a new code/;
const CONFIRM_AGAIN = /confirm your email again/;
const FREE_BROWS = /Free brows/;

const storefront: BookingStorefront = {
  slug: "test-studio",
  display_name: "Test Studio",
  timezone: "America/Grenada",
  currency: "XCD",
  cancel_cutoff_hours: 24,
  providers: [],
  services: [
    {
      id: DEPOSIT_ID,
      name: "Deposit lashes",
      category: "Lashes",
      description: null,
      duration_min: 135,
      price_minor: 22_500,
      deposit_minor: 5000,
    },
    {
      id: FREE_ID,
      name: "Free brows",
      category: "Brows",
      description: null,
      duration_min: 30,
      price_minor: 3000,
      deposit_minor: 0,
    },
  ],
};

const slots = {
  ok: true as const,
  data: {
    timezone: "America/Grenada",
    slots: [
      { starts_at: TUE, ends_at: "2027-01-05T15:45:00Z" },
      { starts_at: WED, ends_at: "2027-01-06T15:45:00Z" },
    ],
  },
};

const booked: Outcome<Booked> = {
  ok: true,
  data: {
    manageToken: "tok",
    booking: {
      id: "b1",
      status: "pending",
      service_id: DEPOSIT_ID,
      service_name: "Deposit lashes",
      provider_id: "p1",
      provider_name: "Jeriann",
      starts_at: TUE,
      ends_at: "2027-01-05T15:45:00Z",
      timezone: "America/Grenada",
      customer_name: "Ada Lovelace",
      price_minor: 22_500,
      deposit_minor: 5000,
      currency: "XCD",
      cancel_cutoff_hours: 24,
      can_cancel: true,
    },
  },
};

const sent: Outcome<EmailCodeSent> = {
  ok: true,
  data: { required: true, expiresInSeconds: 600 },
};
const proof: Outcome<EmailProof> = {
  ok: true,
  data: { proof: "proof-1", expiresInSeconds: 900 },
};

type User = ReturnType<typeof userEvent.setup>;

function renderFlow(siteKey = "") {
  return render(
    <BookingFlow
      actions={actions}
      contact={{ href: "https://example.test/dm", label: "Instagram" }}
      managePath="/booking"
      storefront={storefront}
      studioName="Test Studio"
      turnstileSiteKey={siteKey}
    />
  );
}

function clock() {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  return userEvent.setup({
    advanceTimers: (ms) => vi.advanceTimersByTime(ms),
  });
}

async function fill(user: User, service = "Deposit lashes") {
  await user.click(screen.getByRole("radio", { name: new RegExp(service) }));
  await user.click(await screen.findByRole("radio", { name: "9:30 am" }));
  await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
  await user.type(screen.getByLabelText("Email"), EMAIL);
}

async function openCodeStep(user: User) {
  await fill(user);
  await user.click(screen.getByRole("button", { name: SEND }));
  return await screen.findByLabelText("Verification code");
}

async function verify(user: User, code = "123456") {
  const input = await openCodeStep(user);
  await user.type(input, code);
  await user.click(screen.getByRole("button", { name: "Verify code" }));
}

beforeEach(() => {
  vi.resetAllMocks();
  loadSlots.mockResolvedValue(slots);
  requestEmailCode.mockResolvedValue(sent);
  confirmEmailCode.mockResolvedValue(proof);
  submitBooking.mockResolvedValue(booked);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("BookingFlow emailed code", () => {
  it("asks for a code, not a booking, when a deposit is due", async () => {
    const user = userEvent.setup();
    renderFlow();
    const input = await openCodeStep(user);

    expect(requestEmailCode).toHaveBeenCalledWith({
      serviceId: DEPOSIT_ID,
      startsAt: TUE,
      email: EMAIL,
      turnstileToken: "",
    });
    expect(submitBooking).not.toHaveBeenCalled();
    expect(screen.getByText(SENT_TO)).toHaveTextContent(EMAIL);
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    expect(input).toHaveFocus();
    expect(screen.queryByRole("button", { name: BOOK })).toBeNull();
  });

  it("sends the proof from a correct code with the booking", async () => {
    const user = userEvent.setup();
    renderFlow();
    await verify(user);

    expect(confirmEmailCode).toHaveBeenCalledWith({
      code: "123456",
      email: EMAIL,
      serviceId: DEPOSIT_ID,
      startsAt: TUE,
    });
    expect(await screen.findByText(VERIFIED)).toBeVisible();
    expect(screen.queryByLabelText("Verification code")).toBeNull();

    await user.click(screen.getByRole("button", { name: BOOK }));
    await waitFor(() => expect(submitBooking).toHaveBeenCalledTimes(1));
    expect(submitBooking.mock.calls[0]?.[0]).toMatchObject({
      emailProof: "proof-1",
      serviceId: DEPOSIT_ID,
      startsAt: TUE,
    });
    expect(
      await screen.findByRole("heading", { name: "Thank you, Ada" })
    ).toBeVisible();
  });

  it("accepts a pasted code with spaces and checks six digits locally", async () => {
    const user = userEvent.setup();
    renderFlow();
    const input = await openCodeStep(user);

    await user.type(input, "12");
    await user.click(screen.getByRole("button", { name: "Verify code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter the 6-digit code"
    );
    expect(confirmEmailCode).not.toHaveBeenCalled();

    await user.clear(input);
    await user.click(input);
    await user.paste("123 456");
    expect(input).toHaveValue("123456");
  });

  it("verifies when Enter is pressed in the code field", async () => {
    const user = userEvent.setup();
    renderFlow();
    const input = await openCodeStep(user);
    await user.type(input, "123456{Enter}");
    expect(await screen.findByText(VERIFIED)).toBeVisible();
    expect(submitBooking).not.toHaveBeenCalled();
  });

  it("explains a wrong or expired code, clears it and allows another try", async () => {
    const user = userEvent.setup();
    confirmEmailCode.mockResolvedValueOnce({
      ok: false,
      code: "code_rejected",
      message: "That code isn't right, or it has expired.",
    });
    renderFlow();
    await verify(user, "000000");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("isn't right, or it has expired");
    const input = screen.getByLabelText("Verification code");
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(submitBooking).not.toHaveBeenCalled();

    await user.type(input, "123456");
    await user.click(screen.getByRole("button", { name: "Verify code" }));
    expect(await screen.findByText(VERIFIED)).toBeVisible();
  });

  it("tells the visitor when and why they are locked out", async () => {
    const user = userEvent.setup();
    confirmEmailCode.mockResolvedValue({
      ok: false,
      code: "code_locked",
      message: "Too many wrong codes. Locked for about 15 minutes.",
    });
    renderFlow();
    await verify(user, "111111");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "about 15 minutes"
    );
    expect(submitBooking).not.toHaveBeenCalled();
  });

  it("shows a calm message when the confirm call cannot be reached", async () => {
    const user = userEvent.setup();
    confirmEmailCode.mockRejectedValue(new Error("offline"));
    renderFlow();
    await verify(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "nothing was sent"
    );
  });

  it("does not blame the visitor when the email could not be sent", async () => {
    const user = userEvent.setup();
    requestEmailCode.mockResolvedValue({
      ok: false,
      code: "code_send_failed",
      message:
        "We couldn't send the email. This may be a problem on our side, not yours.",
    });
    renderFlow();
    await fill(user);
    await user.click(screen.getByRole("button", { name: SEND }));

    expect(await screen.findByRole("alert")).toHaveTextContent("not yours");
    expect(screen.queryByLabelText("Verification code")).toBeNull();
    expect(screen.getByRole("button", { name: SEND })).toBeEnabled();
  });

  it("resends only after the cooldown and says a new code was sent", async () => {
    const user = clock();
    renderFlow();
    await openCodeStep(user);

    expect(screen.getByRole("button", { name: RESEND_IN })).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(31_000));
    const ready = screen.getByRole("button", { name: RESEND_NOW });
    expect(ready).toBeEnabled();

    await user.click(ready);
    expect(requestEmailCode).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(NEW_CODE)).toBeVisible();
    expect(screen.getByRole("button", { name: RESEND_IN })).toBeDisabled();
  });

  it("shows a resend limit as a calm message beside the code box", async () => {
    const user = clock();
    renderFlow();
    await openCodeStep(user);
    await act(() => vi.advanceTimersByTimeAsync(31_000));
    requestEmailCode.mockResolvedValue({
      ok: false,
      code: "code_limited",
      message: "We can't send another code just yet.",
    });
    await user.click(screen.getByRole("button", { name: RESEND_NOW }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "can't send another code"
    );
    expect(screen.getByLabelText("Verification code")).toBeVisible();
  });

  it("returns to the email field with Change email", async () => {
    const user = userEvent.setup();
    renderFlow();
    await openCodeStep(user);
    await user.click(screen.getByRole("button", { name: "Change email" }));

    expect(screen.queryByLabelText("Verification code")).toBeNull();
    expect(screen.getByLabelText("Email")).toHaveFocus();
    expect(screen.getByRole("button", { name: SEND })).toBeVisible();
  });

  it("drops the proof when the slot changes", async () => {
    const user = userEvent.setup();
    renderFlow();
    await verify(user);
    expect(await screen.findByText(VERIFIED)).toBeVisible();

    await user.click(screen.getByRole("radio", { name: "Wed 6 Jan" }));
    await user.click(await screen.findByRole("radio", { name: "9:30 am" }));

    expect(screen.queryByText(VERIFIED)).toBeNull();
    await user.click(screen.getByRole("button", { name: SEND }));
    expect(requestEmailCode).toHaveBeenLastCalledWith(
      expect.objectContaining({ startsAt: WED })
    );
    expect(submitBooking).not.toHaveBeenCalled();
  });

  it("drops the proof when the email or the service changes", async () => {
    const user = userEvent.setup();
    renderFlow();
    await verify(user);
    expect(await screen.findByText(VERIFIED)).toBeVisible();

    await user.type(screen.getByLabelText("Email"), "x");
    expect(screen.queryByText(VERIFIED)).toBeNull();
    expect(screen.getByRole("button", { name: SEND })).toBeVisible();

    await user.click(screen.getByRole("radio", { name: FREE_BROWS }));
    expect(screen.queryByText(VERIFIED)).toBeNull();
    expect(screen.queryByRole("button", { name: SEND })).toBeNull();
  });

  it("has no code step when the service has no deposit", async () => {
    const user = userEvent.setup();
    renderFlow();
    await fill(user, "Free brows");
    await user.click(screen.getByRole("button", { name: BOOK }));

    await waitFor(() => expect(submitBooking).toHaveBeenCalledTimes(1));
    expect(requestEmailCode).not.toHaveBeenCalled();
    expect(submitBooking.mock.calls[0]?.[0].emailProof).toBeUndefined();
  });

  it("skips the step when the API says no code is required", async () => {
    const user = userEvent.setup();
    requestEmailCode.mockResolvedValue({
      ok: true,
      data: { required: false, expiresInSeconds: 0 },
    });
    renderFlow();
    await fill(user);
    await user.click(screen.getByRole("button", { name: SEND }));

    expect(await screen.findByText(NO_CODE)).toBeVisible();
    expect(screen.queryByLabelText("Verification code")).toBeNull();
    await user.click(screen.getByRole("button", { name: BOOK }));
    await waitFor(() => expect(submitBooking).toHaveBeenCalledTimes(1));
    expect(submitBooking.mock.calls[0]?.[0].emailProof).toBeUndefined();
    expect(confirmEmailCode).not.toHaveBeenCalled();
  });

  it("forces the code step when a stale page shows no deposit but the API wants a code", async () => {
    const user = userEvent.setup();
    submitBooking.mockResolvedValueOnce({
      ok: false,
      code: "email_unverified",
      message: "We need to confirm your email again.",
    });
    renderFlow();
    await fill(user, "Free brows");
    await user.click(screen.getByRole("button", { name: BOOK }));
    expect(await screen.findByText(CONFIRM_AGAIN)).toBeVisible();

    await user.click(screen.getByRole("button", { name: SEND }));
    expect(requestEmailCode).toHaveBeenCalledTimes(1);
    expect(submitBooking).toHaveBeenCalledTimes(1);
    expect(await screen.findByLabelText("Verification code")).toBeVisible();
  });

  it("sends the visitor back to the code step when the proof is refused", async () => {
    const user = userEvent.setup();
    submitBooking.mockResolvedValueOnce({
      ok: false,
      code: "email_unverified",
      message: "We need to confirm your email again.",
    });
    renderFlow();
    await verify(user);
    await user.click(await screen.findByRole("button", { name: BOOK }));

    expect(await screen.findByText(CONFIRM_AGAIN)).toBeVisible();
    expect(screen.queryByText(VERIFIED)).toBeNull();
    await user.click(screen.getByRole("button", { name: SEND }));
    expect(requestEmailCode).toHaveBeenCalledTimes(2);
  });
});

describe("BookingFlow emailed code and Turnstile", () => {
  const widget = {
    callback: null as null | ((token: string) => void),
    count: 0,
  };

  beforeEach(() => {
    widget.callback = null;
    widget.count = 0;
    window.turnstile = {
      remove: vi.fn(),
      render: (_element, options) => {
        widget.callback = options.callback;
        options.callback("token-0");
        return "w1";
      },
      reset: () => {
        widget.count += 1;
        const token = `token-${widget.count}`;
        queueMicrotask(() => widget.callback?.(token));
      },
    };
  });

  afterEach(() => {
    window.turnstile = undefined;
  });

  it("uses a fresh Turnstile token for the code request, the resend and the booking", async () => {
    const user = clock();
    renderFlow("site-key");
    await waitFor(() => expect(widget.callback).not.toBeNull());
    await fill(user);
    await user.click(screen.getByRole("button", { name: SEND }));
    await screen.findByLabelText("Verification code");
    expect(requestEmailCode.mock.calls[0]?.[0].turnstileToken).toBe("token-0");

    await act(() => vi.advanceTimersByTimeAsync(31_000));
    await user.click(screen.getByRole("button", { name: RESEND_NOW }));
    expect(requestEmailCode.mock.calls[1]?.[0].turnstileToken).toBe("token-1");

    await user.type(screen.getByLabelText("Verification code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify code" }));
    await user.click(await screen.findByRole("button", { name: BOOK }));
    await waitFor(() => expect(submitBooking).toHaveBeenCalledTimes(1));
    expect(submitBooking.mock.calls[0]?.[0].turnstileToken).toBe("token-2");
  });

  it("waits for the widget instead of sending an empty token", async () => {
    const user = userEvent.setup();
    window.turnstile = {
      remove: vi.fn(),
      render: () => "w1",
      reset: vi.fn(),
    };
    renderFlow("site-key");
    await fill(user);
    await user.click(screen.getByRole("button", { name: SEND }));

    expect(await screen.findByText(STILL_LOADING)).toBeVisible();
    expect(requestEmailCode).not.toHaveBeenCalled();
  });
});
