-- Up Migration

ALTER TABLE "fill_events_2" ADD COLUMN "net_amount" NUMERIC(78, 0);

-- Down Migration

ALTER TABLE "fill_events_2" DROP COLUMN "net_amount";