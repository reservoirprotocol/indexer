-- Up Migration

ALTER TABLE "rate_limit_rules" ADD COLUMN "payload" JSONB NOT NULL DEFAULT '[]'::JSONB;

-- Down Migration

ALTER TABLE "rate_limit_rules" DROP COLUMN "payload";