-- Up Migration

ALTER TABLE "fill_events_2" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

-- Down Migration

ALTER TABLE "fill_events_2" DROP COLUMN "updated_at";
