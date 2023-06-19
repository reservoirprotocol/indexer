-- Up Migration

CREATE TABLE "collectionxyz_pools" (
  "address" BYTEA NOT NULL,
  "nft" BYTEA NOT NULL,
  "token" BYTEA NOT NULL,
  "bonding_curve" BYTEA NOT NULL,
  "pool_variant" SMALLINT NOT NULL,
  "pool_type" SMALLINT NOT NULL
);

ALTER TABLE "collectionxyz_pools"
  ADD CONSTRAINT "collectionxyz_pools_pk"
  PRIMARY KEY ("address");

ALTER TYPE "order_kind_t" ADD VALUE 'collectionxyz';

-- Down Migration

DROP TABLE "collectionxyz_pools";
