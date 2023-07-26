-- Up Migration

ALTER TABLE "tokens" ADD COLUMN "minted_timestamp" INT;

-- Down Migration