-- Up Migration

ALTER TABLE "tokens" ADD COLUMN "supply" NUMERIC(78, 0);
ALTER TABLE "tokens" ADD COLUMN "remaining_supply" NUMERIC(78, 0);

CREATE INDEX "tokens_contract_remaining_supply_collection_id_index"
  ON "tokens" ("contract", "remaining_supply", "collection_id");

CREATE INDEX "tokens_collection_id_contract_token_id_remaining_supply_index"
  ON "tokens" ("collection_id", "contract", "token_id")
  WHERE ("remaining_supply" > 0 OR "remaining_supply" IS NULL);

-- Down Migration