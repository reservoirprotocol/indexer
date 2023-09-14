-- Up Migration

CREATE TABLE "nonce_cancel_events" (
  "address" BYTEA NOT NULL,
  "block" INT NOT NULL,
  "block_hash" BYTEA NOT NULL,
  "tx_hash" BYTEA NOT NULL,
  "tx_index" INT NOT NULL,
  "log_index" INT NOT NULL,
  "timestamp" INT NOT NULL,
  "batch_index" INT NOT NULL,
  "order_kind" order_kind_t NOT NULL,
  "maker" BYTEA NOT NULL,
  "nonce" NUMERIC(78, 0) NOT NULL
);

ALTER TABLE "nonce_cancel_events"
  ADD CONSTRAINT "nonce_cancel_events_pk"
  PRIMARY KEY ("tx_hash", "log_index", "batch_index");

CREATE INDEX "nonce_cancel_events_block_block_hash_index"
  ON "nonce_cancel_events" ("block", "block_hash");

CREATE INDEX "nonce_cancel_events_order_kind_maker_nonce_index"
  ON "nonce_cancel_events" ("order_kind", "maker", "nonce");

-- Down Migration

DROP TABLE "nonce_cancel_events";