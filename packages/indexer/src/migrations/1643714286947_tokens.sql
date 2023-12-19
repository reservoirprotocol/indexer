-- Up Migration
CREATE EXTENSION IF NOT EXISTS hstore;
CREATE TABLE "tokens" (
  "contract" BYTEA NOT NULL,
  "token_id" NUMERIC(78, 0) NOT NULL,
  "name" TEXT,
  "description" TEXT,
  "image" TEXT,
  "media" TEXT,
  "collection_id" TEXT,
  "metadata_indexed" BOOLEAN,
  "attributes" HSTORE,
  "floor_sell_id" TEXT,
  "floor_sell_value" NUMERIC(78, 0),
  "floor_sell_maker" BYTEA,
  "floor_sell_valid_from" INT,
  "floor_sell_valid_to" INT,
  "floor_sell_source_id" BYTEA,
  "floor_sell_source_id_int" INT,
  "floor_sell_is_reservoir" BOOLEAN,
  "top_buy_id" TEXT,
  "top_buy_value" NUMERIC(78, 0),
  "top_buy_maker" BYTEA,
  "last_sell_timestamp" INT,
  "last_sell_value" NUMERIC(78, 0),
  "last_buy_timestamp" INT,
  "last_buy_value" NUMERIC(78, 0),
  "last_metadata_sync" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now(),
  "rarity_score" DOUBLE PRECISION,
  "rarity_rank" INT
);

ALTER TABLE "tokens"
  ADD CONSTRAINT "tokens_pk"
  PRIMARY KEY ("contract", "token_id");

CREATE INDEX "tokens_contract_floor_sell_value_index"
  ON "tokens" ("contract", "floor_sell_value");

CREATE INDEX "tokens_collection_id_contract_token_id_index"
  ON "tokens" ("collection_id", "contract", "token_id");

CREATE INDEX "tokens_collection_id_floor_sell_value_token_id_index"
  ON "tokens" ("collection_id", "floor_sell_value", "token_id");

CREATE INDEX "tokens_collection_id_rarity_rank_token_id_index"
  ON "tokens" ("collection_id", "rarity_rank" DESC NULLS LAST, "token_id");

CREATE INDEX "tokens_collection_id_top_buy_value_token_id_index"
  ON "tokens" ("collection_id", "top_buy_value" DESC NULLS LAST, "token_id" DESC);

CREATE INDEX "tokens_contract_token_id_index"
  ON "tokens" ("contract", "token_id")
  INCLUDE ("floor_sell_value", "top_buy_value");

CREATE INDEX "tokens_updated_at_contract_token_id_index"
  ON "tokens" ("updated_at", "contract", "token_id");

CREATE INDEX "tokens_updated_at_collection_id_token_id_index"
  ON "tokens" ("updated_at", "collection_id", "token_id");

CREATE INDEX "tokens_contract_floor_sell_value_token_id_index"
  ON "tokens" ("contract", "floor_sell_value", "token_id");

CREATE INDEX "tokens_contract_updated_at_token_id_index"
  ON "tokens" ("contract", "updated_at", "token_id");

CREATE INDEX "tokens_contract_rarity_rank_token_id_index"
  ON "tokens" ("contract", "rarity_rank" DESC NULLS LAST, "token_id");

CREATE EXTENSION IF NOT EXISTS btree_gin;

CREATE INDEX "tokens_contract_name_token_id_index"
  ON "tokens" USING GIN ("contract", "name" gin_trgm_ops, "token_id");

-- https://www.lob.com/blog/supercharge-your-postgresql-performance
-- https://klotzandrew.com/blog/posgres-per-table-autovacuum-management
ALTER TABLE "tokens" SET (autovacuum_vacuum_scale_factor = 0.0);
ALTER TABLE "tokens" SET (autovacuum_vacuum_threshold = 5000);
ALTER TABLE "tokens" SET (autovacuum_analyze_scale_factor = 0.0);
ALTER TABLE "tokens" SET (autovacuum_analyze_threshold = 5000);

-- Down Migration

DROP TABLE "tokens";