-- Up Migration

ALTER TABLE "collections" ADD COLUMN "marketplace_fees" JSONB;

-- Down Migration

ALTER TABLE "collections" DROP COLUMN "marketplace_fees";