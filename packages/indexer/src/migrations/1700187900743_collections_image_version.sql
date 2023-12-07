-- Up Migration
ALTER TABLE "collections" ADD COLUMN "image_version" TIMESTAMPTZ;


-- Down Migration

ALTER TABLE "collections" DROP COLUMN "image_version";