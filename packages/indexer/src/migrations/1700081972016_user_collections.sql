-- Up Migration

CREATE TABLE "user_collections" (
  "owner" BYTEA NOT NULL,
  "collection_id" TEXT,
  "contract" BYTEA NOT NULL,
  "token_count" NUMERIC(78, 0) NOT NULL DEFAULT 0,
  "floor_sell_value" NUMERIC(78, 0),
  "total_value" NUMERIC(78, 0),
  "is_spam" INT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE "user_collections"
  ADD CONSTRAINT "user_collections_pk"
  PRIMARY KEY ("owner", "collection_id");

CREATE INDEX "user_collections_contract_owner_total_value_index"
  ON "user_collections" ("owner", "collection_id", "total_value");

-- Down Migration

DROP TABLE "user_collections";