-- Up Migration

ALTER TABLE "nft_balances" ADD COLUMN "created_at" TIMESTAMPTZ;
ALTER TABLE "nft_balances" ADD COLUMN "updated_at" TIMESTAMPTZ;

-- Down Migration
