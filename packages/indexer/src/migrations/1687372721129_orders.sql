-- Up Migration

ALTER TABLE "orders" DROP COLUMN "source_id";
ALTER TABLE "orders" DROP COLUMN "bundle_kind";
ALTER TABLE "orders" DROP COLUMN "offer_bundle_id";
ALTER TABLE "orders" DROP COLUMN "consideration_bundle_id";

DROP TYPE "order_bundle_kind_t";

-- Down Migration