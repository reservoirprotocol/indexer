-- Up Migration

ALTER TABLE "tokens" ADD COLUMN "supply" INT;
ALTER TABLE "tokens" ADD COLUMN "remaining_supply" INT;

-- todo run this manually and uncomment after deployment
--CREATE INDEX "tokens_contract_remaining_supply_collection_id_index"
--  ON "tokens" ("contract", "remaining_supply", "collection_id");

-- Down Migration