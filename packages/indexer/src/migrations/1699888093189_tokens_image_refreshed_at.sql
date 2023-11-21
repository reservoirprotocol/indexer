-- Up Migration
ALTER TABLE "tokens" ADD COLUMN "image_version" TIMESTAMPTZ;


-- Down Migration

ALTER TABLE "tokens" DROP COLUMN "image_version";