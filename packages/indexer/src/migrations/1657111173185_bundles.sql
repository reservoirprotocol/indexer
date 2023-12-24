-- Up Migration

CREATE TABLE "bundles" (
  "id" BIGSERIAL NOT NULL,
  "metadata" JSONB
);

ALTER TABLE "bundles"
  ADD CONSTRAINT "bundles_pk"
  PRIMARY KEY ("id");

CREATE TYPE "bundle_item_kind_t" AS ENUM (
  'ft',
  'nft'
);

CREATE TABLE "bundle_items" (
  "bundle_id" BIGINT NOT NULL,
  "kind" "bundle_item_kind_t" NOT NULL,
  "token_set_id" TEXT NOT NULL,
  "amount" NUMERIC NOT NULL DEFAULT 1
);

ALTER TABLE "bundle_items"
  ADD CONSTRAINT "bundle_items_pk"
  PRIMARY KEY ("bundle_id", "token_set_id");

CREATE INDEX "bundle_items_token_set_id_bundle_id_index"
  ON "bundle_items" ("token_set_id", "bundle_id");

ALTER TYPE "order_side_t" ADD VALUE 'bundle';

CREATE TYPE "order_bundle_kind_t" AS ENUM (
  'bundle-ask'
);

ALTER TABLE "orders" ADD COLUMN "bundle_kind" "order_bundle_kind_t";
ALTER TABLE "orders" ADD COLUMN "offer_bundle_id" BIGINT;
ALTER TABLE "orders" ADD COLUMN "consideration_bundle_id" BIGINT;

-- Down Migration

ALTER TABLE "orders" DROP COLUMN "consideration_bundle_id";
ALTER TABLE "orders" DROP COLUMN "offer_bundle_id";
ALTER TABLE "orders" DROP COLUMN "bundle_kind";

DROP TYPE "order_bundle_kind_t";

DROP TABLE "bundle_items";

DROP TYPE "bundle_item_kind_t";

DROP TABLE "bundles";