-- Up Migration

CREATE TYPE "order_event_status_t" AS ENUM (
  'active',
  'inactive',
  'filled',
  'cancelled',
  'expired'
);

CREATE TABLE "order_events" (
  "id" BIGSERIAL NOT NULL,
  "kind" "token_floor_sell_event_kind_t" NOT NULL,
  "status" "order_event_status_t" NOT NULL,
  "contract" BYTEA NOT NULL,
  "token_id" NUMERIC(78, 0) NOT NULL,
  "order_id" TEXT NOT NULL,
  "order_source_id" BYTEA,
  "order_source_id_int" INT,
  "order_valid_between" TSTZRANGE,
  "order_quantity_remaining" NUMERIC(78, 0),
  "maker" BYTEA,
  "price" NUMERIC(78, 0),
  "tx_hash" BYTEA,
  "tx_timestamp" INT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "order_events"
  ADD CONSTRAINT "order_events_pk"
  PRIMARY KEY ("id");

CREATE INDEX "order_events_created_at_id_index"
  ON "order_events"("created_at", "id");

CREATE INDEX "order_events_contract_created_at_id_index"
  ON "order_events"("contract", "created_at", "id");

-- Down Migration

DROP TABLE "order_events";