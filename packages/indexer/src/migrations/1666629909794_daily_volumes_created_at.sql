-- Up Migration

ALTER TABLE "daily_volumes" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "daily_volumes" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

-- Down Migration

ALTER TABLE "daily_volumes" DROP COLUMN "created_at";
ALTER TABLE "daily_volumes" DROP COLUMN "updated_at";
