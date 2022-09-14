-- Up Migration

ALTER TABLE "api_keys" ADD COLUMN "tier" INT NOT NULL DEFAULT 0;

-- Down Migration