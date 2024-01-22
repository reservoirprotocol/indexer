-- Up Migration

ALTER TABLE "collections" ADD COLUMN "nsfw_status" INT;
ALTER TABLE "tokens" ADD COLUMN "nsfw_status" INT;

-- Down Migration

ALTER TABLE "collections" DROP COLUMN "nsfw_status";
ALTER TABLE "tokens" DROP COLUMN "nsfw_status";