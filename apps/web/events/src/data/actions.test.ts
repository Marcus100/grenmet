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
const resubmit = vi.fn();
const getManaged = vi.fn();
const chosen = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/report-error", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));
vi.mock("server-only", () => ({}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));
vi.mock("./organiser-choice", () => ({
  chosenOrganiser: () => chosen(),
  rememberOrganiser: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ apiOptions: () => ({}) }));
vi.mock("@barrelsgd/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@barrelsgd/api-client")>()),
  eventsRsvpListing: (...args: unknown[]) => rsvp(...args),
  eventsCancelListingRsvp: (...args: unknown[]) => cancelRsvp(...args),
  eventsResubmitOrganiser: (...args: unknown[]) => resubmit(...args),
  eventsGetManagedOrganiser: (...args: unknown[]) => getManaged(...args),
  eventsClaimTickets: (...args: unknown[]) => claim(...args),
  eventsSetOrganiserLogo: (...args: unknown[]) => setLogo(...args),
  storageCompleteUpload: (...args: unknown[]) => completeUpload(...args),
  storageCreateUpload: (...args: unknown[]) => createUpload(...args),
}));

const {
  claimTickets,
  finishUpload,
  resubmitOrganiser,
  saveOrganiserLogo,
  setGoing,
  startUpload,
} = await import("./actions");

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

/** The managed-organiser answer for a member who runs `slugs`, first one by default. */
function managedFor(slugs: string[]) {
  const organisers = slugs.map((slug) => ({
    slug,
    name: slug,
    organisation_id: null,
  }));
  const first = organisers[0];
  return {
    unwrap: async () => ({
      id: `id-${first?.slug ?? "none"}`,
      slug: first?.slug ?? "none",
      name: first?.name ?? "none",
      bio: "",
      verified: false,
      organisation_id: null,
      logo_file_id: null,
      follower_count: 0,
      viewer_following: null,
      organisers,
      listings: [],
    }),
  };
}

describe("resubmitOrganiser", () => {
  beforeEach(() => {
    for (const mock of [
      getSession,
      reportError,
      resubmit,
      getManaged,
      chosen,
    ]) {
      mock.mockReset();
    }
    getSession.mockResolvedValue({ accessToken: "tok" });
    chosen.mockResolvedValue(undefined);
    getManaged.mockReturnValue(managedFor(["crew-a"]));
    resubmit.mockReturnValue({ unwrap: async () => ({}) });
  });

  it("sends the organiser the dashboard shows when no cookie is set and the member runs two", async () => {
    getManaged.mockReturnValue(managedFor(["crew-a", "crew-b"]));
    expect(await resubmitOrganiser()).toEqual({
      ok: true,
      data: "resubmitted",
    });
    expect(resubmit.mock.calls[0]?.[0]).toHaveProperty("query", {
      organiser: "crew-a",
    });
  });

  it("sends the switcher's organiser when the cookie names one", async () => {
    chosen.mockResolvedValue("crew-b");
    getManaged.mockReturnValue(managedFor(["crew-b"]));
    expect((await resubmitOrganiser()).ok).toBe(true);
    expect(resubmit.mock.calls[0]?.[0]).toHaveProperty("query", {
      organiser: "crew-b",
    });
  });

  it("asks visitors to sign in without calling the API", async () => {
    getSession.mockResolvedValue(null);
    expect(await resubmitOrganiser()).toEqual({
      ok: false,
      error: "sign-in-required",
    });
    expect(resubmit).not.toHaveBeenCalled();
  });

  it("resubmits the organiser resolved on the server", async () => {
    resubmit.mockReturnValue({ unwrap: async () => ({}) });
    expect(await resubmitOrganiser()).toEqual({
      ok: true,
      data: "resubmitted",
    });
    expect(resubmit).toHaveBeenCalledOnce();
    expect(resubmit.mock.calls[0]?.[0]).not.toHaveProperty("body");
  });

  it("maps the real 409 for a non-rejected organiser to unchanged, unreported", async () => {
    resubmit.mockReturnValue({
      unwrap: async () =>
        Promise.reject(
          responseError(409, {
            detail: "Only a rejected request can be resubmitted",
          })
        ),
    });
    expect(await resubmitOrganiser()).toEqual({ ok: true, data: "unchanged" });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("shows other refusals and reports server faults without detail", async () => {
    resubmit.mockReturnValue({
      unwrap: async () =>
        Promise.reject(
          responseError(403, { detail: "You can't do that here" })
        ),
    });
    expect(await resubmitOrganiser()).toEqual({
      ok: false,
      error: "You can't do that here",
    });
    resubmit.mockReturnValue({
      unwrap: async () => Promise.reject(responseError(500, { detail: "x" })),
    });
    const result = await resubmitOrganiser();
    expect(result.ok).toBe(false);
    expect(reportError).toHaveBeenCalledWith(
      expect.any(ResponseError),
      "events-organiser"
    );
  });
});
