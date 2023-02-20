-- Up Migration

CREATE TABLE "collection_top_bid_events" (
  "id" BIGSERIAL NOT NULL,
  "kind" "token_floor_sell_event_kind_t" NOT NULL,
  "collection_id" TEXT NOT NULL,
  "contract" BYTEA NOT NULL,
  "token_set_id" TEXT NOT NULL,
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

ALTER TABLE "collection_top_bid_events"
  ADD CONSTRAINT "collection_top_bid_events_pk"
  PRIMARY KEY ("id");

CREATE INDEX "collection_top_bid_events_created_at_id_index"
  ON "collection_top_bid_events"("created_at", "id");

CREATE INDEX "collection_top_bid_events_collection_id_created_at_id_index"
  ON "collection_top_bid_events"("collection_id", "created_at", "id");

ALTER TABLE "collections" ADD COLUMN "top_buy_id" TEXT;
ALTER TABLE "collections" ADD COLUMN "top_buy_value" NUMERIC(78, 0);
ALTER TABLE "collections" ADD COLUMN "top_buy_maker" BYTEA;
ALTER TABLE "collections" ADD COLUMN "top_buy_source_id_int" INT;
ALTER TABLE "collections" ADD COLUMN "top_buy_valid_between" TSTZRANGE;

-- Down Migration

DROP TABLE "collection_top_bid_events";

ALTER TABLE "collections" DROP COLUMN "top_buy_id";
ALTER TABLE "collections" DROP COLUMN "top_buy_value";
ALTER TABLE "collections" DROP COLUMN "top_buy_maker";
ALTER TABLE "collections" DROP COLUMN "top_buy_source_id_int";
ALTER TABLE "collections" DROP COLUMN "top_buy_valid_between";