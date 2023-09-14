-- Up Migration

ALTER TABLE "fill_events_2" ADD COLUMN "wash_trading_score" DOUBLE PRECISION;

ALTER TABLE "daily_volumes" ADD COLUMN "volume_clean" NUMERIC(78, 0);
ALTER TABLE "daily_volumes" ADD COLUMN "rank_clean" INT;
ALTER TABLE "daily_volumes" ADD COLUMN "floor_sell_value_clean" NUMERIC(78, 0);
ALTER TABLE "daily_volumes" ADD COLUMN "sales_count_clean" INT;

-- Down Migration

ALTER TABLE "fill_events_2" DROP COLUMN "wash_trading_score";

ALTER TABLE "daily_volumes" DROP COLUMN "volume_clean";
ALTER TABLE "daily_volumes" DROP COLUMN "rank_clean";
ALTER TABLE "daily_volumes" DROP COLUMN "floor_sell_value_clean";
ALTER TABLE "daily_volumes" DROP COLUMN "sales_count_clean";