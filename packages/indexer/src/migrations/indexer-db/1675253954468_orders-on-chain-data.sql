-- Up Migration

ALTER TABLE "orders" ADD COLUMN "block_number" INT;
ALTER TABLE "orders" ADD COLUMN "log_index" INT;

-- Down Migration

ALTER TABLE "orders" DROP COLUMN "log_index";
ALTER TABLE "orders" DROP COLUMN "block_number";