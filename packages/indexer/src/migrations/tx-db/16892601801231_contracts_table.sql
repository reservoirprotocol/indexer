-- Up Migration

-- add columns for every field that exists on a transaction receipt but not on a transaction
CREATE TABLE contract_addresses (
  address BYTEA PRIMARY KEY NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deployment_tx_hash BYTEA NOT NULL
  deployment_sender BYTEA NOT NULL,
  deployment_factory BYTEA NOT NULL DEFAULT '0x0'
  bytecode BYTEA NOT NULL DEFAULT '0x0',
);
 
CREATE INDEX contract_addresses_transaction_hash_index
  ON contract_addresses (transaction_hash);

-- Down Migration
DROP TABLE contract_addresses;
