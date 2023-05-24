-- Up Migration

CREATE TABLE "blend_salt_nonce_cancel_events" (
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

ALTER TABLE "blend_salt_nonce_cancel_events"
  ADD CONSTRAINT "blend_salt_nonce_cancel_events_pk"
  PRIMARY KEY ("tx_hash", "log_index", "batch_index");

CREATE INDEX "blend_salt_nonce_cancel_events_maker_nonce_index"
  ON "blend_salt_nonce_cancel_events" ("maker", "nonce");

-- Down Migration

DROP TABLE "blend_salt_nonce_cancel_events";