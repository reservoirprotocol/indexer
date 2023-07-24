-- Up Migration

ALTER TABLE "allowlists_items" ADD COLUMN "actual_price" NUMERIC(78, 0);

-- Down Migration