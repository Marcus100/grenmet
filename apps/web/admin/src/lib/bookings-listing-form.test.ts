import { describe, expect, it } from "vitest";
import {
  LISTING_NOTICE_OK,
  listingNoticeFor,
  listingNoticeForError,
  parseListingQueue,
} from "@/lib/bookings-listing-form";

describe("parseListingQueue", () => {
  it("accepts the four queues and defaults to waiting", () => {
    expect(parseListingQueue("approved")).toBe("approved");
    expect(parseListingQueue("flagged")).toBe("flagged");
    expect(parseListingQueue("all")).toBe("all");
    expect(parseListingQueue("pending")).toBe("pending");
    expect(parseListingQueue(undefined)).toBe("pending");
    expect(parseListingQueue("drop table")).toBe("pending");
  });
});

describe("listingNoticeForError", () => {
  it("maps a refused permission to forbidden and reports nothing", () => {
    expect(listingNoticeForError("approve", 403)).toEqual({
      code: "forbidden",
      known: true,
    });
  });

  it("names the state for a 409 on each action", () => {
    expect(listingNoticeForError("approve", 409).code).toBe("already-approved");
    expect(listingNoticeForError("withdraw", 409).code).toBe("not-approved");
  });

  it("treats a missing business and a bad request as expected", () => {
    expect(listingNoticeForError("approve", 404)).toEqual({
      code: "missing",
      known: true,
    });
    expect(listingNoticeForError("withdraw", 422)).toEqual({
      code: "invalid",
      known: true,
    });
  });

  it("marks a server failure as unknown so it gets reported", () => {
    expect(listingNoticeForError("approve", 500)).toEqual({
      code: "failed",
      known: false,
    });
  });
});

describe("listingNoticeFor", () => {
  it("returns written copy only for known codes", () => {
    expect(listingNoticeFor("approved")?.tone).toBe("ok");
    expect(listingNoticeFor("not-approved")?.tone).toBe("problem");
    expect(listingNoticeFor("toString")).toBeUndefined();
    expect(listingNoticeFor(undefined)).toBeUndefined();
  });

  it("maps each action to its success notice", () => {
    expect(LISTING_NOTICE_OK).toEqual({
      approve: "approved",
      withdraw: "withdrawn",
    });
  });
});
