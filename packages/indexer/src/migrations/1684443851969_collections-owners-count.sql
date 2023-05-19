-- Up Migration

ALTER TABLE "collections" ADD COLUMN "owner_count" INT;

-- Down Migration

ALTER TABLE "collections" DROP COLUMN "owner_count";