-- Up Migration

CREATE TABLE "sudoswap_v2_pools" (
  "address" BYTEA NOT NULL,
  "nft" BYTEA NOT NULL, 
  "token" BYTEA NOT NULL,
  "bonding_curve" BYTEA NOT NULL,
  "pool_kind" SMALLINT NOT NULL,
  "pair_kind" SMALLINT NOT NULL,
  "property_checker" BYTEA NOT NULL,
  "token_id" NUMERIC(78, 0) DEFAULT NULL
);

ALTER TABLE "sudoswap_v2_pools"
  ADD CONSTRAINT "sudoswap_v2_pools_pk"
  PRIMARY KEY ("address");

-- Down Migration

DROP TABLE "sudoswap_v2_pools";