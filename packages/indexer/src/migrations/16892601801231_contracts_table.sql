-- Up Migration

-- add columns for every field that exists on a transaction receipt but not on a transaction
CREATE TABLE contract_addresses (
  address BYTEA PRIMARY KEY NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  transaction_hash BYTEA NOT NULL
);
 
CREATE INDEX contract_addresses_transaction_hash_index
  ON contract_addresses (transaction_hash);

-- Down Migration
DROP TABLE contract_addresses;
