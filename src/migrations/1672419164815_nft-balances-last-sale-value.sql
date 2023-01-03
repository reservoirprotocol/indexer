-- Up Migration

ALTER TABLE "nft_balances" ADD COLUMN "last_sale_value" NUMERIC(78, 0);
ALTER TABLE "nft_balances" ADD COLUMN "last_sale_timestamp" INT;

-- CREATE INDEX "nft_balances_owner_last_sale_value_index"
-- ON "nft_balances" ("owner", "last_sale_value" DESC NULLS LAST)
-- WHERE ("amount" > 0);

-- Down Migration

ALTER TABLE "nft_balances" DROP COLUMN "last_sale_value";
ALTER TABLE "nft_balances" DROP COLUMN "last_sale_timestamp";
