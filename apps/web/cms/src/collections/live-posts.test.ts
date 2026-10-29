import { describe, expect, it } from "vitest";
import { PUBLISH_KEYS, WEATHER_NOW_NOTE_KEY } from "../access";
import {
  enforceNoteOrReview,
  guardLiveHazardWords,
  guardNoteScope,
  LivePosts,
} from "./live-posts";

const noteHolder = { id: 5, permissionKeys: [WEATHER_NOW_NOTE_KEY] };
const author = { id: 6, permissionKeys: ["cms.article.create"] };
const editor = {
  id: 7,
  permissionKeys: ["cms.article.edit.all", "cms.article.manage"],
};
const publisher = {
  id: 8,
  permissionKeys: ["cms.article.create", PUBLISH_KEYS["live-posts"]],
};

const update = (user: unknown) =>
  LivePosts.access?.update?.({ req: { user } } as never);
const create = (user: unknown) =>
  LivePosts.access?.create?.({ req: { user } } as never);

describe("who can post and edit live posts", () => {
  it("lets the note holder create and edit notes, and nothing else", () => {
    expect(create(noteHolder)).toBe(true);
    expect(update(noteHolder)).toEqual({
      or: [
        {
          and: [
            { author: { equals: 5 } },
            { status: { not_equals: "published" } },
          ],
        },
        { kind: { equals: "note" } },
      ],
    });
  });
  it("lets editors edit every post and authors edit only their own drafts", () => {
    expect(update(editor)).toBe(true);
    expect(update(author)).toEqual({
      and: [{ author: { equals: 6 } }, { status: { not_equals: "published" } }],
    });
  });
  it("turns away anyone signed out", () => {
    expect(create(null)).toBe(false);
    expect(update(null)).toBe(false);
  });
});

describe("the note holder stays inside the note", () => {
  const run = (kind: string, user: unknown) =>
    guardNoteScope({
      data: { kind },
      originalDoc: undefined,
      req: { user },
    } as never);
  it("refuses other kinds for a note-only user", () => {
    expect(() => run("update", noteHolder)).toThrow(
      "the duty forecaster's note only"
    );
  });
  it("allows the note, and any kind for a user who also writes articles", () => {
    expect(run("note", noteHolder)).toEqual({ kind: "note" });
    expect(run("update", author)).toEqual({ kind: "update" });
  });
});

describe("posting the note without the review step", () => {
  const run = (
    data: Record<string, unknown>,
    original: Record<string, unknown> | undefined,
    user: unknown
  ) =>
    enforceNoteOrReview(PUBLISH_KEYS["live-posts"])({
      data,
      originalDoc: original,
      req: { user },
    } as never);
  it("lets the note holder post a note straight from draft", () => {
    expect(
      run(
        { kind: "note", status: "published" },
        { status: "draft" },
        noteHolder
      )
    ).toEqual({ kind: "note", status: "published" });
  });
  it("refuses a note from someone who cannot post it", () => {
    expect(() =>
      run({ kind: "note", status: "published" }, { status: "draft" }, author)
    ).toThrow("duty forecaster's note");
  });
  it("keeps the review step for other kinds", () => {
    expect(() =>
      run(
        { kind: "update", status: "published" },
        { status: "draft" },
        publisher
      )
    ).toThrow("Submit the content for review");
    expect(
      run(
        { kind: "update", status: "published" },
        { kind: "update", status: "review" },
        publisher
      )
    ).toEqual({ kind: "update", status: "published" });
  });
});

describe("warning words in live posts", () => {
  const guard = (
    data: Record<string, unknown>,
    original?: Record<string, unknown>
  ) =>
    guardLiveHazardWords({
      data,
      originalDoc: original,
    } as never);
  it("needs the CAP alert link for a note that mentions a warning", () => {
    expect(() =>
      guard({
        title: "Duty forecaster's note",
        text: "A flood watch is in effect.",
      })
    ).toThrow("CAP alert");
    expect(
      guard({
        title: "Duty forecaster's note",
        text: "A flood watch is in effect.",
        relatedLinks: [
          {
            url: "https://weather.barrels.gd/alerts/GMS-1",
            category: "cap",
          },
        ],
      }).text
    ).toBe("A flood watch is in effect.");
  });
  it("accepts a note with no warning words", () => {
    expect(
      guard({
        title: "Duty forecaster's note",
        text: "Showers ease this afternoon.",
      }).text
    ).toBe("Showers ease this afternoon.");
  });
});
