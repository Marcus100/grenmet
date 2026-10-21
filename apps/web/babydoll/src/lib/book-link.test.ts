import { beforeEach, describe, expect, it, vi } from "vitest";
import { BOOKING_URL } from "@/data/site";
import {
  bookingLink,
  ON_SITE_BOOKING_HREF,
  siteBookingLink,
} from "./book-link";

const mocks = vi.hoisted(() => ({
  env: { BABYDOLL_ONLINE_BOOKING: "off" as "on" | "off" },
}));

vi.mock("@/env", () => ({ env: mocks.env }));

beforeEach(() => {
  mocks.env.BABYDOLL_ONLINE_BOOKING = "off";
});

describe("bookingLink", () => {
  it("goes to Acuity in a new tab while online booking is off", () => {
    expect(bookingLink(false)).toEqual({
      href: BOOKING_URL,
      target: "_blank",
      rel: "noopener",
    });
  });

  it("goes to the on-site /book route, in the same tab, while it is on", () => {
    expect(bookingLink(true)).toEqual({ href: "/book" });
    expect(ON_SITE_BOOKING_HREF).toBe("/book");
  });
});

describe("siteBookingLink", () => {
  it("follows the typed env switch", () => {
    mocks.env.BABYDOLL_ONLINE_BOOKING = "off";
    expect(siteBookingLink()).toEqual(bookingLink(false));

    mocks.env.BABYDOLL_ONLINE_BOOKING = "on";
    expect(siteBookingLink()).toEqual(bookingLink(true));
  });
});
