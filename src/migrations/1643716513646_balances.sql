-- Up Migration

CREATE TABLE "nft_balances" (
  "contract" BYTEA NOT NULL,
  "token_id" NUMERIC(78, 0) NOT NULL,
  "owner" BYTEA NOT NULL,
  "amount" NUMERIC(78, 0) NOT NULL
);

ALTER TABLE "nft_balances"
  ADD CONSTRAINT "nft_balances_pk"
  PRIMARY KEY ("contract", "token_id", "owner")
  INCLUDE ("amount");

CREATE INDEX "nft_balances_owner_contract_token_id_index"
  ON "nft_balances" ("owner", "contract", "token_id")
  WHERE ("amount" > 0);

CREATE INDEX "nft_balances_contract_owner_index"
  ON "nft_balances" ("contract", "owner")
  INCLUDE ("amount")
  WHERE ("amount" > 0);

-- https://www.lob.com/blog/supercharge-your-postgresql-performance
-- https://klotzandrew.com/blog/posgres-per-table-autovacuum-management
ALTER TABLE "nft_balances" SET (autovacuum_vacuum_scale_factor = 0.0);
ALTER TABLE "nft_balances" SET (autovacuum_vacuum_threshold = 5000);
ALTER TABLE "nft_balances" SET (autovacuum_analyze_scale_factor = 0.0);
ALTER TABLE "nft_balances" SET (autovacuum_analyze_threshold = 5000);

CREATE TABLE "ft_balances" (
  "contract" BYTEA NOT NULL,
  "owner" BYTEA NOT NULL,
  "amount" NUMERIC(78, 0) NOT NULL
);

ALTER TABLE "ft_balances"
  ADD CONSTRAINT "ft_balances_pk"
  PRIMARY KEY ("contract", "owner");

-- https://www.lob.com/blog/supercharge-your-postgresql-performance
-- https://klotzandrew.com/blog/posgres-per-table-autovacuum-management
ALTER TABLE "ft_balances" SET (autovacuum_vacuum_scale_factor = 0.0);
ALTER TABLE "ft_balances" SET (autovacuum_vacuum_threshold = 5000);
ALTER TABLE "ft_balances" SET (autovacuum_analyze_scale_factor = 0.0);
ALTER TABLE "ft_balances" SET (autovacuum_analyze_threshold = 5000);

-- Down Migration

DROP TABLE "ft_balances";

DROP TABLE "nft_balances";