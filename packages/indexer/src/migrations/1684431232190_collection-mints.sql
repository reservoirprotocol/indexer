-- Up Migration

CREATE TYPE "collection_mint_kind_t" AS ENUM (
  'public'
);

CREATE TYPE "collection_mint_status_t" AS ENUM (
  'open',
  'closed'
);

CREATE TABLE "collection_mints" (
  "collection_id" TEXT NOT NULL,
  "kind" "collection_mint_kind_t",
  "status" "collection_mint_status_t",
  "details" JSONB,
  "currency" BYTEA NOT NULL,
  "price" NUMERIC(78, 0) NOT NULL
);

ALTER TABLE "collection_mints"
  ADD CONSTRAINT "collection_mints_pk"
  PRIMARY KEY ("collection_id");

CREATE INDEX "collection_mints_kind_status_price_index"
  ON "collection_mints" ("kind", "status", "price")
  WHERE "kind" = 'public' AND "status" = 'open';

-- Down Migration