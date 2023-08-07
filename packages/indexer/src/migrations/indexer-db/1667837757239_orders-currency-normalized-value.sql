-- Up Migration

ALTER TABLE "orders" ADD COLUMN "currency_normalized_value" NUMERIC(78, 0);

-- Down Migration

ALTER TABLE "orders" DROP COLUMN "currency_normalized_value" NUMERIC(78, 0);