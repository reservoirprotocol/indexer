-- Up Migration

ALTER TABLE "fill_events_2" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX "fill_events_2_updated_at_tx_hash_index"
  ON "fill_events_2" ("updated_at", "tx_hash", "log_index", "batch_index");

CREATE INDEX "fill_events_2_contract_updated_at_tx_hash_index"
  ON "fill_events_2" ("contract", "updated_at", "tx_hash", "log_index", "batch_index");

-- Down Migration

ALTER TABLE "fill_events_2" DROP COLUMN "updated_at";
