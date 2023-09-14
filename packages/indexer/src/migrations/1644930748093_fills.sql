-- Up Migration

CREATE TYPE fill_source_t AS ENUM (
  'reservoir',
  'gem',
  'genie'
);

CREATE TABLE "fill_events_2" (
  "address" BYTEA NOT NULL,
  "block" INT NOT NULL,
  "block_hash" BYTEA NOT NULL,
  "tx_hash" BYTEA NOT NULL,
  "tx_index" INT NOT NULL,
  "log_index" INT NOT NULL,
  "timestamp" INT NOT NULL,
  "batch_index" INT NOT NULL,
  "order_kind" order_kind_t NOT NULL,
  "order_source_id_int" INT,
  "order_id" TEXT,
  "order_side" order_side_t NOT NULL,
  "maker" BYTEA NOT NULL,
  "taker" BYTEA NOT NULL,
  "price" NUMERIC(78, 0) NOT NULL,
  "contract" BYTEA NOT NULL,
  "token_id" NUMERIC(78, 0) NOT NULL,
  "amount" NUMERIC(78, 0) NOT NULL,
  "fill_source" fill_source_t,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted" INT NOT NULL DEFAULT 0
);

ALTER TABLE "fill_events_2"
  ADD CONSTRAINT "fill_events_2_pk"
  PRIMARY KEY ("tx_hash", "log_index", "batch_index", "block_hash");

CREATE INDEX "fill_events_2_block_block_hash_index"
  ON "fill_events_2" ("block", "block_hash");

CREATE INDEX "fill_events_2_timestamp_log_index_batch_index_index"
  ON "fill_events_2" ("timestamp", "log_index", "batch_index");

CREATE INDEX "fill_events_2_contract_is_deleted_timestamp_log_index_batch_index_index"
  ON "fill_events_2" ("contract", "is_deleted", "timestamp", "log_index", "batch_index");

CREATE INDEX "fill_events_2_contract_token_id_is_deleted_timestamp_log_index_batch_index_index"
  ON "fill_events_2" ("contract", "token_id", "is_deleted", "timestamp", "log_index", "batch_index");

CREATE INDEX "fill_events_2_order_id_timestamp_index"
  ON "fill_events_2" ("order_id", "timestamp");

CREATE INDEX "fill_events_2_created_at_tx_hash_log_index_batch_index_index"
  ON "fill_events_2" ("created_at", "tx_hash", "log_index", "batch_index");

CREATE INDEX "fill_events_2_maker_taker_contract"
  ON "fill_events_2" ("maker", "taker", "contract");

CREATE INDEX "fill_events_2_contract_is_deleted_price_index"
  ON "fill_events_2" ("contract", "is_deleted", "price");

-- Down Migration

DROP TABLE "fill_events_2";