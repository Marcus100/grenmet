import { expect, it, vi } from "vitest";
import { POST } from "./route";

it("does not accept or log subscriptions while storage is unavailable", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
  try {
    const response = await POST(
      new Request("https://signal.example.test/api/subscribe", {
        method: "POST",
        body: JSON.stringify({ email: "reader@example.test" }),
      })
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Subscriptions are not open yet. No details have been saved.",
    });
    expect(log).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});
