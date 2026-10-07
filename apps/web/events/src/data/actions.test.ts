import { ResponseError } from "@barrelsgd/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const reportError = vi.fn();
const rsvp = vi.fn();
const cancelRsvp = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/report-error", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));
vi.mock("@/lib/api", () => ({ apiOptions: () => ({}) }));
vi.mock("@barrelsgd/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@barrelsgd/api-client")>()),
  eventsRsvpListing: (...args: unknown[]) => rsvp(...args),
  eventsCancelListingRsvp: (...args: unknown[]) => cancelRsvp(...args),
}));

const { setGoing } = await import("./actions");

function responseError(status: number, data: unknown) {
  return new ResponseError({
    data,
    status,
    statusText: "",
    request: new Request("http://api.test"),
    response: new Response(),
  });
}

describe("setGoing", () => {
  beforeEach(() => {
    for (const mock of [getSession, reportError, rsvp, cancelRsvp]) {
      mock.mockReset();
    }
    getSession.mockResolvedValue({ accessToken: "tok" });
  });

  it("asks visitors to sign in without calling the API", async () => {
    getSession.mockResolvedValue(null);
    expect(await setGoing("fete", true)).toEqual({
      ok: false,
      error: "sign-in-required",
    });
    expect(rsvp).not.toHaveBeenCalled();
  });

  it("RSVPs to, or cancels, the right listing", async () => {
    rsvp.mockResolvedValue({});
    cancelRsvp.mockResolvedValue({});
    expect((await setGoing("fete", true)).ok).toBe(true);
    expect(rsvp).toHaveBeenCalledWith(
      expect.objectContaining({ path: { slug: "fete" } })
    );
    expect((await setGoing("fete", false)).ok).toBe(true);
    expect(cancelRsvp).toHaveBeenCalledOnce();
  });

  it("returns the API's reason for expected 4xx failures, unreported", async () => {
    rsvp.mockRejectedValue(responseError(409, { detail: "Event is full" }));
    expect(await setGoing("fete", true)).toEqual({
      ok: false,
      error: "Event is full",
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("treats an expired token as needing sign-in", async () => {
    rsvp.mockRejectedValue(responseError(401, { detail: "Sign in again" }));
    expect(await setGoing("fete", true)).toEqual({
      ok: false,
      error: "sign-in-required",
    });
  });

  it("hides unexpected failures and reports them", async () => {
    rsvp.mockRejectedValue(new Error("db exploded"));
    const result = await setGoing("fete", true);
    expect(result).toEqual({
      ok: false,
      error: "Something went wrong. Try again shortly.",
    });
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), "events-rsvp");
  });
});
