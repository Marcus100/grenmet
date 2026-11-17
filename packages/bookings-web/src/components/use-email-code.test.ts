import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Outcome } from "../lib/booking-errors";
import type {
  BookingFlowActions,
  EmailCodeConfirmInput,
  EmailCodeRequestInput,
  EmailCodeSent,
  EmailProof,
} from "../lib/booking-types";
import {
  bindingKey,
  CODE_LENGTH,
  TOKEN_LOADING_MESSAGE,
  useEmailCode,
} from "./use-email-code";

const SERVICE = "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f6c10";
const START = "2027-01-05T13:30:00Z";
const EMAIL = "ada@example.com";
const TOKEN = "turnstile-token-1";
const CODE = "123456";
const PROOF = "proof-abc";
const NETWORK = /We couldn't reach the booking service/u;
const RESENT = /We sent you a new code/u;
const CHECK_DIGITS = /Enter the 6-digit code/u;
const NOTHING_SENT = /nothing was sent/u;

type RequestCode = BookingFlowActions["requestEmailCode"];
type ConfirmCode = BookingFlowActions["confirmEmailCode"];

const sent = (required: boolean): Outcome<EmailCodeSent> => ({
  ok: true,
  data: { expiresInSeconds: 600, required },
});
const proved = (proof: string): Outcome<EmailProof> => ({
  ok: true,
  data: { expiresInSeconds: 300, proof },
});

function setup(overrides: Partial<Parameters<typeof useEmailCode>[0]> = {}) {
  const requestEmailCode = vi.fn<RequestCode>();
  const confirmEmailCode = vi.fn<ConfirmCode>();
  const onFormError = vi.fn<(message: string) => void>();
  const onTokenSpent = vi.fn<() => void>();
  const args = {
    actions: { confirmEmailCode, requestEmailCode },
    email: EMAIL,
    onFormError,
    onTokenSpent,
    serviceId: SERVICE,
    startsAt: START,
    token: TOKEN,
    tokenMissing: false,
    ...overrides,
  };
  const hook = renderHook((props: typeof args) => useEmailCode(props), {
    initialProps: args,
  });
  return {
    ...hook,
    args,
    confirmEmailCode,
    onFormError,
    onTokenSpent,
    requestEmailCode,
  };
}

/** Sends the code and waits for the step to open. */
async function sendCode(
  result: ReturnType<typeof setup>["result"],
  requestEmailCode: ReturnType<typeof setup>["requestEmailCode"]
) {
  requestEmailCode.mockResolvedValueOnce(sent(true));
  await act(async () => {
    await result.current.start();
  });
}

describe("bindingKey", () => {
  it("is null until a service and a slot are both chosen", () => {
    expect(bindingKey(null, START, EMAIL)).toBeNull();
    expect(bindingKey(SERVICE, null, EMAIL)).toBeNull();
  });

  it("ignores surrounding spaces in the email", () => {
    expect(bindingKey(SERVICE, START, `  ${EMAIL} `)).toBe(
      bindingKey(SERVICE, START, EMAIL)
    );
  });
});

