import "server-only";
import type {
  ProductKind,
  PublishedProduct,
  StoredProduct,
} from "@barrelsgd/gms/products";
import { isCurrentProduct } from "@barrelsgd/gms/products";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { wxproductsDb as db } from "@/db/wxproducts";
import {
  authoredProducts,
  authoredRevisions,
} from "@/db/wxproducts/schema/authored";
import type { ProductInput } from "@/lib/wxproducts/product-input";

export class RevisionConflict extends Error {}
function stored(row: typeof authoredProducts.$inferSelect): StoredProduct {
  return {
    ...row.draft,
    id: row.id,
    revision: row.revision,
    publishedRevision: row.published?.revision ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}
export async function listAuthoredProducts(
  kind: ProductKind,
  issueDate: string
) {
  const rows = await db
    .select()
    .from(authoredProducts)
    .where(
      and(
        eq(authoredProducts.kind, kind),
        sql`(coalesce(${authoredProducts.draft}->'values'->>'issuedAt', '') = '' or left(${authoredProducts.draft}->'values'->>'issuedAt', 10) = ${issueDate})`
      )
    )
    .orderBy(desc(authoredProducts.updatedAt));
  return rows.map(stored);
}
export function getProductHistory(id: string, allowedKinds: ProductKind[]) {
  return db
    .select({
      revision: authoredRevisions.revision,
      action: authoredRevisions.action,
      actorName: authoredRevisions.actorName,
      changeSummary: authoredRevisions.changeSummary,
      createdAt: authoredRevisions.createdAt,
    })
    .from(authoredRevisions)
    .innerJoin(
      authoredProducts,
      eq(authoredProducts.id, authoredRevisions.productId)
    )
    .where(
      and(
        eq(authoredRevisions.productId, id),
        inArray(authoredProducts.kind, allowedKinds)
      )
    )
    .orderBy(desc(authoredRevisions.revision))
    .limit(100);
}
export function writeAuthoredProduct(
  input: ProductInput,
  actor: { id: string; name: string }
) {
  return db.transaction(async (tx) => {
    const [previous] = await tx
      .select()
      .from(authoredProducts)
      .where(eq(authoredProducts.id, input.id))
      .for("update");
    if (
      (previous?.revision ?? 0) !== input.expectedRevision ||
      (previous && previous.kind !== input.kind)
    )
      throw new RevisionConflict(
        "This product changed. Reload it before saving."
      );
    if (input.action === "withdraw" && !previous?.published)
      throw new RevisionConflict("This product is not published.");
    const revision = input.expectedRevision + 1;
    const now = new Date();
    const content =
      input.action === "withdraw" && previous
        ? previous.draft
        : { kind: input.kind, values: input.values };
    const published: PublishedProduct | null =
      input.action === "publish"
        ? { ...content, id: input.id, revision, publishedAt: now.toISOString() }
        : input.action === "withdraw"
          ? null
          : (previous?.published ?? null);
    const values = {
      kind: input.kind,
      draft: content,
      revision,
      published,
      updatedAt: now,
    };
    if (previous) {
      await tx
        .update(authoredProducts)
        .set(values)
        .where(
          and(
            eq(authoredProducts.id, input.id),
            eq(authoredProducts.revision, input.expectedRevision)
          )
        );
    } else {
      const inserted = await tx
        .insert(authoredProducts)
        .values({ id: input.id, ...values })
        .onConflictDoNothing()
        .returning({ id: authoredProducts.id });
      if (!inserted.length)
        throw new RevisionConflict(
          "This product was already saved. Reload it."
        );
    }
    await tx.insert(authoredRevisions).values({
      productId: input.id,
      revision,
      action: input.action,
      content,
      actorId: actor.id,
      actorName: actor.name,
      changeSummary: input.changeSummary,
    });
    return stored({ id: input.id, ...values });
  });
}
/** Only public snapshots cross this boundary; never drafts or audit/user IDs. */
export async function listPublishedProducts(
  kind?: ProductKind
): Promise<PublishedProduct[]> {
  const rows = await db
    .select({ published: authoredProducts.published })
    .from(authoredProducts)
    .where(
      kind
        ? and(
            isNotNull(authoredProducts.published),
            eq(authoredProducts.kind, kind)
          )
        : isNotNull(authoredProducts.published)
    );
  return rows
    .flatMap(({ published }) =>
      published && isCurrentProduct(published) ? [published] : []
    )
    .sort((a, b) => b.values.issuedAt.localeCompare(a.values.issuedAt));
}
