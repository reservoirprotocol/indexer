-- Up Migration

ALTER TABLE "fill_events_2" ADD COLUMN "is_primary" BOOLEAN;

-- Down Migration

ALTER TABLE "fill_events_2" DROP COLUMN "is_primary";