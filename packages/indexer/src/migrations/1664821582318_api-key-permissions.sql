-- Up Migration

ALTER TABLE "api_keys" ADD COLUMN "permissions" JSONB;

-- Down Migration

ALTER TABLE "api_keys" DROP COLUMN "permissions";