import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeManagedEvent } from "@/test/factories";

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn(), set: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

import {
  LISTING_COOKIE,
  rememberedEvent,
  rememberListing,
} from "./event-choice";

const listings = [
  makeManagedEvent({
    admission: "ticketed",
    id: "evt-1",
    title: "Harbour Fete",
  }),
  makeManagedEvent({ admission: "free", id: "evt-2", title: "Open Mic" }),
];

function cookieIs(value: string | undefined) {
  cookieStore.get.mockReturnValue(
    value === undefined ? undefined : { name: LISTING_COOKIE, value }
  );
}

beforeEach(() => {
  cookieStore.get.mockReset();
  cookieStore.set.mockReset();
});

describe("rememberListing", () => {
  it("sets a host-only, httpOnly cookie with the event id", async () => {
    await rememberListing("evt-1");
    expect(cookieStore.set).toHaveBeenCalledTimes(1);
    const [name, value, options] = cookieStore.set.mock.calls[0] ?? [];
    expect(name).toBe("events_listing");
    expect(value).toBe("evt-1");
    expect(options).toMatchObject({
      httpOnly: true,
      path: "/",
      sameSite: "lax",
    });
    expect(options).not.toHaveProperty("domain");
  });

  it("ignores an id that is not well formed", async () => {
    await rememberListing("../../etc");
    await rememberListing("");
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});

describe("rememberedEvent", () => {
  it("returns the remembered event with its ticketed flag", async () => {
    cookieIs("evt-1");
    expect(await rememberedEvent(listings)).toEqual({
      id: "evt-1",
      ticketed: true,
      title: "Harbour Fete",
    });
  });

  it("returns a non-ticketed event as non-ticketed", async () => {
    cookieIs("evt-2");
    expect(await rememberedEvent(listings)).toEqual({
      id: "evt-2",
      ticketed: false,
      title: "Open Mic",
    });
  });

  it("returns null when the remembered event is not one of the organiser's listings", async () => {
    cookieIs("evt-from-another-organiser");
    expect(await rememberedEvent(listings)).toBeNull();
  });

  it("returns null with no cookie or a malformed one", async () => {
    cookieIs(undefined);
    expect(await rememberedEvent(listings)).toBeNull();
    cookieIs("evt 1; drop");
    expect(await rememberedEvent(listings)).toBeNull();
  });
});
