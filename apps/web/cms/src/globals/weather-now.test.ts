import { afterEach, describe, expect, it, vi } from "vitest";
import { stampNote } from "./weather-now";

const run = (
  data: Record<string, unknown>,
  original?: Record<string, unknown>
) =>
  stampNote({ data, originalDoc: original, req: { user: { id: 5 } } } as never);

afterEach(() => vi.useRealTimers());

describe("Weather now note", () => {
  it("signs, times and expires a new note at the next issue", () => {
    vi.useFakeTimers({ now: new Date("2026-09-29T14:00:00Z") }); // 10:00 AST
    const data = run({ note: { text: "  Showers ease by mid-afternoon. " } });
    expect(data.note).toMatchObject({
      text: "Showers ease by mid-afternoon.",
      postedBy: 5,
      postedAt: "2026-09-29T14:00:00.000Z",
      expiresAt: "2026-09-29T16:00:00.000Z",
    });
  });
  it("keeps an explicit future expiry", () => {
    vi.useFakeTimers({ now: new Date("2026-09-29T14:00:00Z") });
    const data = run({
      note: { text: "Hazy today.", expiresAt: "2026-09-29T22:00:00.000Z" },
    });
    expect(data.note.expiresAt).toBe("2026-09-29T22:00:00.000Z");
  });
  it("rejects warning words without the CAP alert link", () => {
    expect(() =>
      run({ note: { text: "A flood watch is in effect." } })
    ).toThrow("CAP alert");
    expect(
      run({
        note: {
          text: "A flood watch is in effect.",
          alertUrl: "https://weather.gd/alerts/1",
        },
      }).note.text
    ).toBe("A flood watch is in effect.");
  });
  it("clears everything when the text is removed", () => {
    expect(run({ note: { text: "" } }).note).toEqual({
      text: "",
      alertUrl: null,
      postedAt: null,
      expiresAt: null,
      postedBy: null,
    });
  });
});
