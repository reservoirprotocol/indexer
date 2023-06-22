-- Up Migration

ALTER TABLE "collections" ADD COLUMN "payment_tokens" JSONB;

-- Down Migration

ALTER TABLE "collections" DROP COLUMN "payment_tokens";