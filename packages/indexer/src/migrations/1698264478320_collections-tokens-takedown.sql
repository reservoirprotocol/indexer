-- Up Migration

ALTER TABLE "collections" ADD COLUMN "is_takedown" INT;
ALTER TABLE "tokens" ADD COLUMN "is_takedown" INT;

-- Down Migration

ALTER TABLE "collections" DROP COLUMN "is_takedown";
ALTER TABLE "tokens" DROP COLUMN "is_takedown";
