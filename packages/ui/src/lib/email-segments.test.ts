import { describe, expect, it } from "vitest";
import { splitEmailAddresses } from "./email-segments";

describe("splitEmailAddresses", () => {
  it("puts an address inside a longer string in its own segment", () => {
    expect(splitEmailAddresses("meteorology@gaa.gd; 1-473-444-4142")).toEqual([
      { isEmail: true, text: "meteorology@gaa.gd" },
      { isEmail: false, text: "; 1-473-444-4142" },
    ]);
  });

  it("keeps the text around an address, including a trailing full stop", () => {
    expect(splitEmailAddresses("Ask ana.b@example.gd. Thanks")).toEqual([
      { isEmail: false, text: "Ask " },
      { isEmail: true, text: "ana.b@example.gd" },
      { isEmail: false, text: ". Thanks" },
    ]);
  });

  it("splits every address in the string", () => {
    expect(splitEmailAddresses("a@x.gd, b@y.example.com")).toEqual([
      { isEmail: true, text: "a@x.gd" },
      { isEmail: false, text: ", " },
      { isEmail: true, text: "b@y.example.com" },
    ]);
  });

  it("returns one plain segment when there is no address", () => {
    expect(splitEmailAddresses("1-473-444-4142")).toEqual([
      { isEmail: false, text: "1-473-444-4142" },
    ]);
  });

  it("returns no segments for an empty string", () => {
    expect(splitEmailAddresses("")).toEqual([]);
  });

  it("joins back to the original text", () => {
    const text = "Issued by Met (desk@gaa.gd) · 1-473-444-4142";
    const joined = splitEmailAddresses(text)
      .map((segment) => segment.text)
      .join("");
    expect(joined).toBe(text);
  });
});
