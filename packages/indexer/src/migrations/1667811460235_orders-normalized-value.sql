-- Up Migration

ALTER TABLE "orders" ADD COLUMN "normalized_value" NUMERIC(78, 0);

-- Down Migration

ALTER TABLE "orders" DROP COLUMN "normalized_value" NUMERIC(78, 0);