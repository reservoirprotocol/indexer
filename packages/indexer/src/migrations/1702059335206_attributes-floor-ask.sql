-- Up Migration
ALTER TABLE "attributes" ADD COLUMN "floor_sell_id" TEXT;
ALTER TABLE "attributes" ADD COLUMN "floor_sell_maker" BYTEA;
ALTER TABLE "attributes" ADD COLUMN "floor_sell_valid_from" INT;
ALTER TABLE "attributes" ADD COLUMN "floor_sell_valid_to" INT;
ALTER TABLE "attributes" ADD COLUMN "floor_sell_source_id_int" INT;
ALTER TABLE "attributes" ADD COLUMN "floor_sell_currency" BYTEA;
ALTER TABLE "attributes" ADD COLUMN "floor_sell_currency_value" NUMERIC(78, 0);


-- Down Migration

ALTER TABLE "attributes" DROP COLUMN "floor_sell_id";
ALTER TABLE "attributes" DROP COLUMN "floor_sell_maker";
ALTER TABLE "attributes" DROP COLUMN "floor_sell_valid_from";
ALTER TABLE "attributes" DROP COLUMN "floor_sell_valid_to";
ALTER TABLE "attributes" DROP COLUMN "floor_sell_source_id_int";
ALTER TABLE "attributes" DROP COLUMN "floor_sell_currency";
ALTER TABLE "attributes" DROP COLUMN "floor_sell_currency_value";
