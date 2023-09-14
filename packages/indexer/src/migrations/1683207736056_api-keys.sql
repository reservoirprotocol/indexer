-- Up Migration

ALTER TABLE "api_keys" ADD COLUMN "ips" JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE "api_keys" ADD COLUMN "origins" JSONB NOT NULL DEFAULT '[]'::JSONB;

-- Down Migration

ALTER TABLE "api_keys" DROP COLUMN "ips";
ALTER TABLE "api_keys" DROP COLUMN "origins";