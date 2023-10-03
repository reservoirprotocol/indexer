-- Up Migration

ALTER TABLE "fill_events_2" ADD COLUMN "comment" TEXT;

-- Down Migration

ALTER TABLE "fill_events_2" DROP COLUMN "comment";