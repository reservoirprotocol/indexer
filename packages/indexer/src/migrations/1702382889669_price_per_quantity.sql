-- Up Migration

ALTER TABLE "collection_mints" ADD COLUMN "price_per_quantity" JSONB;

-- Down Migration

ALTER TABLE "collection_mints" DROP COLUMN "price_per_quantity";