-- Up Migration

CREATE TABLE "nft_approval_events" (
  "address" BYTEA NOT NULL,
  "block" INT NOT NULL,
  "block_hash" BYTEA NOT NULL,
  "tx_hash" BYTEA NOT NULL,
  "tx_index" INT NOT NULL,
  "log_index" INT NOT NULL,
  "timestamp" INT NOT NULL,
  "batch_index" INT NOT NULL,
  "owner" BYTEA NOT NULL,
  "operator" BYTEA NOT NULL,
  "approved" BOOLEAN NOT NULL
);

ALTER TABLE "nft_approval_events"
  ADD CONSTRAINT "nft_approval_events_pk"
  PRIMARY KEY ("tx_hash", "log_index", "batch_index");

CREATE INDEX "nft_approval_events_block_block_hash_index"
  ON "nft_approval_events" ("block", "block_hash");

CREATE INDEX "nft_approval_events_address_owner_operator_block_index"
  ON "nft_approval_events" ("address", "owner", "operator", "block" DESC)
  INCLUDE ("approved");

CREATE TABLE "wyvern_proxies" (
  "owner" BYTEA NOT NULL,
  "proxy" BYTEA NOT NULL
);

ALTER TABLE "wyvern_proxies"
  ADD CONSTRAINT "wyvern_proxies_pk"
  PRIMARY KEY ("owner");

-- Down Migration

DROP TABLE "wyvern_proxies";

DROP TABLE "nft_approval_events";