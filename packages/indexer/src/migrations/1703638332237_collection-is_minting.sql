-- Up Migration

ALTER TABLE "collections" ADD COLUMN "is_minting" BOOLEAN;

-- Down Migration

ALTER TABLE "collections" DROP COLUMN "is_minting";