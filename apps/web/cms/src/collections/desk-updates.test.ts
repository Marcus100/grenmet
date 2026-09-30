import { describe, expect, it } from "vitest";
import { guardHazardWords } from "./desk-updates";

const run = (data: Record<string, unknown>) =>
  guardHazardWords({ data, originalDoc: undefined } as never);

describe("desk update warning language", () => {
  it("needs a CAP link to mention a warning", () => {
    expect(() =>
      run({ title: "Flood warning for the north", summary: "Stay alert." })
    ).toThrow("CAP alert");
    expect(
      run({
        title: "Flood warning for the north",
        summary: "Stay alert.",
        relatedLinks: [
          {
            category: "cap",
            title: "The alert",
            url: "https://weather.gd/alerts/1",
          },
        ],
      }).title
    ).toBe("Flood warning for the north");
  });
  it("leaves ordinary notices alone", () => {
    expect(
      run({ title: "New marine page", summary: "Bulletins moved." }).title
    ).toBe("New marine page");
  });
});
