import { nhcJobSchema } from "@barrelsgd/api-client";
import { shouldReportError } from "@barrelsgd/ui/lib/report-error";
import { afterEach, expect, it, vi } from "vitest";
import { nhcRequest } from "./nhc-api";

afterEach(() => vi.unstubAllGlobals());
it.each([403, 422, 503])(
  "retains HTTP %i for the shared error-reporting rule",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status }))
    );
    const error = await nhcRequest("editions", nhcJobSchema).catch(
      (caught: unknown) => caught
    );
    expect(error).toMatchObject({ status });
    expect(shouldReportError(error)).toBe(status >= 500);
  }
);
it("retains a signed-out session response and sends no mutation", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));
  vi.stubGlobal("fetch", fetch);
  await expect(
    nhcRequest("pulls", nhcJobSchema, { families: ["marine"] })
  ).rejects.toMatchObject({ status: 401 });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(
    "/_backend/browser-session",
    expect.objectContaining({ credentials: "same-origin", redirect: "error" })
  );
});
