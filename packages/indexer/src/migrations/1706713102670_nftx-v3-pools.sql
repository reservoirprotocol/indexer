-- Up Migration

ALTER TYPE "order_kind_t" ADD VALUE 'nftx-v3';

CREATE TABLE "nftx_v3_nft_pools" (
  "address" BYTEA NOT NULL,
  "nft" BYTEA NOT NULL,
  "vault_id" INTEGER NOT NULL
);

ALTER TABLE "nftx_v3_nft_pools"
  ADD CONSTRAINT "nftx_v3_nft_pools_pk"
  PRIMARY KEY ("address");

CREATE TYPE "nftx_v3_ft_pool_kind_t" AS ENUM (
  'nftx-v3',
  'sushiswap',
  'uniswap-v3'
);

CREATE TABLE "nftx_v3_ft_pools" (
  "address" BYTEA NOT NULL,
  "token0" BYTEA NOT NULL,
  "token1" BYTEA NOT NULL,
  "pool_kind" "nftx_v3_ft_pool_kind_t" NOT NULL
);

ALTER TABLE "nftx_v3_ft_pools"
  ADD CONSTRAINT "nftx_v3_ft_pools_pk"
  PRIMARY KEY ("address");

-- Down Migration

DROP TABLE "nftx_v3_ft_pools";

DROP TABLE "nftx_v3_nft_pools";