-- Up Migration

ALTER TABLE "collection_mints" DROP CONSTRAINT "collection_mints_pk";

CREATE UNIQUE INDEX "collection_mints_pk" 
  ON "collection_mints" (
    "collection_id",
    "stage",
    (
      CASE
        WHEN "token_id" IS NULL THEN -1::NUMERIC(78, 0)
        ELSE "token_id"
      END
    )
  );

CREATE TABLE "allowlists" (
  "id" TEXT NOT NULL
);

ALTER TABLE "allowlists"
  ADD CONSTRAINT "allowlists_pk"
  PRIMARY KEY ("id");

CREATE TABLE "allowlists_items" (
  "allowlist_id" TEXT NOT NULL,
  "index" INT NOT NULL,
  "address" BYTEA NOT NULL,
  "max_mints" NUMERIC(78, 0),
  "price" NUMERIC(78, 0)
);

ALTER TABLE "allowlists_items"
  ADD CONSTRAINT "allowlists_items_pk"
  PRIMARY KEY ("allowlist_id", "index");

ALTER TABLE "collection_mints" ADD COLUMN "allowlist_id" TEXT;

ALTER TYPE "collection_mint_kind_t" ADD VALUE 'allowlist';

-- Down Migration