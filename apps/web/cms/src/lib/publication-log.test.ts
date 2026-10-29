import { describe, expect, it, vi } from "vitest";
import { publicationEvents, recordPublication } from "./publication-log";

const NOW = new Date("2026-10-29T12:00:00.000Z");
const LATER = "2026-10-29T18:00:00.000Z";

describe("which changes a save records", () => {
  it("records going live when a draft is published", () => {
    expect(
      publicationEvents({ status: "review" }, { status: "published" }, NOW)
    ).toEqual([{ action: "published", scheduledFor: null }]);
  });
  it("records a future show-from time as a scheduled publish", () => {
    expect(
      publicationEvents(
        { status: "review" },
        { status: "published", publishAt: LATER },
        NOW
      )
    ).toEqual([{ action: "scheduled-publish", scheduledFor: LATER }]);
  });
  it("records taking an item down", () => {
    expect(
      publicationEvents({ status: "published" }, { status: "draft" }, NOW)
    ).toEqual([{ action: "unpublished", scheduledFor: null }]);
  });
  it("records a new future take-off time, once", () => {
    const after = { status: "published", unpublishAt: LATER };
    expect(publicationEvents({ status: "published" }, after, NOW)).toEqual([
      { action: "scheduled-unpublish", scheduledFor: LATER },
    ]);
    expect(
      publicationEvents({ status: "published", unpublishAt: LATER }, after, NOW)
    ).toEqual([]);
  });
  it("records nothing for an ordinary edit of a published item", () => {
    expect(
      publicationEvents(
        { status: "published" },
        { status: "published", publishAt: null },
        NOW
      )
    ).toEqual([]);
  });
  it("records nothing for a draft that stays a draft", () => {
    expect(publicationEvents(undefined, { status: "draft" }, NOW)).toEqual([]);
  });
});

describe("the publication record hook", () => {
  it("writes one record in the same transaction, naming the editor", async () => {
    const create = vi.fn().mockResolvedValue({});
    const req = {
      user: { id: 7 },
      payload: { create },
    };
    const hook = recordPublication("stories", "title");
    const doc = {
      id: 42,
      title: "Season preparation",
      slug: "stories/2026/10/season-preparation",
      status: "published",
    };
    await hook({
      doc,
      previousDoc: { status: "review" },
      req,
    } as never);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      collection: "publication-log",
      overrideAccess: true,
      req,
      data: {
        action: "published",
        scheduledFor: null,
        collection: "stories",
        documentId: "42",
        title: "Season preparation",
        actor: 7,
      },
    });
  });
  it("names the item by its slug when it has no title, and records no one for a scheduled job", async () => {
    const create = vi.fn().mockResolvedValue({});
    const hook = recordPublication("questions", "question");
    await hook({
      doc: { id: 5, slug: "questions/why", status: "draft" },
      previousDoc: { status: "published" },
      req: { payload: { create } },
    } as never);
    expect(create.mock.calls[0]?.[0].data).toMatchObject({
      action: "unpublished",
      title: "questions/why",
      actor: null,
    });
  });
});
