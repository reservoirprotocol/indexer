-- Up Migration

ALTER TABLE "collections" ADD COLUMN "metadata_disabled" INT;
ALTER TABLE "tokens" ADD COLUMN "metadata_disabled" INT;

-- Down Migration

ALTER TABLE "collections" DROP COLUMN "metadata_disabled";
ALTER TABLE "tokens" DROP COLUMN "metadata_disabled";
