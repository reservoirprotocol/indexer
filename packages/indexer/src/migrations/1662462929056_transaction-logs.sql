-- Up Migration

CREATE TABLE "transaction_logs" (
  "hash" BYTEA NOT NULL,
  "logs" JSONB NOT NULL
);


ALTER TABLE "transaction_logs"
  ADD CONSTRAINT "transaction_logs_pk"
  PRIMARY KEY ("hash");

-- Down Migration

DROP TABLE "transaction_logs";