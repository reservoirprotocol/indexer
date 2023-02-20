-- Up Migration

CREATE TABLE "transactions" (
  "hash" BYTEA NOT NULL,
  "from" BYTEA NOT NULL,
  "to" BYTEA NOT NULL,
  "value" NUMERIC NOT NULL,
  -- Optimization: force the `data` column to be TOASTed
  "data" BYTEA
);

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_pk"
  PRIMARY KEY ("hash");

CREATE INDEX "transactions_to_index"
  ON "transactions" ("to");

-- Down Migration

DROP TABLE "transactions";