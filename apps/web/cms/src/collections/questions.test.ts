import { describe, expect, it } from "vitest";
import { toQuestion } from "../lib/public-feed";
import { stampScienceCheck } from "./questions";

const run = (
  data: Record<string, unknown>,
  original?: Record<string, unknown>
) =>
  stampScienceCheck({
    data,
    originalDoc: original,
    req: { user: { id: 7 } },
  } as never);

describe("science check", () => {
  it("records who checked and when, and clears both when unticked", () => {
    const checked = run({ scienceCheck: { checked: true } });
    expect(checked.scienceCheck).toMatchObject({ checked: true, checkedBy: 7 });
    expect(Date.parse(checked.scienceCheck.checkedAt)).not.toBeNaN();
    expect(
      run({ scienceCheck: { checked: false } }, checked).scienceCheck
    ).toEqual({
      checked: false,
      checkedAt: null,
      checkedBy: null,
    });
  });
  it("keeps the original stamp on later edits", () => {
    const original = {
      scienceCheck: {
        checked: true,
        checkedAt: "2026-09-01T00:00:00Z",
        checkedBy: 3,
      },
    };
    expect(
      run({ scienceCheck: { checked: true, checkedBy: 99 } }, original)
        .scienceCheck
    ).toEqual(original.scienceCheck);
    expect(run({ question: "Edited" }, original).scienceCheck).toEqual(
      original.scienceCheck
    );
  });
});

describe("public question", () => {
  it("shows only the check date and only published related items", () => {
    const question = toQuestion({
      id: 1,
      question: "What is a tropical wave?",
      slug: "questions/what-is-a-tropical-wave",
      shortAnswer: "A ripple in the trade winds.",
      body: "Text",
      updatedAt: "2026-09-20T00:00:00Z",
      scienceCheck: {
        checked: true,
        checkedAt: "2026-09-20T00:00:00Z",
        checkedBy: { email: "PRIVATE" },
      },
      related: [
        {
          relationTo: "stories",
          value: {
            title: "Waves",
            slug: "stories/2026/09/waves",
            status: "published",
          },
        },
        {
          relationTo: "stories",
          value: {
            title: "Draft",
            slug: "stories/2026/09/draft",
            status: "draft",
          },
        },
        { relationTo: "questions", value: 12 },
      ],
    });
    expect(question.checkedAt).toBe("2026-09-20T00:00:00Z");
    expect(question.related).toEqual([
      { collection: "stories", title: "Waves", slug: "stories/2026/09/waves" },
    ]);
    expect(JSON.stringify(question)).not.toContain("PRIVATE");
  });
});
