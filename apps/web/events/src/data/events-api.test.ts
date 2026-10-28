import { ResponseError } from "@barrelsgd/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const getManaged = vi.fn();
const chosen = vi.fn();

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));
vi.mock("@/lib/session", () => ({ getSession: async () => null }));
vi.mock("@/lib/api", () => ({ apiOptions: () => ({}) }));
vi.mock("./organiser-choice", () => ({ chosenOrganiser: () => chosen() }));
vi.mock("@barrelsgd/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@barrelsgd/api-client")>()),
  eventsGetManagedOrganiser: (...args: unknown[]) => getManaged(...args),
}));

const { getManagedAccess, getManagedOrganiser } = await import("./events-api");

function forbidden(detail: string) {
  return new ResponseError({
    data: { detail },
    status: 403,
    statusText: "",
    request: new Request("http://api.test"),
    response: new Response(),
  });
}

const reject = (error: unknown) => ({
  unwrap: async () => Promise.reject(error),
});

describe("getManagedAccess", () => {
  beforeEach(() => {
    getManaged.mockReset();
    chosen.mockReset();
    chosen.mockResolvedValue(undefined);
  });

  it("tells 'Events switched off' apart from 'no organiser' by the API's real strings", async () => {
    getManaged.mockReturnValue(
      reject(forbidden("Barrels Events isn't enabled for this organisation"))
    );
    expect(await getManagedAccess()).toEqual({ kind: "events-disabled" });
    expect(await getManagedOrganiser()).toBeNull();

    getManaged.mockReturnValue(
      reject(forbidden("You're not a member of an organiser yet"))
    );
    expect(await getManagedAccess()).toEqual({ kind: "no-organiser" });
  });

  it("treats a 403 without a readable message as no organiser", async () => {
    getManaged.mockReturnValue(reject(forbidden("")));
    expect(await getManagedAccess()).toEqual({ kind: "no-organiser" });
  });

  it("falls back to the default organiser when a remembered one is refused", async () => {
    chosen.mockResolvedValue("old-crew");
    getManaged
      .mockReturnValueOnce(
        reject(forbidden("You're not a member of an organiser yet"))
      )
      .mockReturnValueOnce(
        reject(forbidden("Barrels Events isn't enabled for this organisation"))
      );
    expect(await getManagedAccess()).toEqual({ kind: "events-disabled" });
    expect(getManaged).toHaveBeenCalledTimes(2);
  });

  it("lets other failures throw to the error boundary", async () => {
    getManaged.mockReturnValue(reject(new Error("boom")));
    const err = await getManagedAccess().catch((e: unknown) => e);
    expect(String(err)).toBe("Error: boom");
  });
});
