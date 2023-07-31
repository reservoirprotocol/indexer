-- Up Migration

CREATE TABLE "transaction_logs" (
  "hash" BYTEA NOT NULL,
  "address" BYTEA NOT NULL,
  "block_number" BIGINT NOT NULL,
  "block_hash" BYTEA NOT NULL,
  "transaction_index" INTEGER NOT NULL,
  "log_index" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "topics" BYTEA[] NOT NULL,
  "removed" BOOLEAN NOT NULL
);


ALTER TABLE "transaction_logs"
  ADD CONSTRAINT "transaction_logs_pkey" PRIMARY KEY ("hash", "log_index");

-- Down Migration

DROP TABLE "transaction_logs";