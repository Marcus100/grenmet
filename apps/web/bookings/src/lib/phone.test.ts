import { describe, expect, it } from "vitest";
import { telHref, whatsappDigits, whatsappHref } from "./phone";

describe("whatsappDigits", () => {
  it("keeps an international number, dropping the plus and punctuation", () => {
    expect(whatsappDigits("+1 (473) 444-1234")).toBe("14734441234");
    expect(whatsappDigits("+64 21 123 4567")).toBe("64211234567");
  });

  it("assumes Grenada for a 7-digit local number", () => {
    expect(whatsappDigits("444 1234")).toBe("14734441234");
    expect(whatsappDigits("444-1234")).toBe("14734441234");
  });

  it("adds the country code to a 10-digit number starting 473", () => {
    expect(whatsappDigits("473 444 1234")).toBe("14734441234");
    expect(whatsappDigits("(473) 444.1234")).toBe("14734441234");
  });

  it("gives nothing for anything else", () => {
    for (const junk of [
      "",
      "   ",
      "abc",
      "444 12",
      "4441234567",
      "14734441234",
      "+",
      "+12",
      "+1473444123456789",
      "444 1234 ext 5",
      "call me",
      "++14734441234",
      "+0 473 444 1234",
      "+01473444123",
      "00 1 473 444 1234",
    ]) {
      expect(whatsappDigits(junk), junk).toBeNull();
    }
    expect(whatsappDigits(null)).toBeNull();
    expect(whatsappDigits(undefined)).toBeNull();
  });
});

describe("whatsappHref", () => {
  it("is a wa.me path with digits only", () => {
    expect(whatsappHref("444 1234")).toBe("https://wa.me/14734441234");
    expect(whatsappHref("abc")).toBeNull();
  });
});

describe("telHref", () => {
  it("keeps digits and a leading plus", () => {
    expect(telHref("+1 (473) 444-1234")).toBe("tel:+14734441234");
    expect(telHref("444 1234")).toBe("tel:4441234");
  });

  it("uses only the leading number, never joining digits across words", () => {
    expect(telHref("444 1234 ext 5")).toBe("tel:4441234");
    expect(telHref("  +1 473 444 1234 (work) 99")).toBe("tel:+14734441234");
  });

  it("gives nothing when no digit is left", () => {
    expect(telHref("n/a")).toBeNull();
    expect(telHref("call 444 1234")).toBeNull();
    expect(telHref("")).toBeNull();
    expect(telHref(null)).toBeNull();
  });
});
