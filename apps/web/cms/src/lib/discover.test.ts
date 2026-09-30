import { describe, expect, it } from "vitest";
import { validateDiscover } from "../collections/discover";
import {
  daysApart,
  grenadaToday,
  pickDaily,
  pickOnThisDay,
  toQuiz,
} from "./public-feed";

describe("Grenada dates", () => {
  it("uses Grenada's calendar day, not UTC's", () => {
    // 02:30 UTC on 30 Sep is still 29 Sep in Grenada (UTC−4).
    expect(grenadaToday(new Date("2026-09-30T02:30:00Z")).iso).toBe(
      "2026-09-29"
    );
  });
  it("measures days across the year end", () => {
    expect(daysApart({ month: 12, day: 30 }, { month: 1, day: 2 })).toBe(3);
    expect(daysApart({ month: 9, day: 7 }, { month: 9, day: 7 })).toBe(0);
  });
});

describe("On this day", () => {
  const ivan = { title: "Ivan", month: 9, day: 7 };
  const janet = { title: "Janet", month: 9, day: 22 };
  it("prefers today's entry, then the nearest within a week", () => {
    expect(pickOnThisDay([ivan, janet], { month: 9, day: 22 })).toBe(janet);
    expect(pickOnThisDay([ivan, janet], { month: 9, day: 25 })).toBe(janet);
    expect(pickOnThisDay([ivan, janet], { month: 9, day: 10 })).toBe(ivan);
  });
  it("shows nothing when no entry is within a week", () => {
    expect(pickOnThisDay([ivan], { month: 11, day: 1 })).toBeNull();
  });
});

describe("daily fact", () => {
  it("changes each day and repeats in order", () => {
    const facts = ["a", "b", "c"];
    const first = pickDaily(facts, { year: 2026, month: 9, day: 29 });
    const next = pickDaily(facts, { year: 2026, month: 9, day: 30 });
    const later = pickDaily(facts, { year: 2026, month: 10, day: 2 });
    expect(first).not.toBe(next);
    expect(later).toBe(first);
    expect(pickDaily([], { year: 2026, month: 9, day: 29 })).toBeNull();
  });
});

describe("quizzes", () => {
  const question = (correct: number) => ({
    prompt: "Which cloud brings thunder?",
    options: [{ text: "Cumulonimbus" }, { text: "Cirrus" }],
    correct,
    explanation: "Tall storm clouds.",
  });
  const run = (data: Record<string, unknown>) =>
    validateDiscover({ data } as never);
  it("needs at least three questions with a real correct option", () => {
    expect(() => run({ type: "quiz", questions: [question(1)] })).toThrow(
      "three"
    );
    expect(() =>
      run({ type: "quiz", questions: [question(1), question(1), question(3)] })
    ).toThrow("Question 3");
    expect(
      run({ type: "quiz", questions: [question(1), question(2), question(1)] })
        .type
    ).toBe("quiz");
  });
  it("rejects a sky note that ends before it starts", () => {
    expect(() =>
      run({ type: "sky-note", startsOn: "2026-10-02", endsOn: "2026-10-01" })
    ).toThrow("ends before");
  });
  it("gives the site zero-based answers", () => {
    expect(
      toQuiz({
        title: "Clouds",
        slug: "discover/clouds",
        questions: [question(2)],
      }).questions[0]
    ).toMatchObject({ options: ["Cumulonimbus", "Cirrus"], answer: 1 });
  });
});
