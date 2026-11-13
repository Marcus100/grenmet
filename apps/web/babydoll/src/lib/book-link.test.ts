import { describe, expect, it } from "vitest";
import { BOOKING_URL, ONLINE_BOOKING_URL } from "@/data/site";
import { bookingLink, siteBookingLink } from "./book-link";

describe("bookingLink", () => {
  it("goes to Acuity in a new tab while no online booking address is set", () => {
    expect(bookingLink(null)).toEqual({
      href: BOOKING_URL,
      target: "_blank",
      rel: "noopener",
    });
  });

  it("goes to the studio's page on the bookings site once one is set", () => {
    expect(bookingLink("https://bookings.barrels.gd/babydoll")).toEqual({
      href: "https://bookings.barrels.gd/babydoll",
      target: "_blank",
      rel: "noopener",
    });
  });
});

describe("siteBookingLink", () => {
  it("follows the address in the site data", () => {
    expect(siteBookingLink()).toEqual(bookingLink(ONLINE_BOOKING_URL));
  });

  it("never points at a page on this site", () => {
    expect(siteBookingLink().href.startsWith("https://")).toBe(true);
  });
});
