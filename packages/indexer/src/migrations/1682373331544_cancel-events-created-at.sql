-- Up Migration

ALTER TABLE "cancel_events" ADD COLUMN "created_at" TIMESTAMPTZ;
ALTER TABLE "cancel_events" ALTER "created_at" SET DEFAULT now();

-- Down Migration

ALTER TABLE "cancel_events" DROP COLUMN "created_at";
