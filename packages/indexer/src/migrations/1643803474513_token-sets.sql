-- Up Migration

CREATE TABLE "token_sets" (
  "id" TEXT NOT NULL,
  "schema_hash" BYTEA NOT NULL,
  "schema" JSONB,
  "metadata" JSONB,
  "collection_id" TEXT,
  "attribute_id" BIGINT,
  "top_buy_id" TEXT,
  "top_buy_value" NUMERIC(78, 0),
  "top_buy_maker" BYTEA,
  "last_buy_timestamp" INT,
  "last_buy_value" NUMERIC(78, 0)
);

ALTER TABLE "token_sets"
  ADD CONSTRAINT "token_sets_pk"
  PRIMARY KEY ("id", "schema_hash");

CREATE INDEX "token_sets_collection_id_top_buy_value_index"
  ON "token_sets" ("collection_id", "top_buy_value" DESC NULLS LAST)
  WHERE ("collection_id" IS NOT NULL);

CREATE INDEX "token_sets_attribute_id_top_buy_value_index"
  ON "token_sets" ("attribute_id", "top_buy_value" DESC NULLS LAST)
  WHERE ("attribute_id" IS NOT NULL);

CREATE TABLE "token_sets_tokens" (
  "token_set_id" TEXT NOT NULL,
  "contract" BYTEA NOT NULL,
  "token_id" NUMERIC(78, 0) NOT NULL
);

ALTER TABLE "token_sets_tokens"
  ADD CONSTRAINT "token_sets_tokens_pk"
  PRIMARY KEY ("token_set_id", "contract", "token_id");

CREATE INDEX "token_sets_tokens_contract_token_id_index"
  ON "token_sets_tokens" ("contract", "token_id")
  INCLUDE ("token_set_id");

-- Down Migration

DROP TABLE "token_sets_tokens";

DROP TABLE "token_sets";