-- Up Migration

-- TODO: Drop `fill_source` and `fill_source_t` since they are now redundant

ALTER TABLE "fill_events_2" ADD COLUMN "royalty_fee_bps" INT;

ALTER TABLE "fill_events_2" ADD COLUMN "marketplace_fee_bps" INT;

ALTER TABLE "fill_events_2" ADD COLUMN "fee_breakdown" JSONB;

ALTER TABLE "fill_events_2" ADD COLUMN "marketplace_fee_breakdown" JSONB;

ALTER TABLE "fill_events_2" ADD COLUMN "paid_full_royalty" BOOLEAN;

-- Down Migration

ALTER TABLE "fill_events_2" DROP COLUMN "royalty_fee_bps";

ALTER TABLE "fill_events_2" DROP COLUMN "marketplace_fee_bps";

ALTER TABLE "fill_events_2" DROP COLUMN "fee_breakdown";

ALTER TABLE "fill_events_2" DROP COLUMN "marketplace_fee_breakdown";

ALTER TABLE "fill_events_2" DROP COLUMN "paid_full_royalty";