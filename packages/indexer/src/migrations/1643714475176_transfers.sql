-- Up Migration

CREATE TABLE "nft_transfer_events" (
  "address" BYTEA NOT NULL,
  "block" INT NOT NULL,
  "block_hash" BYTEA NOT NULL,
  "tx_hash" BYTEA NOT NULL,
  "tx_index" INT NOT NULL,
  "log_index" INT NOT NULL,
  "timestamp" INT NOT NULL,
  "batch_index" INT NOT NULL,
  "from" BYTEA NOT NULL,
  "to" BYTEA NOT NULL,
  "token_id" NUMERIC(78, 0) NOT NULL,
  "amount" NUMERIC(78, 0) NOT NULL
);

ALTER TABLE "nft_transfer_events"
  ADD CONSTRAINT "nft_transfer_events_pk"
  PRIMARY KEY ("tx_hash", "log_index", "batch_index");

CREATE INDEX "nft_transfer_events_block_block_hash_index"
  ON "nft_transfer_events" ("block", "block_hash");

CREATE INDEX "nft_transfer_events_timestamp_index"
  ON "nft_transfer_events" ("timestamp" DESC);

CREATE INDEX "nft_transfer_events_address_timestamp_index"
  ON "nft_transfer_events" ("address", "timestamp" DESC);

CREATE INDEX "nft_transfer_events_address_token_id_timestamp_index"
  ON "nft_transfer_events" ("address", "token_id", "timestamp" DESC);

CREATE TABLE "ft_transfer_events" (
  "address" BYTEA NOT NULL,
  "block" INT NOT NULL,
  "block_hash" BYTEA NOT NULL,
  "tx_hash" BYTEA NOT NULL,
  "tx_index" INT NOT NULL,
  "log_index" INT NOT NULL,
  "timestamp" INT NOT NULL,
  "from" BYTEA NOT NULL,
  "to" BYTEA NOT NULL,
  "amount" NUMERIC(78, 0) NOT NULL
);

ALTER TABLE "ft_transfer_events"
  ADD CONSTRAINT "ft_transfer_events_pk"
  PRIMARY KEY ("tx_hash", "log_index");

CREATE INDEX "ft_transfer_events_block_block_hash_index"
  ON "ft_transfer_events" ("block", "block_hash");

-- Down Migration

DROP TABLE "ft_transfer_events";

DROP TABLE "nft_transfer_events";