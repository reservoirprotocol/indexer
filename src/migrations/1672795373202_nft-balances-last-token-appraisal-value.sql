-- Up Migration

ALTER TABLE "nft_balances" ADD COLUMN "last_token_appraisal_value" NUMERIC(78, 0);

ALTER TABLE "nft_balances" DROP COLUMN "last_sale_value";
ALTER TABLE "nft_balances" DROP COLUMN "last_sale_timestamp";

-- Down Migration

ALTER TABLE "nft_balances" DROP COLUMN "last_token_appraisal_value";


