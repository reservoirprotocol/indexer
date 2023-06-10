-- Up Migration

-- add columns for every field that exists on a transaction receipt but not on a transaction
ALTER TABLE indexer_transactions ADD COLUMN "cumulative_gas_used" NUMERIC(78, 0) NOT NULL DEFAULT 0;
ALTER TABLE indexer_transactions ADD COLUMN "contract_address" BYTEA NOT NULL DEFAULT E'\\\\x';
ALTER TABLE indexer_transactions ADD COLUMN "logs_bloom" BYTEA NOT NULL DEFAULT E'\\\\x';
ALTER TABLE indexer_transactions ADD COLUMN "status" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE indexer_transactions ADD COLUMN "transaction_index" NUMERIC(78, 0) NOT NULL DEFAULT 0;

-- Down Migration