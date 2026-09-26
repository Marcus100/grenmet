import { waitFor } from "@testing-library/react";

const MESSAGE_SELECTOR =
  '[role="alert"], [role="status"], [aria-invalid="true"], [data-slot="field-error"]';

/** Text a user would see explaining why a form did not submit. */
export function visibleFormMessages(): string[] {
  return [...document.querySelectorAll(MESSAGE_SELECTOR)]
    .map((element) => element.textContent?.trim() ?? "")
    .filter(Boolean);
}

/**
 * Wait for a form to send its request. When nothing is sent, fail with the
 * on-screen validation or status text instead of a bare timeout, so a newly
 * required field shows up as its own message rather than "Test timed out".
 */
export async function waitForSubmission<T>(
  read: () => T | null | undefined,
  { timeout = 3000 }: { timeout?: number } = {}
): Promise<T> {
  try {
    return await waitFor(
      () => {
        const value = read();
        if (value == null) throw new Error("No request yet");
        return value;
      },
      { timeout }
    );
  } catch {
    const messages = visibleFormMessages();
    throw new Error(
      messages.length
        ? `The form sent no request. On screen: ${messages.join(" | ")}`
        : "The form sent no request, and no validation message is shown."
    );
  }
}
