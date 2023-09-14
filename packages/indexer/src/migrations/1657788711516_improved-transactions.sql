-- Up Migration

ALTER TABLE "transactions" ADD COLUMN "block_number" INT;
ALTER TABLE "transactions" ADD COLUMN "block_timestamp" INT;
ALTER TABLE "transactions" ADD COLUMN "gas_used" NUMERIC;
ALTER TABLE "transactions" ADD COLUMN "gas_price" NUMERIC;
ALTER TABLE "transactions" ADD COLUMN "gas_fee" NUMERIC;

-- Down Migration

ALTER TABLE "transactions" DROP COLUMN "gas_fee";
ALTER TABLE "transactions" DROP COLUMN "gas_price";
ALTER TABLE "transactions" DROP COLUMN "gas_used";
ALTER TABLE "transactions" DROP COLUMN "block_timestamp";
ALTER TABLE "transactions" DROP COLUMN "block_number";