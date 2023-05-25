-- Up Migration

ALTER TABLE "tokens" ADD COLUMN "metadata" JSONB;

-- Down Migration