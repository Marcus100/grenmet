import type { BookingBusinessContact } from "@barrelsgd/api-client";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { contactEnding, contactLinks } from "../lib/business-contact";
import { ContactLinks, ContactStrip } from "./business-contact";

const NONE: BookingBusinessContact = {
  phone: null,
  whatsapp: null,
  instagram: null,
  email: null,
};
const ALL: BookingBusinessContact = {
  phone: "+14734401234",
  whatsapp: "14734405678",
  instagram: "babydollbeautybar",
  email: "hello@babydoll.example",
};
const QUESTIONS = /Questions\? Contact us/u;
const NEW_TAB = /opens in a new tab/u;
const WHATSAPP = /WhatsApp/u;
const INSTAGRAM = /Instagram @babydollbeautybar/u;
const WHATSAPP_NEW_TAB = /^WhatsApp ?\(opens in a new tab\)$/u;

describe("ContactStrip", () => {
  it("renders nothing when every option is empty", () => {
    const { container } = render(<ContactStrip contact={NONE} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing without contact data", () => {
    const { container } = render(<ContactStrip contact={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows only the options that are filled in", () => {
    render(
      <ContactStrip
        contact={{ ...NONE, phone: "+14734401234", email: "a@b.example" }}
      />
    );
    const strip = screen.getByRole("complementary", { name: QUESTIONS });
    const links = within(strip).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "tel:+14734401234",
      "mailto:a@b.example",
    ]);
    expect(within(strip).queryByText(NEW_TAB)).toBeNull();
  });

  it("shows all four, external ones in a new tab with a hint", () => {
    render(<ContactStrip contact={ALL} />);
    const strip = screen.getByRole("complementary", { name: QUESTIONS });
    const list = within(strip).getByRole("list", { name: "Contact us" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);

    expect(
      within(strip).getByRole("link", { name: "Call +14734401234" })
    ).toHaveAttribute("href", "tel:+14734401234");
    const whatsapp = within(strip).getByRole("link", { name: WHATSAPP });
    expect(whatsapp).toHaveAttribute("href", "https://wa.me/14734405678");
    expect(whatsapp).toHaveAttribute("target", "_blank");
    expect(whatsapp).toHaveAttribute("rel", "noopener noreferrer");
    // jsdom drops the space before the hidden hint; browsers keep it.
    expect(whatsapp).toHaveAccessibleName(WHATSAPP_NEW_TAB);
    const instagram = within(strip).getByRole("link", {
      name: INSTAGRAM,
    });
    expect(instagram).toHaveAttribute(
      "href",
      "https://instagram.com/babydollbeautybar"
    );
    expect(instagram).toHaveAttribute("target", "_blank");
    const email = within(strip).getByRole("link", {
      name: "Email hello@babydoll.example",
    });
    expect(email).toHaveAttribute("href", "mailto:hello@babydoll.example");
    expect(email).not.toHaveAttribute("target");
  });
});

describe("ContactLinks and helpers", () => {
  it("renders no list when nothing is set", () => {
    const { container } = render(<ContactLinks contact={NONE} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("drops values that cannot make a safe link", () => {
    expect(
      contactLinks({
        phone: "473 440 1234",
        whatsapp: "wa.me/1",
        instagram: "bad handle",
        email: "no-at-sign",
      })
    ).toEqual([]);
    expect(contactLinks({ ...NONE, instagram: "javascript:alert(1)" })).toEqual(
      []
    );
  });

  it("encodes the email so it cannot add mail headers", () => {
    const [mail] = contactLinks({
      ...NONE,
      email: "hi@x.example?cc=evil@y.example&body=%0A",
    });
    expect(mail?.href).toBe(
      "mailto:hi@x.example%3Fcc%3Devil%40y.example%26body%3D%250A"
    );
  });

  it("ends a sentence with a colon only when links follow", () => {
    expect(contactEnding(ALL)).toBe(":");
    expect(contactEnding(NONE)).toBe(" directly.");
    expect(contactEnding(null)).toBe(" directly.");
  });
});
