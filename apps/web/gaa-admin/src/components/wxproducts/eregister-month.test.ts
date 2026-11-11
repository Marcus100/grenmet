import { describe, expect, it } from "vitest";
import {
  columnTitle,
  currentMonth,
  IMPORT_NOTE_PREFIX,
  isDay,
  localSlot,
  monthCounts,
  monthCsv,
  monthRange,
  monthRows,
  NO_FILTERS,
  type Observation,
  parseWorkbookSearch,
  problemMessages,
  problemsByKey,
  rowMatches,
  shiftMonth,
  sourceOf,
  utcHourLabel,
  WORKBOOK_COLUMNS,
} from "./eregister-month";

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    actor_id: "u1",
    actor_name: "Observer One",
    body: { YY: "14", GG: "16", notes: "" },
    coded: "AAXX 14164 78958",
    created_at: "2026-10-14T16:05:00Z",
    id: "o1",
    issues: [],
    kind: "SYNOP",
    observed_at: "2026-10-14T16:00:00Z",
    state: "historical",
    station_id: "78958",
    updated_at: "2026-10-14T16:05:00Z",
    ...overrides,
  } as Observation;
}

describe("month range", () => {
  it("runs from local midnight on the 1st to local midnight on the next 1st", () => {
    const range = monthRange("2026-10");
    expect(range.from).toBe("2026-10-01T04:00:00.000Z");
    expect(range.to).toBe("2026-11-01T04:00:00.000Z");
    expect(range.days).toHaveLength(31);
    expect(range.days[0]).toBe("2026-10-01");
    expect(range.days.at(-1)).toBe("2026-10-31");
  });

  it("crosses the year and knows February", () => {
    expect(monthRange("2026-12").to).toBe("2027-01-01T04:00:00.000Z");
    expect(monthRange("2028-02").days).toHaveLength(29);
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("takes the current month in Grenada time", () => {
    // 02:00 UTC on 1 Nov is still 31 Oct in Grenada.
    expect(currentMonth(new Date("2026-11-01T02:00:00Z"))).toBe("2026-10");
    expect(currentMonth(new Date("2026-11-01T05:00:00Z"))).toBe("2026-11");
  });
});

describe("local slots", () => {
  it("files 03:00 UTC under the previous local day at 23:00", () => {
    expect(localSlot("2026-10-15T03:00:00Z")).toEqual({
      day: "2026-10-14",
      hour: 23,
    });
  });

  it("reads timestamps without a zone as UTC", () => {
    expect(localSlot("2026-10-14T16:00:00")).toEqual({
      day: "2026-10-14",
      hour: 12,
    });
  });

  it("labels the UTC hour of a local hour", () => {
    expect(utcHourLabel(12)).toBe("16:00");
    expect(utcHourLabel(21)).toBe("01:00");
  });
});

describe("month rows", () => {
  it("has every hour, with recorded hours filled", () => {
    const rows = monthRows("2026-10", [observation()]);
    expect(rows).toHaveLength(31 * 24);
    const filled = rows.filter((row) => row.observation);
    expect(filled).toEqual([
      expect.objectContaining({ day: "2026-10-14", hour: 12 }),
    ]);
  });

  it("never fills an hour with a superseded or rejected record", () => {
    const rows = monthRows("2026-10", [
      observation({ id: "old", state: "superseded" }),
      observation({ id: "bad", state: "rejected" }),
    ]);
    expect(rows.filter((row) => row.observation)).toHaveLength(0);
  });

  it("keeps the newest live record when an hour holds two", () => {
    const rows = monthRows("2026-10", [
      observation({ id: "a", updated_at: "2026-10-14T16:05:00Z" }),
      observation({ id: "b", updated_at: "2026-10-14T17:00:00Z" }),
    ]);
    expect(rows.find((row) => row.observation)?.observation?.id).toBe("b");
  });
});

describe("source and problems", () => {
  it("knows imported rows by the importer's note", () => {
    expect(
      sourceOf(observation({ body: { notes: `${IMPORT_NOTE_PREFIX}, row 5` } }))
    ).toBe("imported");
    expect(sourceOf(observation())).toBe("keyed");
  });

  it("keeps the worst finding per field and each message once", () => {
    const record = observation({
      issues: [
        {
          code: "a",
          field: "TT",
          message: "Check temperature",
          severity: "warning",
        },
        {
          code: "b",
          field: "TT",
          message: "Temperature out of range",
          severity: "error",
        },
        {
          code: "c",
          field: "TT",
          message: "Check temperature",
          severity: "warning",
        },
      ],
    });
    expect(problemsByKey(record).get("TT")).toBe("error");
    expect(problemMessages(record)).toEqual([
      "Temperature out of range",
      "Check temperature",
    ]);
  });
});

describe("filters", () => {
  const imported = observation({
    body: { notes: `${IMPORT_NOTE_PREFIX}, row 9` },
    issues: [
      { code: "x", field: "TT", message: "Odd value", severity: "warning" },
    ],
  });
  const row = { day: "2026-10-14", hour: 12, observation: imported };
  const empty = { day: "2026-10-14", hour: 13 };

  it("shows empty hours only while nothing is filtered", () => {
    expect(rowMatches(empty, NO_FILTERS)).toBe(true);
    expect(rowMatches(empty, { ...NO_FILTERS, problemsOnly: true })).toBe(
      false
    );
  });

  it("filters by state group, source, problems and text", () => {
    expect(rowMatches(row, { ...NO_FILTERS, state: "historical" })).toBe(true);
    expect(rowMatches(row, { ...NO_FILTERS, state: "accepted" })).toBe(false);
    expect(rowMatches(row, { ...NO_FILTERS, source: "keyed" })).toBe(false);
    expect(rowMatches(row, { ...NO_FILTERS, problemsOnly: true })).toBe(true);
    expect(rowMatches(row, { ...NO_FILTERS, search: "odd VALUE" })).toBe(true);
    expect(rowMatches(row, { ...NO_FILTERS, search: "rain" })).toBe(false);
  });

  it("treats awaiting QC as awaiting acceptance", () => {
    const pending = {
      ...row,
      observation: observation({ state: "qc_pending" }),
    };
    expect(rowMatches(pending, { ...NO_FILTERS, state: "draft" })).toBe(true);
  });
});

describe("counts", () => {
  it("counts recorded, missing, states, problems and reviews", () => {
    const rows = monthRows("2026-10", [
      observation({ review_outcome: "reviewed" }),
      observation({
        id: "2",
        issues: [{ code: "x", field: "", message: "m", severity: "warning" }],
        observed_at: "2026-10-14T17:00:00Z",
        state: "accepted",
      }),
    ]);
    expect(monthCounts(rows)).toEqual({
      accepted: 1,
      draft: 0,
      historical: 1,
      missing: 31 * 24 - 2,
      recorded: 2,
      reviewed: 1,
      withProblems: 1,
    });
  });
});

describe("CSV export", () => {
  it("writes a header and one line per hour, Excel-safe", () => {
    const record = observation({
      body: { notes: '=HYPERLINK("x")', YY: "14", GG: "16" },
      issues: [
        {
          code: "x",
          field: "",
          message: 'Say "hi", twice',
          severity: "warning",
        },
      ],
    });
    const csv = monthCsv([
      { day: "2026-10-14", hour: 12, observation: record },
      { day: "2026-10-14", hour: 13 },
    ]);
    expect(csv.startsWith("\uFEFFDate (local),Hour (local),UTC,State")).toBe(
      true
    );
    const lines = csv.trimEnd().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("2026-10-14,12:00,16:00,Historical,Keyed");
    expect(lines[1]).toContain('"Say ""hi"", twice"');
    expect(lines[2]).toContain("Not recorded");
  });

  it("has one titled column per stored reading", () => {
    const titles = WORKBOOK_COLUMNS.map(columnTitle);
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles.every((title) => title.length > 0)).toBe(true);
  });
});

describe("URL parsing", () => {
  it("accepts a valid month, day and filters", () => {
    expect(
      parseWorkbookSearch({
        day: "2026-10-14",
        month: "2026-10",
        problems: "1",
        q: "rain",
        source: "imported",
        state: "historical",
      })
    ).toEqual({
      day: "2026-10-14",
      filters: {
        problemsOnly: true,
        search: "rain",
        source: "imported",
        state: "historical",
      },
      month: "2026-10",
    });
  });

  it("drops a day outside the month and unknown filter values", () => {
    const parsed = parseWorkbookSearch({
      day: "2026-11-02",
      month: "2026-10",
      source: "fax",
      state: "nope",
    });
    expect(parsed.day).toBeUndefined();
    expect(parsed.filters).toEqual(NO_FILTERS);
    expect(isDay("2026-02-30")).toBe(false);
  });
});
