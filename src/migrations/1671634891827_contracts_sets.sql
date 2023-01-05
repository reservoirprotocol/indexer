-- Up Migration

CREATE TABLE "contracts_sets" (
  "id" BIGSERIAL NOT NULL,
  "contracts_hash" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "contracts_sets"
  ADD CONSTRAINT "contracts_sets_pk"
  PRIMARY KEY ("id");

CREATE UNIQUE INDEX "contracts_sets_collections_hash_unique_index"
  ON "contracts_sets" ("contracts_hash");

CREATE TABLE "contracts_sets_contracts" (
  "contracts_set_id" TEXT NOT NULL,
  "contract" BYTEA NOT NULL
);

ALTER TABLE "contracts_sets_contracts"
  ADD CONSTRAINT "contracts_sets_contracts_pk"
  PRIMARY KEY ("contracts_set_id", "contract");

-- Down Migration

DROP TABLE "contracts_sets_contracts";

DROP TABLE "contracts_sets";