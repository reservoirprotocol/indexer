-- Up Migration

CREATE TABLE "collection_floor_sell_events" (
  "id" BIGSERIAL NOT NULL,
  "kind" "token_floor_sell_event_kind_t" NOT NULL,
  "collection_id" TEXT NOT NULL,
  "contract" BYTEA NOT NULL,
  "token_id" NUMERIC(78, 0) NOT NULL,
  "order_id" TEXT,
  "order_source_id" BYTEA,
  "order_source_id_int" INT,
  "order_valid_between" TSTZRANGE,
  "maker" BYTEA,
  "price" NUMERIC(78, 0),
  "previous_price" NUMERIC(78, 0),
  "tx_hash" BYTEA,
  "tx_timestamp" INT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "collection_floor_sell_events"
  ADD CONSTRAINT "collection_floor_sell_events_pk"
  PRIMARY KEY ("id");

CREATE INDEX "collection_floor_sell_events_created_at_id_index"
  ON "collection_floor_sell_events"("created_at", "id");

CREATE INDEX "collection_floor_sell_events_collection_id_created_at_id_index"
  ON "collection_floor_sell_events"("collection_id", "created_at", "id");

-- Down Migration

DROP TABLE "collection_floor_sell_events";