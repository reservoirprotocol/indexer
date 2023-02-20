-- Up Migration

ALTER TABLE "blocks" ADD COLUMN "timestamp" INT;

-- Down Migration

ALTER TABLE "blocks" DROP COLUMN "timestamp";