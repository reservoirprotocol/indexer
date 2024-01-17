-- Up Migration

ALTER TABLE "nft_balances" ADD COLUMN "is_spam" INT;

-- Down Migration
