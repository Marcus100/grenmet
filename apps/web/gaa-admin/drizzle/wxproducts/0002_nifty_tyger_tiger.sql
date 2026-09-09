CREATE TABLE "authored_products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"draft" jsonb NOT NULL,
	"revision" integer NOT NULL,
	"published" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "authored_product_revisions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "authored_product_revisions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"action" text NOT NULL,
	"content" jsonb NOT NULL,
	"actor_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"change_summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "authored_product_revisions" ADD CONSTRAINT "authored_product_revisions_product_id_authored_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."authored_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "authored_products_kind_idx" ON "authored_products" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "authored_revisions_product_version_idx" ON "authored_product_revisions" USING btree ("product_id","revision");