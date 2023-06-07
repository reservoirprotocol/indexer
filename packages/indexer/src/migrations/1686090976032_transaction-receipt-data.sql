-- Up Migration

-- add columns for every field that exists on a transaction receipt but not on a transaction
ALTER TABLE indexer_transactions ADD COLUMN "gasUsed" NUMERIC(78, 0) NOT NULL DEFAULT 0;
ALTER TABLE indexer_transactions ADD COLUMN "contractAddress" BYTEA;
ALTER TABLE indexer_transactions ADD COLUMN "logsBloom" BYTEA;
ALTER TABLE indexer_transactions ADD COLUMN "status" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE indexer_transactions ADD COLUMN "logs" BYTEA;
ALTER TABLE indexer_transactions ADD COLUMN "cumulativeGasUsed" NUMERIC(78, 0) NOT NULL DEFAULT 0;
ALTER TABLE indexer_transactions ADD COLUMN "transactionIndex" NUMERIC(78, 0) NOT NULL DEFAULT 0;

-- Down Migration