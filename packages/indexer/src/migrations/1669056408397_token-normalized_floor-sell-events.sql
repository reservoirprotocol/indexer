-- Up Migration

ALTER TABLE "tokens" ADD COLUMN "normalized_floor_sell_id" TEXT;
ALTER TABLE "tokens" ADD COLUMN "normalized_floor_sell_value" NUMERIC(78, 0);
ALTER TABLE "tokens" ADD COLUMN "normalized_floor_sell_maker" BYTEA;
ALTER TABLE "tokens" ADD COLUMN "normalized_floor_sell_valid_from" INT;
ALTER TABLE "tokens" ADD COLUMN "normalized_floor_sell_valid_to" INT;
ALTER TABLE "tokens" ADD COLUMN "normalized_floor_sell_source_id_int" INT;
ALTER TABLE "tokens" ADD COLUMN "normalized_floor_sell_is_reservoir" BOOLEAN;
ALTER TABLE "tokens" ADD COLUMN "normalized_floor_sell_currency" BYTEA;
ALTER TABLE "tokens" ADD COLUMN "normalized_floor_sell_currency_value" NUMERIC(78, 0);

CREATE INDEX "tokens_collection_id_normalized_floor_sell_value_token_id_index"
ON "tokens" ("collection_id", "normalized_floor_sell_value", "token_id");

CREATE TABLE "token_normalized_floor_sell_events" (
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

ALTER TABLE "token_normalized_floor_sell_events"
  ADD CONSTRAINT "token_normalized_floor_sell_events_pk"
  PRIMARY KEY ("id");

CREATE INDEX "token_normalized_floor_sell_events_created_at_id_index"
  ON "token_normalized_floor_sell_events"("created_at", "id");

CREATE INDEX "token_normalized_floor_sell_events_contract_created_at_id_index"
  ON "token_normalized_floor_sell_events"("contract", "created_at", "id");

-- Down Migration

ALTER TABLE "tokens" DROP COLUMN "normalized_floor_sell_id";
ALTER TABLE "tokens" DROP COLUMN "normalized_floor_sell_value";
ALTER TABLE "tokens" DROP COLUMN "normalized_floor_sell_maker";
ALTER TABLE "tokens" DROP COLUMN "normalized_floor_sell_valid_from";
ALTER TABLE "tokens" DROP COLUMN "normalized_floor_sell_valid_to";
ALTER TABLE "tokens" DROP COLUMN "normalized_floor_sell_source_id_int";
ALTER TABLE "tokens" DROP COLUMN "normalized_floor_sell_is_reservoir";
ALTER TABLE "tokens" DROP COLUMN "normalized_floor_sell_currency";
ALTER TABLE "tokens" DROP COLUMN "normalized_floor_sell_currency_value";

DROP INDEX "tokens_contract_normalized_floor_sell_value_index";

DROP INDEX "tokens_collection_id_normalized_floor_sell_value_token_id_index";

DROP TABLE "token_normalized_floor_sell_events";