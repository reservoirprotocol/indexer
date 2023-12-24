-- Up Migration

CREATE TABLE "erc721c_configs" (
  "contract" BYTEA NOT NULL,
  "transfer_validator" BYTEA NOT NULL, 
  "transfer_security_level" SMALLINT NOT NULL,
  "operator_whitelist_id" INT NOT NULL,
  "permitted_contract_receiver_allowlist_id" INT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "erc721c_configs"
  ADD CONSTRAINT "erc721c_configs_pk"
  PRIMARY KEY ("contract");

CREATE INDEX "erc721c_configs_transfer_validator_index"
  ON "erc721c_configs" ("transfer_validator");

CREATE TABLE "erc721c_operator_whitelists" (
  "transfer_validator" BYTEA NOT NULL,
  "id" INT NOT NULL,
  "whitelist" JSONB NOT NULL
);

ALTER TABLE "erc721c_operator_whitelists"
  ADD CONSTRAINT "erc721c_operator_whitelists_pk"
  PRIMARY KEY ("transfer_validator", "id");

CREATE TABLE "erc721c_permitted_contract_receiver_allowlists" (
  "transfer_validator" BYTEA NOT NULL,
  "id" INT NOT NULL,
  "allowlist" JSONB NOT NULL
);

ALTER TABLE "erc721c_permitted_contract_receiver_allowlists"
  ADD CONSTRAINT "erc721c_permitted_contract_receiver_allowlists_pk"
  PRIMARY KEY ("transfer_validator", "id");

CREATE TABLE "erc721c_verified_eoas" (
  "transfer_validator" BYTEA NOT NULL,
  "address" BYTEA NOT NULL
);

ALTER TABLE "erc721c_verified_eoas"
  ADD CONSTRAINT "erc721c_verified_eoas_pk"
  PRIMARY KEY ("transfer_validator", "address");

-- Down Migration

DROP TABLE "erc721_configs";

DROP TABLE "erc721c_operator_whitelists";

DROP TABLE "erc721c_permitted_contract_receiver_allowlists";

DROP TABLE "erc721c_verified_eoas";