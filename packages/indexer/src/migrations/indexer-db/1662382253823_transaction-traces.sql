-- Up Migration

CREATE TABLE "transaction_traces" (
  "hash" BYTEA NOT NULL,
  "calls" JSONB NOT NULL
);


ALTER TABLE "transaction_traces"
  ADD CONSTRAINT "transaction_traces_pk"
  PRIMARY KEY ("hash");

-- Down Migration

DROP TABLE "transaction_traces";