-- Up Migration

CREATE TABLE "erc721c_v2_configs" (
  "contract" BYTEA NOT NULL,
  "transfer_validator" BYTEA NOT NULL, 
  "transfer_security_level" SMALLINT NOT NULL,
  "list_id" INT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "erc721c_v2_configs"
  ADD CONSTRAINT "erc721c_v2_configs_pk"
  PRIMARY KEY ("contract");

CREATE INDEX "erc721c_v2_configs_transfer_validator_index"
  ON "erc721c_v2_configs" ("transfer_validator");


CREATE TABLE "erc721c_v2_lists" (
  "transfer_validator" BYTEA NOT NULL,
  "id" INT NOT NULL,
  "whitelist" JSONB NOT NULL,
  "blacklist" JSONB NOT NULL
);

ALTER TABLE "erc721c_v2_lists"
  ADD CONSTRAINT "erc721c_v2_lists_pk"
  PRIMARY KEY ("transfer_validator", "id");

-- Down Migration

DROP TABLE "erc721c_v2_configs";

DROP TABLE "erc721c_v2_lists";
