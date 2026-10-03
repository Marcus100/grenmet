import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { waitForSubmission } from "./wait-for-submission";

it("returns the captured request once it arrives", async () => {
  let body: { ok: boolean } | null = null;
  setTimeout(() => {
    body = { ok: true };
  }, 10);
  await expect(waitForSubmission(() => body)).resolves.toEqual({ ok: true });
});

it("reports the on-screen validation message when nothing is sent", async () => {
  render(
    <div role="alert">
      Choose the product: Outlook, Watch, Warning or Small Craft Advisory.
    </div>
  );
  await expect(
    waitForSubmission(() => null, { timeout: 50 })
  ).rejects.toMatchObject({
    message:
      "The form sent no request. On screen: Choose the product: Outlook, Watch, Warning or Small Craft Advisory.",
  });
});

it("says so when no message explains the missing request", async () => {
  render(<p>Idle</p>);
  await expect(
    waitForSubmission(() => null, { timeout: 50 })
  ).rejects.toMatchObject({
    message: expect.stringContaining("no validation message is shown"),
  });
});
