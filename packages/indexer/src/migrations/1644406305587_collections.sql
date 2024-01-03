-- Up Migration

CREATE TABLE "collections" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "metadata" JSONB,
  "royalties" JSONB,
  "community" TEXT,
  "index_metadata" BOOLEAN,
  "contract" BYTEA NOT NULL,
  "token_id_range" NUMRANGE NOT NULL,
  "token_set_id" TEXT,
  "token_count" INT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now(),
  "last_metadata_sync" TIMESTAMPTZ,
  "minted_timestamp" INT,
  "floor_sell_id" TEXT,
  "floor_sell_value" NUMERIC(78, 0),
  "floor_sell_maker" BYTEA,
  "floor_sell_source_id" BYTEA,
  "floor_sell_source_id_int" INT,
  "floor_sell_valid_between" TSTZRANGE
);

ALTER TABLE "collections"
  ADD CONSTRAINT "collections_pk"
  PRIMARY KEY ("id");

CREATE INDEX "collections_contract_token_id_range_index"
  ON "collections" ("contract", "token_id_range")
  INCLUDE ("id");

CREATE INDEX "collections_community_index"
  ON "collections" ("community");

CREATE INDEX "collections_slug_index"
  ON "collections" ("slug");

CREATE INDEX "collections_created_at_index"
  ON "collections"("created_at");

CREATE INDEX "collections_name_index"
  ON "collections"
  USING GIN ("name" gin_trgm_ops);

CREATE INDEX "collections_minted_timestamp_index"
    ON collections USING btree
    (minted_timestamp DESC NULLS LAST);

CREATE INDEX "collections_updated_at_id_index"
  ON "collections" ("updated_at", "id");

CREATE INDEX "collections_floor_sell_value_index"
  ON "collections" ("floor_sell_value", "id");

CREATE EXTENSION tsm_system_rows;

-- Down Migration

DROP TABLE "collections";