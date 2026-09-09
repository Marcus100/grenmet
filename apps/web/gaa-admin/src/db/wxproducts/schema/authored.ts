import type {
  ProductContent,
  ProductKind,
  PublishedProduct,
} from "@barrelsgd/gms/products";
import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";
export const authoredProducts = pgTable(
  "authored_products",
  (t) => ({
    id: t.uuid().primaryKey(),
    kind: t.text().$type<ProductKind>().notNull(),
    draft: t.jsonb().$type<ProductContent>().notNull(),
    revision: t.integer().notNull(),
    published: t.jsonb().$type<PublishedProduct>(),
    updatedAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
  }),
  (t) => [index("authored_products_kind_idx").on(t.kind)]
);
export const authoredRevisions = pgTable(
  "authored_product_revisions",
  (t) => ({
    id: t.integer().generatedAlwaysAsIdentity().primaryKey(),
    productId: t
      .uuid()
      .notNull()
      .references(() => authoredProducts.id),
    revision: t.integer().notNull(),
    action: t.text().$type<"draft" | "publish" | "withdraw">().notNull(),
    content: t.jsonb().$type<ProductContent>().notNull(),
    actorId: t.text().notNull(),
    actorName: t.text().notNull(),
    changeSummary: t.text().notNull(),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
  }),
  (t) => [
    uniqueIndex("authored_revisions_product_version_idx").on(
      t.productId,
      t.revision
    ),
  ]
);
