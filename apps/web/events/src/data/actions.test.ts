import { ResponseError } from "@barrelsgd/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const reportError = vi.fn();
const rsvp = vi.fn();
const cancelRsvp = vi.fn();
const createUpload = vi.fn();
const completeUpload = vi.fn();
const setLogo = vi.fn();
const claim = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/report-error", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));
vi.mock("./organiser-choice", () => ({
  chosenOrganiser: async () => undefined,
  rememberOrganiser: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ apiOptions: () => ({}) }));
vi.mock("@barrelsgd/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@barrelsgd/api-client")>()),
  eventsRsvpListing: (...args: unknown[]) => rsvp(...args),
  eventsCancelListingRsvp: (...args: unknown[]) => cancelRsvp(...args),
  eventsClaimTickets: (...args: unknown[]) => claim(...args),
  eventsSetOrganiserLogo: (...args: unknown[]) => setLogo(...args),
  storageCompleteUpload: (...args: unknown[]) => completeUpload(...args),
  storageCreateUpload: (...args: unknown[]) => createUpload(...args),
}));

const { claimTickets, finishUpload, saveOrganiserLogo, setGoing, startUpload } =
  await import("./actions");

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

describe("image uploads", () => {
  beforeEach(() => {
    for (const mock of [
      getSession,
      reportError,
      createUpload,
      completeUpload,
      setLogo,
    ]) {
      mock.mockReset();
    }
    getSession.mockResolvedValue({ accessToken: "tok" });
  });

  it("presigns for the given organisation and the events app", async () => {
    createUpload.mockReturnValue({
      unwrap: async () => ({
        id: "up-1",
        url: "https://bucket.test/put",
        headers: { "Content-Type": "image/png" },
      }),
    });
    const result = await startUpload("org_1", {
      contentType: "image/png",
      purpose: "listing-image",
      sizeBytes: 10,
    });
    expect(result).toEqual({
      ok: true,
      data: {
        id: "up-1",
        url: "https://bucket.test/put",
        headers: { "Content-Type": "image/png" },
      },
    });
    expect(createUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { "X-Barrels-Organisation": "org_1" },
        body: {
          app: "events",
          purpose: "listing-image",
          content_type: "image/png",
          size_bytes: 10,
        },
      })
    );
  });

  it("shows the API's message when uploads are not configured, unreported", async () => {
    createUpload.mockImplementation(() => {
      throw responseError(503, { detail: "Uploads are not configured" });
    });
    expect(
      await startUpload("org_1", {
        contentType: "image/png",
        purpose: "listing-image",
        sizeBytes: 10,
      })
    ).toEqual({ ok: false, error: "Uploads are not configured" });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("still hides and reports other 5xx failures", async () => {
    createUpload.mockImplementation(() => {
      throw responseError(503, { detail: "Events is not set up" });
    });
    const result = await startUpload("org_1", {
      contentType: "image/png",
      purpose: "listing-image",
      sizeBytes: 10,
    });
    expect(result.ok).toBe(false);
    expect(reportError).toHaveBeenCalled();
  });

  it("confirms an upload and resolves to the stored file id", async () => {
    completeUpload.mockReturnValue({ unwrap: async () => ({ id: "file-1" }) });
    expect(await finishUpload("org_1", "up-1")).toEqual({
      ok: true,
      data: "file-1",
    });
    expect(completeUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { "X-Barrels-Organisation": "org_1" },
        path: { upload_id: "up-1" },
      })
    );
  });

  it("attaches or clears the organiser logo", async () => {
    setLogo.mockResolvedValue({});
    expect((await saveOrganiserLogo("file-1")).ok).toBe(true);
    expect(setLogo).toHaveBeenCalledWith(
      expect.objectContaining({ body: { file_id: "file-1" } })
    );
    await saveOrganiserLogo(null);
    expect(setLogo).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: { file_id: null } })
    );
  });
});

describe("claimTickets failures", () => {
  beforeEach(() => {
    claim.mockReset();
    reportError.mockReset();
    getSession.mockResolvedValue({ accessToken: "tok" });
  });

  function fails(error: ResponseError) {
    claim.mockReturnValue({ unwrap: () => Promise.reject(error) });
  }

  it("tells the buyer card payments are down and drops the key", async () => {
    fails(
      responseError(503, {
        detail:
          "Online payment is temporarily unavailable. Please try again shortly.",
      })
    );
    expect(await claimTickets("fete", [], "key")).toEqual({
      ok: false,
      error:
        "Card payments are temporarily unavailable. Try again in a moment.",
      freshKey: true,
    });
  });

  it("drops the key after an expired attempt and after any 5xx", async () => {
    fails(
      responseError(409, { detail: "That attempt expired. Start a new one." })
    );
    expect(await claimTickets("fete", [], "key")).toMatchObject({
      ok: false,
      freshKey: true,
    });
    fails(responseError(500, {}));
    expect(await claimTickets("fete", [], "key")).toMatchObject({
      ok: false,
      freshKey: true,
    });
  });

  it("keeps the key for a refusal the buyer can fix", async () => {
    fails(responseError(409, { detail: "Only 1 VIP tickets are left" }));
    const result = await claimTickets("fete", [], "key");
    expect(result.ok).toBe(false);
    expect("freshKey" in result).toBe(false);
  });
});
