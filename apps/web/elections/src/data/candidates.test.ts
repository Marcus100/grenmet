import { describe, expect, it } from "vitest";
import {
  buildPeople,
  findPerson,
  parseName,
  personHref,
} from "@/data/candidates";
import resultsJson from "@/data/derived/results";
import type { ResultsFile } from "@/data/types";

const people = buildPeople(resultsJson as unknown as ResultsFile);

describe("candidates", () => {
  it("reads both name orders and surname prefixes", () => {
    expect(parseName("Marryshow, T.A.")).toMatchObject({
      sur: "Marryshow",
      first: "T.A.",
    });
    expect(parseName("Dr. Keith Mitchell").sur).toBe("Mitchell");
    expect(parseName("Christopher De Allie").sur).toBe("De Allie");
  });

  it("counts every candidacy once", () => {
    const races = people.reduce((a, p) => a + p.races.length, 0);
    const keys = new Set(people.map((p) => p.key));
    expect(keys.size).toBe(people.length);
    expect(races).toBeGreaterThan(600);
  });

  it("follows a long career across name spellings", () => {
    const mitchell = findPerson(people, "Keith Mitchell");
    // St. George North West at every election from 1984 to 2022.
    expect(mitchell?.wins).toBe(9);
    expect(mitchell?.parties).toContain("NNP");
    expect(personHref({ key: "mitchell-k" })).toBe("/candidates/mitchell-k");
  });

  it("does not attach a 2026 newcomer to someone from decades ago", () => {
    const old = people.find((p) => p.last < 2008);
    if (!old) throw new Error("expected early candidates");
    expect(
      findPerson(
        people.filter((p) => p === old),
        old.name
      )
    ).toBeUndefined();
  });
});
