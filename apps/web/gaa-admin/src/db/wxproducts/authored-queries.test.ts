import { beforeEach, describe, expect, it, vi } from "vitest";
import type { authoredProducts } from "@/db/wxproducts/schema/authored";
import type { ProductInput } from "@/lib/wxproducts/product-input";

type Row = typeof authoredProducts.$inferSelect;
const mocks = vi.hoisted(() => {
  const state: {
    previous: Row | null;
    publicRows: { published: Row["published"] }[];
    inserted: boolean;
  } = { previous: null, publicRows: [], inserted: true };
  const insertValues = vi.fn((_values: unknown) => ({
    onConflictDoNothing: () => ({
      returning: () =>
        Promise.resolve(state.inserted ? [{ id: "created" }] : []),
    }),
  }));
  const updateSet = vi.fn((_values: Partial<Row>) => ({
    where: () => Promise.resolve(),
  }));
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({
          for: () => Promise.resolve(state.previous ? [state.previous] : []),
        }),
      }),
    }),
    insert: () => ({ values: insertValues }),
    update: () => ({ set: updateSet }),
  };
  return {
    state,
    insertValues,
    updateSet,
    db: {
      transaction: (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
      select: () => ({
        from: () => ({ where: () => Promise.resolve(state.publicRows) }),
      }),
    },
  };
});
vi.mock("server-only", () => ({}));
vi.mock("@/db/wxproducts", () => ({ wxproductsDb: mocks.db }));

import {
  listPublishedProducts,
  RevisionConflict,
  writeAuthoredProduct,
} from "./authored-queries";

const id = "7d517fe0-a25b-4f12-a2b4-eaaed8116010";
const actor = { id: "staff", name: "Forecaster" };
function input(
  action: ProductInput["action"],
  expectedRevision = 1
): ProductInput {
  return {
    id,
    kind: "marine",
    values: { synopsis: "Edited synopsis" },
    expectedRevision,
    action,
    reviewed: true,
    changeSummary: "Updated conditions",
  };
}
function existing(): Row {
  const content = {
    kind: "marine" as const,
    values: {
      synopsis: "Public synopsis",
      issuedAt: "2026-09-08T05:00",
      validFrom: "2026-09-08T05:00",
      validTo: "2026-09-09T05:00",
    },
  };
  return {
    id,
    kind: "marine",
    draft: content,
    revision: 1,
    published: {
      ...content,
      id,
      revision: 1,
      publishedAt: "2026-09-08T09:00:00Z",
    },
    updatedAt: new Date("2026-09-08T09:00:00Z"),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.previous = existing();
  mocks.state.publicRows = [];
  mocks.state.inserted = true;
});
describe("product storage", () => {
  it("preserves the public snapshot while saving a new draft and appends actor history", async () => {
    const before = existing().published;
    const result = await writeAuthoredProduct(input("draft"), actor);
    expect(result.revision).toBe(2);
    expect(result.publishedRevision).toBe(1);
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        published: before,
        draft: { kind: "marine", values: { synopsis: "Edited synopsis" } },
      })
    );
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "draft",
        revision: 2,
        actorId: "staff",
        actorName: "Forecaster",
      })
    );
  });
  it("updates the publication only on explicit publish", async () => {
    const result = await writeAuthoredProduct(input("publish"), actor);
    expect(result.publishedRevision).toBe(2);
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        published: expect.objectContaining({
          values: { synopsis: "Edited synopsis" },
          revision: 2,
        }),
      })
    );
  });
  it("withdraws publication while retaining saved content and revision history", async () => {
    const result = await writeAuthoredProduct(input("withdraw"), actor);
    expect(result.publishedRevision).toBeNull();
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ published: null, draft: existing().draft })
    );
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ action: "withdraw", content: existing().draft })
    );
  });
  it("rejects stale updates before writing anything", async () => {
    await expect(
      writeAuthoredProduct(input("publish", 0), actor)
    ).rejects.toBeInstanceOf(RevisionConflict);
    expect(mocks.updateSet).not.toHaveBeenCalled();
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });
  it("rejects two first saves for the same identifier", async () => {
    mocks.state.previous = null;
    mocks.state.inserted = false;
    await expect(
      writeAuthoredProduct(input("draft", 0), actor)
    ).rejects.toBeInstanceOf(RevisionConflict);
    expect(mocks.insertValues).toHaveBeenCalledTimes(1);
  });
  it("returns only current published snapshots, never drafts", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-08T12:00:00Z"));
    mocks.state.publicRows = [
      { published: null },
      { published: existing().published },
    ];
    const results = await listPublishedProducts();
    expect(results).toEqual([existing().published]);
    expect(results[0]).not.toHaveProperty("draft");
    vi.restoreAllMocks();
  });
});
