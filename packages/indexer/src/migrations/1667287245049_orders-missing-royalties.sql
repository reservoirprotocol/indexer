-- Up Migration

ALTER TABLE "orders" ADD COLUMN "missing_royalties" JSONB;

-- Down Migration

ALTER TABLE "orders" DROP COLUMN "missing_royalties" JSONB;