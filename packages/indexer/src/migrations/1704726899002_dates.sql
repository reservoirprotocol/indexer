-- Up Migration

ALTER TABLE "nft_balances" ADD COLUMN "created_at" TIMESTAMPTZ DEFAULT now();
ALTER TABLE "nft_balances" ADD COLUMN "updated_at" TIMESTAMPTZ DEFAULT now();

-- Down Migration
