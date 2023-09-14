-- Up Migration

CREATE TYPE "token_floor_sell_event_kind_t" AS ENUM (
  'bootstrap',
  'new-order',
  'expiry',
  'sale',
  'cancel',
  'balance-change',
  'approval-change',
  'revalidation',
  'reprice'
);

CREATE TABLE "token_floor_sell_events" (
  "id" BIGSERIAL NOT NULL,
  "kind" "token_floor_sell_event_kind_t" NOT NULL,
  "contract" BYTEA NOT NULL,
  "token_id" NUMERIC(78, 0) NOT NULL,
  "order_id" TEXT,
  "maker" BYTEA,
  "price" NUMERIC(78, 0),
  "source_id_int" INT,
  "valid_between" TSTZRANGE,
  "nonce" NUMERIC(78, 0),
  "previous_price" NUMERIC(78, 0),
  "tx_hash" BYTEA,
  "tx_timestamp" INT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "token_floor_sell_events"
  ADD CONSTRAINT "token_floor_sell_events_pk"
  PRIMARY KEY ("id");

CREATE INDEX "token_floor_sell_events_created_at_id_index"
  ON "token_floor_sell_events"("created_at", "id");

CREATE INDEX "token_floor_sell_events_contract_created_at_id_index"
  ON "token_floor_sell_events"("contract", "created_at", "id");

CREATE INDEX "token_floor_sell_events_contract_token_id_created_at_id_index"
  ON "token_floor_sell_events"("contract", "token_id", "created_at", "id");

-- Down Migration

DROP TABLE "token_floor_sell_events";