-- Up Migration

CREATE TABLE "transaction_logs" (
  "hash" BYTEA NOT NULL,
  "logs" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);


ALTER TABLE "transaction_logs"
  ADD CONSTRAINT "transaction_logs_pk"
  PRIMARY KEY ("hash");

-- Down Migration

DROP TABLE "transaction_logs";