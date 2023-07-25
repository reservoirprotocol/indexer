-- Up Migration

CREATE TABLE "contract_addresses" (
  "address" BYTEA PRIMARY KEY NOT NULL UNIQUE,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "deployment_tx_hash" BYTEA NOT NULL,
  "deployment_sender" BYTEA NOT NULL,
  "deployment_factory" BYTEA NOT NULL DEFAULT '0x0',
  "bytecode" BYTEA NOT NULL DEFAULT '0x0'
);
 
CREATE INDEX "contract_addresses_address_index"
  ON "contract_addresses" ("address");

-- Down Migration
DROP TABLE "contract_addresses";
