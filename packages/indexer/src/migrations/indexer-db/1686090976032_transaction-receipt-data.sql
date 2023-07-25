-- Up Migration

-- add columns for every field that exists on a transaction receipt but not on a transaction
ALTER TABLE transactions ADD COLUMN "cumulative_gas_used" NUMERIC(78, 0) NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN "contract_address" BYTEA;
ALTER TABLE transactions ADD COLUMN "logs_bloom" BYTEA;
ALTER TABLE transactions ADD COLUMN "status" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE transactions ADD COLUMN "transaction_index" NUMERIC(78, 0) NOT NULL DEFAULT 0;

-- Down Migration