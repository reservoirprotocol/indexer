-- Up Migration

-- TODO: Drop `fill_source` and `fill_source_t` since they are now redundant

ALTER TABLE "fill_events_2" ADD COLUMN "fill_source_id" INT;

ALTER TABLE "fill_events_2" ADD COLUMN "aggregator_source_id" INT;

-- Down Migration

ALTER TABLE "fill_events_2" DROP COLUMN "aggregator_source_id";

ALTER TABLE "fill_events_2" DROP COLUMN "fill_source_id";