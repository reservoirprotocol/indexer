-- Up Migration

CREATE TABLE "sudoswap_pools" (
  "address" BYTEA NOT NULL,
  "nft" BYTEA NOT NULL,
  "token" BYTEA NOT NULL,
  "bonding_curve" BYTEA NOT NULL,
  "pool_kind" SMALLINT NOT NULL,
  "pair_kind" SMALLINT NOT NULL
);

ALTER TABLE "sudoswap_pools"
  ADD CONSTRAINT "sudoswap_pools_pk"
  PRIMARY KEY ("address");

-- Down Migration

DROP TABLE "sudoswap_pools";