-- Up Migration

ALTER TABLE "collections" ADD COLUMN "non_flagged_token_set_id" TEXT;

-- Down Migration