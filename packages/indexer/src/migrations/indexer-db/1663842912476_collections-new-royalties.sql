-- Up Migration

ALTER TABLE "collections" ADD COLUMN "new_royalties" JSONB;

-- Down Migration

ALTER TABLE "collections" DROP COLUMN "new_royalties" JSONB;