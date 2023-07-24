-- Up Migration

CREATE TYPE "contract_kind_t" AS ENUM (
  'erc721',
  'erc1155'
);

CREATE TABLE "contracts" (
  "address" BYTEA NOT NULL,
  "kind" "contract_kind_t" NOT NULL
);

ALTER TABLE "contracts"
  ADD CONSTRAINT "contracts_pk"
  PRIMARY KEY ("address");

-- Down Migration

DROP TABLE "contracts";

DROP TYPE "contract_kind_t";