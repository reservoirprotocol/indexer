-- Up Migration

CREATE TABLE "looksrare_v2_subset_nonce_cancel_events" (
  "address" BYTEA NOT NULL,
  "block" INT NOT NULL,
  "block_hash" BYTEA NOT NULL,
  "tx_hash" BYTEA NOT NULL,
  "tx_index" INT NOT NULL,
  "log_index" INT NOT NULL,
  "timestamp" INT NOT NULL,
  "batch_index" INT NOT NULL,
  "maker" BYTEA NOT NULL,
  "nonce" NUMERIC(78, 0) NOT NULL
);

ALTER TABLE "looksrare_v2_subset_nonce_cancel_events"
  ADD CONSTRAINT "looksrare_v2_subset_nonce_cancel_events_pk"
  PRIMARY KEY ("tx_hash", "log_index", "batch_index");


CREATE INDEX "looksrare_v2_subset_nonce_cancel_events_order_kind_maker_nonce_index"
  ON "looksrare_v2_subset_nonce_cancel_events" ("maker", "nonce");

-- Down Migration

DROP TABLE "looksrare_v2_subset_nonce_cancel_events";