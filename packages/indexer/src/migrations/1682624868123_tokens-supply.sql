-- Up Migration

ALTER TABLE "tokens" ADD COLUMN "supply" NUMERIC(78, 0);
ALTER TABLE "tokens" ADD COLUMN "remaining_supply" NUMERIC(78, 0);

-- todo run this manually and uncomment after deployment
--CREATE INDEX "tokens_contract_remaining_supply_collection_id_index"
--  ON "tokens" ("contract", "remaining_supply", "collection_id");

-- Down Migration