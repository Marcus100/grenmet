import { describe, expect, it } from "vitest";
import { cardProps } from "./card-props";
import { renderTemplate } from "./render";

// The shape FastAPI's email_layout.to_props sends, with every field present.
const full = {
  subject: "Your tickets for Paid Fete",
  logo: { url: "https://cdn.example.test/logo.png", alt: "Fete Co" },
  eyebrow: "Fete Co · Barrels Events",
  chip: { label: "Confirmed", tone: "accent" },
  title: "You're going to Paid Fete",
  greeting: "Hello Ana,",
  paragraphs: ["Thank you."],
  rows: [{ label: "What", value: "Paid Fete · 2 tickets" }],
  money: [{ label: "Paid", value: "XCD 50.00" }],
  code: null,
  primary: { label: "View tickets", url: "https://events.example.test/me" },
  secondary: [{ label: "Add to Google Calendar", url: "" }],
  linkFallback: null,
  policy: ["Refunds are available up to 48 hours before the start."],
  quiet: null,
  quietLink: null,
  footer: "You are getting this email because you bought tickets.",
  accent: null,
  preview: null,
};

describe("card props from FastAPI", () => {
  it("accepts the full shape FastAPI sends, nulls included", async () => {
    expect(cardProps(full)).toBe(full);
    const { subject } = await renderTemplate("card", full);
    expect(subject).toBe("Your tickets for Paid Fete");
  });

  it("accepts a card with only the required fields", () => {
    expect(() =>
      cardProps({ subject: "S", title: "T", footer: "F" })
    ).not.toThrow();
  });

  it.each([
    ["a subject that is not text", { subject: 5 }, "card requires"],
    ["a blank title", { title: "   " }, "card requires"],
    ["a footer that is not text", { footer: ["F"] }, "card requires"],
    [
      "a paragraph that is not text",
      { paragraphs: ["ok", 7] },
      "card paragraphs[1] must be text",
    ],
    [
      "a policy that is not a list",
      { policy: "one line" },
      "card policy must be a list",
    ],
    ["a null list", { rows: null }, "card rows must be a list"],
    [
      "a row that is not an object",
      { rows: ["What: x"] },
      "card rows[0] must be an object",
    ],
    [
      "a row value that is not text",
      { rows: [{ label: "What", value: 3 }] },
      "card rows[0].value must be text",
    ],
    [
      "a money row without a label",
      { money: [{ value: "XCD 1.00" }] },
      "card money[0].label must be text",
    ],
    [
      "a money strong flag that is not true or false",
      { money: [{ label: "Paid", value: "1", strong: "yes" }] },
      "card money[0].strong must be true or false",
    ],
    [
      "a primary action without a url",
      { primary: { label: "Go" } },
      "card primary.url must be text",
    ],
    [
      "a secondary action that is a string",
      { secondary: ["https://x.test"] },
      "card secondary[0] must be an object",
    ],
    [
      "a quiet link that is a list",
      { quietLink: [] },
      "card quietLink must be an object",
    ],
    [
      "a logo url that is not text",
      { logo: { url: 1, alt: "x" } },
      "card logo.url must be text",
    ],
    [
      "a chip with an unknown tone",
      { chip: { label: "Live", tone: "red" } },
      "card chip.tone must be accent or muted",
    ],
    ["an accent that is not text", { accent: 123 }, "card accent must be text"],
    [
      "a code that is an object",
      { code: { value: "1" } },
      "card code must be text",
    ],
  ])("refuses %s", (_name, change, message) => {
    expect(() => cardProps({ ...full, ...change })).toThrow(message);
  });

  it("makes the render reject a malformed card", async () => {
    await expect(
      renderTemplate("card", { ...full, rows: [{ label: "What" }] })
    ).rejects.toThrow("card rows[0].value must be text");
  });
});