describe("useEmailCode", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("sending the code", () => {
    it("asks for a code for the trimmed email, the slot and the Turnstile token", async () => {
      const { result, requestEmailCode } = setup({ email: `  ${EMAIL}  ` });
      requestEmailCode.mockResolvedValueOnce(sent(true));

      await act(async () => {
        await result.current.start();
      });

      const expected: EmailCodeRequestInput = {
        email: EMAIL,
        serviceId: SERVICE,
        startsAt: START,
        turnstileToken: TOKEN,
      };
      expect(requestEmailCode).toHaveBeenCalledTimes(1);
      expect(requestEmailCode).toHaveBeenCalledWith(expected);
      expect(result.current.stepOpen).toBe(true);
      expect(result.current.isVerified).toBe(false);
    });

    it("gives the Turnstile token up once the request is over", async () => {
      const { result, requestEmailCode, onTokenSpent } = setup();
      requestEmailCode.mockResolvedValueOnce(sent(true));

      await act(async () => {
        await result.current.start();
      });

      expect(onTokenSpent).toHaveBeenCalledTimes(1);
    });

    it("does not send anything without a chosen service and slot", async () => {
      const { result, requestEmailCode } = setup({ serviceId: null });

      await act(async () => {
        await result.current.start();
      });

      expect(requestEmailCode).not.toHaveBeenCalled();
      expect(result.current.stepOpen).toBe(false);
    });

    it("asks the visitor to wait, and sends nothing, while the Turnstile token is loading", async () => {
      const { result, requestEmailCode, onFormError } = setup({
        tokenMissing: true,
        token: null,
      });

      await act(async () => {
        await result.current.start();
      });

      expect(requestEmailCode).not.toHaveBeenCalled();
      expect(onFormError).toHaveBeenCalledWith(TOKEN_LOADING_MESSAGE);
    });

    it("shows the API's refusal in the form, and does not open the step", async () => {
      const { result, requestEmailCode, onFormError } = setup();
      requestEmailCode.mockResolvedValueOnce({
        ok: false,
        code: "code_send_failed",
        message: "We could not email a code. Try again later.",
      });

      await act(async () => {
        await result.current.start();
      });

      expect(onFormError).toHaveBeenCalledWith(
        "We could not email a code. Try again later."
      );
      expect(result.current.stepOpen).toBe(false);
    });

    it("says nothing was sent when the request never reaches the service", async () => {
      const { result, requestEmailCode, onFormError, onTokenSpent } = setup();
      requestEmailCode.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      await act(async () => {
        await result.current.start();
      });

      expect(onFormError).toHaveBeenCalledWith(
        expect.stringMatching(NOTHING_SENT)
      );
      expect(result.current.stepOpen).toBe(false);
      // The token was still spent by the attempt.
      expect(onTokenSpent).toHaveBeenCalledTimes(1);
    });

    it("skips the code when the API says none is needed, and treats the email as verified", async () => {
      const { result, requestEmailCode } = setup();
      requestEmailCode.mockResolvedValueOnce(sent(false));

      await act(async () => {
        await result.current.start();
      });

      expect(result.current.stepOpen).toBe(false);
      expect(result.current.isVerified).toBe(true);
      expect(result.current.proof).toBeNull();
      expect(result.current.cooldown).toBe(0);
    });

    it("starts a 30 second resend cooldown and counts it down to zero", async () => {
      vi.useFakeTimers();
      const { result, requestEmailCode } = setup();
      requestEmailCode.mockResolvedValueOnce(sent(true));

      await act(async () => {
        await result.current.start();
      });
      expect(result.current.cooldown).toBe(30);

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(result.current.cooldown).toBe(29);

      act(() => {
        vi.advanceTimersByTime(29_000);
      });
      expect(result.current.cooldown).toBe(0);
    });
  });

  describe("resending", () => {
    it("sends a new code, clears what was typed, and says the old one no longer works", async () => {
      const { result, requestEmailCode } = setup();
      await sendCode(result, requestEmailCode);
      act(() => result.current.setCode("999999"));
      requestEmailCode.mockResolvedValueOnce(sent(true));

      await act(async () => {
        await result.current.resend();
      });

      expect(requestEmailCode).toHaveBeenCalledTimes(2);
      expect(result.current.code).toBe("");
      expect(result.current.notice).toMatch(RESENT);
    });

    it("shows a failed resend under the code box, not in the form", async () => {
      const { result, requestEmailCode, onFormError } = setup();
      await sendCode(result, requestEmailCode);
      requestEmailCode.mockResolvedValueOnce({
        ok: false,
        code: "code_limited",
        message: "Too many codes. Wait before asking again.",
      });

      await act(async () => {
        await result.current.resend();
      });

      expect(result.current.error).toBe(
        "Too many codes. Wait before asking again."
      );
      expect(result.current.notice).toBeNull();
      expect(onFormError).not.toHaveBeenCalled();
    });

    it("does not send a second request while one is already in flight", async () => {
      const { result, requestEmailCode } = setup();
      let finish: (value: Outcome<EmailCodeSent>) => void = () => undefined;
      requestEmailCode.mockReturnValueOnce(
        new Promise<Outcome<EmailCodeSent>>((resolve) => {
          finish = resolve;
        })
      );

      let pending: Promise<void> = Promise.resolve();
      act(() => {
        pending = result.current.start();
      });
      expect(result.current.busy).toBe("send");

      await act(async () => {
        await result.current.resend();
      });
      expect(requestEmailCode).toHaveBeenCalledTimes(1);

      await act(async () => {
        finish(sent(true));
        await pending;
      });
    });
  });

  describe("verifying the code", () => {
    it("confirms the code for the same email, slot and service, then marks the email verified", async () => {
      const { result, requestEmailCode, confirmEmailCode } = setup({
        email: `${EMAIL} `,
      });
      await sendCode(result, requestEmailCode);
      act(() => result.current.setCode(CODE));
      confirmEmailCode.mockResolvedValueOnce(proved(PROOF));

      await act(async () => {
        await result.current.verify();
      });

      const expected: EmailCodeConfirmInput = {
        code: CODE,
        email: EMAIL,
        serviceId: SERVICE,
        startsAt: START,
      };
      expect(confirmEmailCode).toHaveBeenCalledWith(expected);
      expect(result.current.isVerified).toBe(true);
      expect(result.current.proof).toBe(PROOF);
      expect(result.current.stepOpen).toBe(false);
      expect(result.current.code).toBe("");
      expect(result.current.error).toBeNull();
    });

    it("does not call the API for a code that is not six digits", async () => {
      const { result, requestEmailCode, confirmEmailCode } = setup();
      await sendCode(result, requestEmailCode);
      act(() => result.current.setCode("12345"));

      await act(async () => {
        await result.current.verify();
      });

      expect(confirmEmailCode).not.toHaveBeenCalled();
      expect(result.current.error).toMatch(CHECK_DIGITS);
      expect(result.current.isVerified).toBe(false);
    });

    it("keeps only digits, up to the code length, as the visitor types", async () => {
      const { result, requestEmailCode } = setup();
      await sendCode(result, requestEmailCode);

      act(() => result.current.setCode("12a-34 5678"));
      expect(result.current.code).toBe("123456");
      expect(result.current.code).toHaveLength(CODE_LENGTH);
    });

    it("clears the code and shows the message when the code was rejected", async () => {
      const { result, requestEmailCode, confirmEmailCode } = setup();
      await sendCode(result, requestEmailCode);
      act(() => result.current.setCode(CODE));
      confirmEmailCode.mockResolvedValueOnce({
        ok: false,
        code: "code_rejected",
        message: "That code is not right.",
      });

      await act(async () => {
        await result.current.verify();
      });

      expect(result.current.error).toBe("That code is not right.");
      expect(result.current.code).toBe("");
      expect(result.current.isVerified).toBe(false);
      expect(result.current.stepOpen).toBe(true);
    });

    it("keeps the typed code when the failure is not a wrong code", async () => {
      const { result, requestEmailCode, confirmEmailCode } = setup();
      await sendCode(result, requestEmailCode);
      act(() => result.current.setCode(CODE));
      confirmEmailCode.mockResolvedValueOnce({
        ok: false,
        code: "code_locked",
        message: "Too many wrong codes. Ask for a new one.",
      });

      await act(async () => {
        await result.current.verify();
      });

      expect(result.current.error).toBe(
        "Too many wrong codes. Ask for a new one."
      );
      expect(result.current.code).toBe(CODE);
      expect(result.current.isVerified).toBe(false);
    });

    it("shows a connection message when the check fails in transit", async () => {
      const { result, requestEmailCode, confirmEmailCode } = setup();
      await sendCode(result, requestEmailCode);
      act(() => result.current.setCode(CODE));
      confirmEmailCode.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      await act(async () => {
        await result.current.verify();
      });

      expect(result.current.error).toMatch(NETWORK);
      expect(result.current.busy).toBeNull();
      expect(result.current.isVerified).toBe(false);
    });

    it("reports verifying as busy until the check returns", async () => {
      const { result, requestEmailCode, confirmEmailCode } = setup();
      await sendCode(result, requestEmailCode);
      act(() => result.current.setCode(CODE));
      let finish: (value: Outcome<EmailProof>) => void = () => undefined;
      confirmEmailCode.mockReturnValueOnce(
        new Promise<Outcome<EmailProof>>((resolve) => {
          finish = resolve;
        })
      );

      let pending: Promise<void> = Promise.resolve();
      act(() => {
        pending = result.current.verify();
      });
      expect(result.current.busy).toBe("verify");

      await act(async () => {
        finish(proved(PROOF));
        await pending;
      });
      expect(result.current.busy).toBeNull();
    });

    it("never writes the code to browser storage or the URL", async () => {
      const setItem = vi.spyOn(Storage.prototype, "setItem");
      const { result, requestEmailCode, confirmEmailCode } = setup();
      await sendCode(result, requestEmailCode);
      act(() => result.current.setCode(CODE));
      confirmEmailCode.mockResolvedValueOnce(proved(PROOF));

      await act(async () => {
        await result.current.verify();
      });

      expect(result.current.isVerified).toBe(true);
      expect(setItem).not.toHaveBeenCalled();
      expect(window.location.href).not.toContain(CODE);
      expect(window.location.href).not.toContain(PROOF);
    });
  });

  describe("staleness", () => {
    it("drops a verified email as soon as the email changes", async () => {
      const { result, requestEmailCode, confirmEmailCode, rerender, args } =
        setup();
      await sendCode(result, requestEmailCode);
      act(() => result.current.setCode(CODE));
      confirmEmailCode.mockResolvedValueOnce(proved(PROOF));
      await act(async () => {
        await result.current.verify();
      });
      expect(result.current.isVerified).toBe(true);

      rerender({ ...args, email: "grace@example.com" });

      expect(result.current.isVerified).toBe(false);
      expect(result.current.proof).toBeNull();
    });

    it("drops a verified email when the slot changes", async () => {
      const { result, requestEmailCode, confirmEmailCode, rerender, args } =
        setup();
      await sendCode(result, requestEmailCode);
      act(() => result.current.setCode(CODE));
      confirmEmailCode.mockResolvedValueOnce(proved(PROOF));
      await act(async () => {
        await result.current.verify();
      });

      rerender({ ...args, startsAt: "2027-01-06T13:30:00Z" });

      expect(result.current.isVerified).toBe(false);
      expect(result.current.proof).toBeNull();
    });

    it("drops a verified email when the service changes", async () => {
      const { result, requestEmailCode, confirmEmailCode, rerender, args } =
        setup();
      await sendCode(result, requestEmailCode);
      act(() => result.current.setCode(CODE));
      confirmEmailCode.mockResolvedValueOnce(proved(PROOF));
      await act(async () => {
        await result.current.verify();
      });

      rerender({ ...args, serviceId: "7a1b0a52-7c12-4c53-9e0f-9d8f2b2f6c11" });

      expect(result.current.isVerified).toBe(false);
    });

    it("closes an open code step when the email changes", async () => {
      const { result, requestEmailCode, rerender, args } = setup();
      await sendCode(result, requestEmailCode);
      expect(result.current.stepOpen).toBe(true);

      rerender({ ...args, email: "grace@example.com" });

      expect(result.current.stepOpen).toBe(false);
    });
  });

  describe("controls", () => {
    it("forgets a proof when told the booking refused it", async () => {
      const { result, requestEmailCode, confirmEmailCode } = setup();
      await sendCode(result, requestEmailCode);
      act(() => result.current.setCode(CODE));
      confirmEmailCode.mockResolvedValueOnce(proved(PROOF));
      await act(async () => {
        await result.current.verify();
      });

      act(() => result.current.dropProof());

      expect(result.current.isVerified).toBe(false);
      expect(result.current.proof).toBeNull();
    });

    it("closes the code step and clears the typed code and messages", async () => {
      const { result, requestEmailCode, confirmEmailCode } = setup();
      await sendCode(result, requestEmailCode);
      act(() => result.current.setCode(CODE));
      confirmEmailCode.mockResolvedValueOnce({
        ok: false,
        code: "code_rejected",
        message: "That code is not right.",
      });
      await act(async () => {
        await result.current.verify();
      });

      act(() => result.current.closeStep());

      expect(result.current.stepOpen).toBe(false);
      expect(result.current.code).toBe("");
      expect(result.current.error).toBeNull();
    });
  });
});
